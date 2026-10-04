import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { Arena } from "./arena.js";
export const cookieToken = (headers) =>
  /(?:^|;\s*)mathvs_session=([a-f0-9]{64})(?:;|$)/.exec(
    headers.cookie || "",
  )?.[1];
export function createApplication({ dbPath, arenaOptions } = {}) {
  const store = createStore(dbPath),
    app = express(),
    server = createServer(app);
  const allowedOrigins = new Set(
    (
      process.env.APP_ORIGIN ||
      "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    )
      .split(",")
      .map((s) => s.trim()),
  );
  const originAllowed = (origin) => !origin || allowedOrigins.has(origin);
  const io = new Server(server, {
    maxHttpBufferSize: 8192,
    allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin)),
  });
  const arena = new Arena(io, store, arenaOptions);
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'", "ws:", "wss:"],
          "font-src": ["'self'"],
          "object-src": ["'none'"],
          "upgrade-insecure-requests":
            process.env.NODE_ENV === "production" &&
            process.env.COOKIE_SECURE === "1"
              ? []
              : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "8kb" }));
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !originAllowed(req.headers.origin)
    )
      return res.status(403).json({ error: "Недопустимый источник запроса." });
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 25,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Слишком много попыток. Попробуйте через 15 минут." },
  });
  const sessionCookie = (token) =>
    `mathvs_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`;
  app.get("/api/health", (_, res) => res.json({ status: "ok" }));
  app.get("/api/me", (req, res) =>
    res.json({ user: store.session(cookieToken(req.headers)) }),
  );
  app.get("/api/leaderboard", (_, res) =>
    res.json({ players: store.leaderboard() }),
  );
  app.get("/api/stats", (_, res) =>
    res.json({ online: io.engine.clientsCount, queued: arena.queue.size }),
  );
  app.post("/api/auth/:action", authLimit, async (req, res) => {
    const { username, password } = req.body || {};
    if (!["register", "login"].includes(req.params.action))
      return res.status(404).json({ error: "Неизвестное действие." });
    if (
      typeof username !== "string" ||
      !/^[\p{L}\p{N}_-]{3,20}$/u.test(username) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    )
      return res.status(400).json({
        error: "Ник: 3–20 букв, цифр, _ или -. Пароль: 8–128 символов.",
      });
    try {
      const user =
        req.params.action === "register"
          ? await store.register(username, password)
          : await store.login(username, password);
      if (!user)
        return res.status(401).json({ error: "Неверный ник или пароль." });
      res.setHeader("Set-Cookie", sessionCookie(store.newSession(user.id)));
      res.json({ user });
    } catch (error) {
      if (error.code?.startsWith("ERR_SQLITE") && /UNIQUE/.test(error.message))
        return res.status(409).json({ error: "Этот ник уже занят." });
      console.error(error);
      res.status(500).json({ error: "Не удалось создать аккаунт." });
    }
  });
  app.post("/api/logout", (req, res) => {
    const token = cookieToken(req.headers);
    store.logout(token);
    for (const socket of io.sockets.sockets.values())
      if (socket.sessionToken === token) socket.disconnect(true);
    res.setHeader(
      "Set-Cookie",
      "mathvs_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    );
    res.json({ ok: true });
  });
  app.get("/api/history", (req, res) => {
    const user = store.session(cookieToken(req.headers));
    if (!user) return res.status(401).json({ error: "Войдите в аккаунт." });
    res.json({ matches: store.history(user.id) });
  });
  io.use((socket, next) => {
    const token = cookieToken(socket.request.headers),
      user = store.session(token);
    if (!user) return next(new Error("Войдите в аккаунт для онлайн-игры."));
    socket.user = user;
    socket.sessionToken = token;
    next();
  });
  io.on("connection", (socket) => {
    const id = socket.user.id;
    socket.join(`user:${id}`);
    arena.connect(id);
    let windowAt = Date.now(),
      requests = 0;
    const handle = (name, fn) =>
      socket.on(name, (payload, ack) => {
        if (typeof ack !== "function") return;
        if (Date.now() - windowAt > 10000) {
          windowAt = Date.now();
          requests = 0;
        }
        if (++requests > 60) return ack({ error: "Слишком много запросов." });
        if (!store.session(socket.sessionToken)) {
          ack({ error: "Сессия истекла." });
          socket.disconnect(true);
          return;
        }
        try {
          ack({ ok: true, ...fn(payload) });
        } catch (error) {
          ack({ error: error.message });
        }
      });
    handle("queue:join", (payload) => arena.joinQueue(id, payload));
    handle("queue:cancel", () => arena.cancel(id));
    handle("room:create", (payload) => arena.createRoom(id, payload));
    handle("room:join", (payload) => arena.joinRoom(id, payload?.code));
    handle("match:answer", (payload) => arena.answer(id, payload));
    handle("match:forfeit", (payload) => {
      arena.getPlayer(id, payload?.matchId);
      arena.forfeit(id);
    });
    handle("match:sync", (payload) => {
      arena.connect(id, payload?.matchId);
    });
    socket.on("disconnect", () => {
      if (!io.sockets.adapter.rooms.get(`user:${id}`)?.size)
        arena.disconnect(id);
    });
  });
  const dist = resolve("dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h" }));
    app.get("/{*path}", (req, res, next) =>
      req.path.startsWith("/api")
        ? next()
        : res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use((_, res) => res.status(404).json({ error: "Не найдено." }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({
      error: err.status === 400 ? "Некорректный JSON." : "Ошибка сервера.",
    });
  });
  const close = async () => {
    arena.close();
    await new Promise((r) => io.close(r));
    if (server.listening) await new Promise((r) => server.close(r));
    store.db.close();
  };
  return { app, server, io, arena, store, close };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const application = createApplication();
  const port = Number(process.env.PORT || 3000);
  application.server.listen(port, "0.0.0.0", () =>
    console.log(`MATHVS listening on http://localhost:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await application.close();
      process.exit(0);
    });
}
