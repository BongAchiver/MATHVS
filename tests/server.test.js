import test from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { createApplication } from "../server/index.js";
import { createStore } from "../server/store.js";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUESTION_BANKS } from "../shared/questions/index.js";
const config = { mode: "long", discipline: "linear", duration: 30 };
const once = (socket, name, predicate = () => true) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timeout: ${name}`));
    }, 8000);
    function listener(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(name, listener);
      resolve(payload);
    }
    socket.on(name, listener);
  });
const send = (s, name, payload) =>
  new Promise((resolve) => s.emit(name, payload, resolve));
async function fixture(t) {
  const app = createApplication({
    dbPath: ":memory:",
    arenaOptions: { countdownMs: 0, tickMs: 20, disconnectMs: 60 },
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const sockets = [];
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });
  async function register(username) {
    const res = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "strong-password" }),
    });
    assert.equal(res.status, 200);
    const user = (await res.json()).user,
      cookie = res.headers.get("set-cookie").split(";")[0];
    const socket = io(url, {
      extraHeaders: { Cookie: cookie },
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    await once(socket, "connect");
    return { user, cookie, socket };
  }
  return { ...app, url, register };
}
test("online selection remembers both players, including forfeits; proof text over 64 characters is accepted", async (t) => {
  const f = await fixture(t),
    a = await f.register("theoryA"),
    b = await f.register("theoryB"),
    c = await f.register("theoryC");
  const cfg = { mode: "blitz", discipline: "linear", duration: 10 };
  const first = f.arena.start([a.user.id, b.user.id], cfg, false);
  const seen = new Set(first.questions.map((q) => q.templateId));
  f.arena.forfeit(a.user.id);
  const second = f.arena.start([b.user.id, c.user.id], cfg, false);
  for (const q of second.questions) {
    assert.ok(!seen.has(q.templateId));
    seen.add(q.templateId);
  }
  f.arena.forfeit(b.user.id);
  const third = f.arena.start([a.user.id, c.user.id], cfg, false);
  for (const q of third.questions) assert.ok(!seen.has(q.templateId));
  const template = QUESTION_BANKS.linear.find(
    (q) =>
      q.type === "choice" &&
      q.kind === "Доказательство" &&
      q.build().answer.length > 64,
  );
  const proof = { ...template.build(), type: "choice", id: 0 };
  assert.ok(proof.answer.length > 64);
  third.questions[0] = proof;
  const response = await send(a.socket, "match:answer", {
    matchId: third.id,
    index: 0,
    answer: proof.answer,
  });
  assert.ok(response.accepted || response.ok, JSON.stringify(response));
  assert.equal(third.players[0].score, 1);
  f.arena.forfeit(c.user.id);
});

test("per-discipline question history persists across reopening and stays bounded", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mathvs-bank-")),
    file = join(dir, "bank.db");
  let store = createStore(file);
  try {
    const a = await store.register("bankUser", "strong-password");
    const qs = Array.from({ length: 240 }, (_, i) => ({
      templateId: `t${i}`,
      key: `question-${i}`,
    }));
    store.rememberQuestions([a.id], "linear", qs);
    store.rememberQuestions([a.id], "calculus", qs.slice(0, 2));
    store.db.close();
    store = createStore(file);
    const history = store.recentQuestions([a.id], "linear");
    assert.equal(history.length, 180);
    assert.deepEqual(
      { ...history[0] },
      { templateId: "t60", key: "question-60" },
    );
    assert.equal(store.recentQuestions([a.id], "calculus").length, 2);
    assert.deepEqual(store.recentQuestions([a.id], "discrete"), []);
  } finally {
    store.db.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        unlinkSync(file + suffix);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    rmdirSync(dir);
  }
});
test("auth validates, blocks foreign origins, keeps passwords and sessions private", async (t) => {
  const f = await fixture(t);
  const request = (path, body, origin) =>
    fetch(f.url + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await request("/api/auth/register", { username: "ab", password: "short" }))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/auth/register",
        { username: "valid", password: "strong-password" },
        "https://evil.test",
      )
    ).status,
    403,
  );
  const a = await f.register("alice");
  assert.equal(a.user.password, undefined);
  assert.equal(
    (
      await request("/api/auth/register", {
        username: "ALICE",
        password: "strong-password",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        username: "alice",
        password: "bad-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        username: "alice",
        password: "strong-password",
      })
    ).status,
    200,
  );
  assert.equal((await fetch(f.url + "/api/history")).status, 401);
  const anon = io(f.url, { forceNew: true, reconnection: false });
  t.after(() => anon.disconnect());
  assert.match((await once(anon, "connect_error")).message, /аккаунт/);
});
test("ranked duel uses server answers, prevents duplicates, persists Elo once", async (t) => {
  const f = await fixture(t),
    a = await f.register("alice"),
    b = await f.register("bob");
  const stateA = once(a.socket, "match:state"),
    stateB = once(b.socket, "match:state");
  assert.ok((await send(a.socket, "queue:join", config)).ok);
  assert.ok((await send(b.socket, "queue:join", config)).ok);
  const sa = await stateA,
    sb = await stateB;
  assert.equal(sa.id, sb.id);
  assert.deepEqual(sa.question, sb.question);
  assert.equal(sa.question.answer, undefined);
  assert.equal(sa.questions, undefined);
  assert.equal(sa.result, null);
  assert.ok((await send(a.socket, "queue:join", config)).error);
  const m = f.arena.matches.get(sa.id);
  const resultA = once(a.socket, "match:state", (s) => !!s.result),
    resultB = once(b.socket, "match:state", (s) => !!s.result);
  const answer = (s, i, value) =>
    send(s, "match:answer", { matchId: sa.id, index: i, answer: value });
  assert.ok((await answer(a.socket, 0, m.questions[0].answer)).ok);
  assert.ok((await answer(a.socket, 0, m.questions[0].answer)).error);
  assert.ok((await answer(a.socket, 1, m.questions[1].answer)).ok);
  assert.ok((await answer(b.socket, 0, "-99999")).ok);
  assert.ok((await answer(b.socket, 1, "-99999")).ok);
  const ra = (await resultA).result;
  await resultB;
  assert.equal(ra.players[0].score, 2);
  assert.equal(ra.players[0].delta, 16);
  assert.equal(f.store.user(a.user.id).rating, 1016);
  assert.equal(f.store.user(b.user.id).rating, 984);
  assert.equal(f.store.user(a.user.id).games, 1);
  assert.equal(f.store.history(a.user.id).length, 1);
  assert.equal(f.store.saveMatch(ra), false);
  assert.equal(f.store.user(a.user.id).games, 1);
  assert.ok((await answer(a.socket, 1, "0")).error);
});
test("private rooms match compatible tasks and never affect ranked stats", async (t) => {
  const f = await fixture(t),
    a = await f.register("host"),
    b = await f.register("friend");
  const { code } = await send(a.socket, "room:create", config);
  assert.match(code, /^[0-9A-F]{6}$/);
  assert.ok((await send(a.socket, "room:join", { code })).error);
  const state = once(a.socket, "match:state");
  assert.ok((await send(b.socket, "room:join", { code })).ok);
  const s = await state;
  assert.equal(s.ranked, false);
  const result = once(b.socket, "match:state", (s) => !!s.result);
  await send(a.socket, "match:forfeit", { matchId: s.id });
  const r = (await result).result;
  assert.equal(r.players.find((p) => p.id === b.user.id).outcome, "win");
  assert.equal(f.store.user(a.user.id).rating, 1000);
  assert.equal(f.store.user(a.user.id).games, 0);
});
test("server expires unanswered tasks and rejects late answers", async (t) => {
  const f = await fixture(t),
    a = await f.register("late"),
    b = await f.register("on_time");
  const m = f.arena.start([a.user.id, b.user.id], config, true);
  const p = m.players[0];
  p.deadline = Date.now() - 31000;
  const reply = await send(a.socket, "match:answer", {
    matchId: m.id,
    index: 0,
    answer: m.questions[0].answer,
  });
  assert.ok(reply.error);
  assert.equal(p.done, true);
  assert.equal(p.score, 0);
  assert.equal(p.answers.length, 2);
  f.arena.forfeit(b.user.id);
  assert.ok(m.result);
});
test("disconnect grace forfeits and queue cancellation removes users", async (t) => {
  const f = await fixture(t),
    a = await f.register("disconnect"),
    b = await f.register("stays");
  await send(a.socket, "queue:join", config);
  await send(a.socket, "queue:cancel", {});
  assert.equal(f.arena.queue.size, 0);
  const m = f.arena.start([a.user.id, b.user.id], config, true);
  const result = once(b.socket, "match:state", (s) => !!s.result);
  a.socket.disconnect();
  const s = await result;
  assert.equal(s.result.id, m.id);
  assert.equal(s.result.players.find((p) => p.id === a.user.id).forfeit, true);
});
test("SQLite survives reopening and expired sessions are rejected", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mathvs-store-test-"));
  const filename = join(directory, "arena.db");
  const s = createStore(filename);
  const u = await s.register("persistent", "strong-password");
  const token = s.newSession(u.id);
  assert.equal(s.session(token).id, u.id);
  s.db.prepare("UPDATE sessions SET expires=0").run();
  assert.equal(s.session(token), null);
  s.db.close();
  const reopened = createStore(filename);
  assert.equal(reopened.user(u.id).username, "persistent");
  assert.equal(
    (await reopened.login("persistent", "strong-password")).id,
    u.id,
  );
  reopened.db.close();
  unlinkSync(filename);
  rmdirSync(directory);
});

test("Grand Tour accepts arbitrary task order, hides solutions until both finish and reconnects", async (t) => {
  const f = await fixture(t),
    a = await f.register("tour_a"),
    b = await f.register("tour_b");
  const m = f.arena.start(
    [a.user.id, b.user.id],
    { mode: "grand", discipline: "discrete", duration: 300 },
    true,
  );
  const before = f.arena.snapshot(m, a.user.id);
  assert.equal(before.questions.length, 11);
  assert.ok(
    before.questions.every(
      (q) => q.answer === undefined && q.explanation === undefined,
    ),
  );
  const finished = once(a.socket, "match:state", (s) => s.done);
  for (const i of [10, 8, 0, 2, 4, 6, 9, 1, 3, 5, 7])
    assert.ok(
      (
        await send(a.socket, "match:answer", {
          matchId: m.id,
          index: i,
          answer: m.questions[i].answer,
        })
      ).ok,
    );
  const waiting = await finished;
  assert.equal(waiting.score, 11);
  assert.equal(waiting.result, null);
  const restored = once(a.socket, "match:state");
  await send(a.socket, "match:sync", { matchId: m.id });
  assert.equal((await restored).answers.length, 11);
  const final = once(a.socket, "match:state", (s) => !!s.result);
  for (let i = 0; i < 11; i++)
    await send(b.socket, "match:answer", {
      matchId: m.id,
      index: i,
      answer: m.questions[i].answer,
    });
  assert.ok(
    (await final).result.questions.every((q) => typeof q.answer === "string"),
  );
  const recoveredFinal = once(a.socket, "match:state");
  await send(a.socket, "match:sync", { matchId: m.id });
  assert.ok((await recoveredFinal).result);
});

test("countdown blocks answers, strangers cannot retrieve a match, and Grand Tour deadline ends the match", async (t) => {
  const f = await fixture(t),
    a = await f.register("early_a"),
    b = await f.register("early_b"),
    outsider = await f.register("outsider");
  const m = f.arena.start(
    [a.user.id, b.user.id],
    { mode: "grand", discipline: "linear", duration: 300 },
    true,
  );
  m.startedAt = Date.now() + 3000;
  assert.ok(
    (
      await send(a.socket, "match:answer", {
        matchId: m.id,
        index: 0,
        answer: m.questions[0].answer,
      })
    ).error,
  );
  assert.ok(
    (
      await send(outsider.socket, "match:answer", {
        matchId: m.id,
        index: 0,
        answer: m.questions[0].answer,
      })
    ).error,
  );
  let leaked = false;
  outsider.socket.on("match:state", () => {
    leaked = true;
  });
  await send(outsider.socket, "match:sync", { matchId: m.id });
  assert.equal(leaked, false);
  m.startedAt = Date.now() - 300000;
  for (const p of m.players) p.deadline = Date.now() - 1;
  const ended = once(a.socket, "match:state", (s) => !!s.result);
  f.arena.tick();
  const result = (await ended).result;
  assert.equal(result.players[0].score, 0);
  assert.equal(result.players[0].outcome, "draw");
  assert.equal(result.players[0].delta, 0);
});
