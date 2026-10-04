import { randomBytes, randomUUID } from "node:crypto";
import {
  validateConfig,
  makeQuestions,
  publicQuestion,
  isCorrect,
  compareResults,
  ratingChanges,
} from "../shared/game.js";
export class Arena {
  constructor(
    io,
    store,
    { tickMs = 100, countdownMs = 3000, disconnectMs = 20000 } = {},
  ) {
    this.io = io;
    this.store = store;
    this.countdownMs = countdownMs;
    this.disconnectMs = disconnectMs;
    this.queue = new Map();
    this.rooms = new Map();
    this.matches = new Map();
    this.active = new Map();
    this.disconnects = new Map();
    this.timer = setInterval(() => this.tick(), tickMs);
    this.timer.unref();
  }
  close() {
    clearInterval(this.timer);
    for (const timer of this.disconnects.values()) clearTimeout(timer);
  }
  emit(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }
  available(id) {
    if (this.active.has(id)) throw new Error("Сначала завершите текущий матч.");
  }
  connect(userId, requestedId) {
    clearTimeout(this.disconnects.get(userId));
    this.disconnects.delete(userId);
    const match = this.matches.get(this.active.get(userId) || requestedId);
    if (match?.players.some((p) => p.id === userId))
      this.emit(userId, "match:state", this.snapshot(match, userId));
    const q = this.queue.get(userId);
    if (q)
      this.emit(userId, "queue:state", { status: "searching", ...q.config });
  }
  disconnect(userId) {
    this.cancel(userId);
    if (!this.active.has(userId)) return;
    const timer = setTimeout(() => {
      this.disconnects.delete(userId);
      this.forfeit(userId);
    }, this.disconnectMs);
    timer.unref();
    this.disconnects.set(userId, timer);
  }
  cancel(id) {
    this.queue.delete(id);
    for (const [code, r] of this.rooms)
      if (r.host === id) this.rooms.delete(code);
    this.emit(id, "queue:state", { status: "idle" });
  }
  joinQueue(id, raw) {
    this.available(id);
    const config = validateConfig(raw);
    this.cancel(id);
    this.queue.set(id, { config, since: Date.now() });
    this.emit(id, "queue:state", { status: "searching", ...config });
    this.matchQueue();
  }
  matchQueue() {
    const waiting = [...this.queue.entries()];
    for (let i = 0; i < waiting.length; i++) {
      const [id, a] = waiting[i];
      if (!this.queue.has(id)) continue;
      for (let j = i + 1; j < waiting.length; j++) {
        const [other, b] = waiting[j];
        if (
          !this.queue.has(other) ||
          JSON.stringify(a.config) !== JSON.stringify(b.config)
        )
          continue;
        const range =
          150 +
          Math.floor((Date.now() - Math.min(a.since, b.since)) / 1000) * 15;
        if (
          Math.abs(this.store.user(id).rating - this.store.user(other).rating) >
          range
        )
          continue;
        this.queue.delete(id);
        this.queue.delete(other);
        this.start([id, other], a.config, true);
        break;
      }
    }
  }
  createRoom(id, raw) {
    this.available(id);
    const config = validateConfig(raw);
    this.cancel(id);
    let code;
    do {
      code = randomBytes(3).toString("hex").toUpperCase();
    } while (this.rooms.has(code));
    this.rooms.set(code, {
      host: id,
      config,
      expires: Date.now() + 10 * 60000,
    });
    this.emit(id, "queue:state", { status: "room", code, ...config });
    return { code };
  }
  joinRoom(id, rawCode) {
    this.available(id);
    const code =
      typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
    const room = this.rooms.get(code);
    if (!room || room.expires < Date.now())
      throw new Error("Комната не найдена или истекла.");
    if (room.host === id)
      throw new Error("Нужен второй игрок с другим аккаунтом.");
    this.cancel(id);
    this.rooms.delete(code);
    this.start([room.host, id], room.config, false);
  }
  start(ids, config, ranked) {
    const startedAt = Date.now() + this.countdownMs;
    const questions = makeQuestions(config, randomBytes(4).readUInt32LE());
    const m = {
      id: randomUUID(),
      config,
      ranked,
      questions,
      startedAt,
      players: ids.map((id) => ({
        ...this.store.user(id),
        index: 0,
        answers: [],
        score: 0,
        done: false,
        forfeit: false,
        deadline: startedAt + config.duration * 1000,
      })),
    };
    this.matches.set(m.id, m);
    for (const id of ids) {
      this.active.set(id, m.id);
      this.emit(id, "queue:state", { status: "idle" });
    }
    this.broadcast(m);
    return m;
  }
  snapshot(m, id) {
    const me = m.players.find((p) => p.id === id),
      opponent = m.players.find((p) => p.id !== id);
    return {
      id: m.id,
      config: m.config,
      ranked: m.ranked,
      startedAt: m.startedAt,
      serverNow: Date.now(),
      deadline: me.deadline,
      index: me.index,
      question: me.done ? null : publicQuestion(m.questions[me.index]),
      questions:
        m.config.mode === "grand" ? m.questions.map(publicQuestion) : undefined,
      answers: me.answers.map((a) => ({ index: a.index, value: a.value })),
      done: me.done,
      score: me.score,
      opponent: {
        id: opponent.id,
        username: opponent.username,
        rating: opponent.rating,
        score: opponent.score,
        answered: opponent.answers.length,
        done: opponent.done,
      },
      result: m.result || null,
    };
  }
  broadcast(m) {
    for (const p of m.players)
      this.emit(p.id, "match:state", this.snapshot(m, p.id));
  }
  getPlayer(id, matchId) {
    const m = this.matches.get(this.active.get(id));
    if (!m || m.id !== matchId || m.result)
      throw new Error("Матч уже завершён.");
    return [m, m.players.find((p) => p.id === id)];
  }
  answer(id, payload) {
    if (
      !payload ||
      typeof payload.answer !== "string" ||
      payload.answer.length > 64 ||
      !Number.isInteger(payload.index)
    )
      throw new Error("Некорректный ответ.");
    const [m, p] = this.getPlayer(id, payload.matchId);
    const now = Date.now();
    if (now < m.startedAt) throw new Error("Дождитесь старта.");
    if (p.done) throw new Error("Все ответы уже приняты.");
    if (now >= p.deadline) {
      this.expire(m, p, now);
      this.complete(m);
      this.broadcast(m);
      throw new Error("Время истекло.");
    }
    const index = payload.index;
    if (
      index < 0 ||
      index >= m.questions.length ||
      (m.config.mode !== "grand" && index !== p.index) ||
      p.answers.some((a) => a.index === index)
    )
      throw new Error("Ответ на этот вопрос уже принят.");
    const q = m.questions[index];
    if (q.options && !q.options.includes(payload.answer))
      throw new Error("Выберите вариант ответа.");
    const correct = isCorrect(q, payload.answer);
    p.answers.push({ index, value: payload.answer, correct });
    if (correct) p.score++;
    if (m.config.mode === "grand") {
      p.index = m.questions.findIndex(
        (_, i) => !p.answers.some((a) => a.index === i),
      );
      if (p.answers.length === m.questions.length) this.finishPlayer(m, p, now);
    } else {
      p.index++;
      if (p.index >= m.questions.length) this.finishPlayer(m, p, now);
      else p.deadline = now + m.config.duration * 1000;
    }
    this.complete(m);
    this.broadcast(m);
    return { accepted: true };
  }
  finishPlayer(m, p, at) {
    p.done = true;
    p.elapsed = Math.max(0, at - m.startedAt);
  }
  expire(m, p, now) {
    if (p.done || now < p.deadline) return;
    if (m.config.mode === "grand") {
      this.finishPlayer(m, p, p.deadline);
      return;
    }
    while (!p.done && now >= p.deadline) {
      p.answers.push({ index: p.index, value: "", correct: false });
      p.index++;
      if (p.index >= m.questions.length) this.finishPlayer(m, p, p.deadline);
      else p.deadline += m.config.duration * 1000;
    }
  }
  forfeit(id) {
    const m = this.matches.get(this.active.get(id));
    if (!m || m.result) return;
    const p = m.players.find((p) => p.id === id);
    p.forfeit = true;
    this.finishPlayer(m, p, Date.now());
    for (const other of m.players)
      if (!other.done) this.finishPlayer(m, other, Date.now());
    this.complete(m);
    this.broadcast(m);
  }
  complete(m) {
    if (m.result || !m.players.every((p) => p.done)) return;
    const [a, b] = m.players,
      comparison = compareResults(a, b);
    const changes = m.ranked
      ? ratingChanges(a.rating, b.rating, comparison)
      : [0, 0];
    m.result = {
      id: m.id,
      config: m.config,
      ranked: m.ranked,
      endedAt: Date.now(),
      questions: m.questions,
      players: m.players.map((p, i) => ({
        id: p.id,
        username: p.username,
        score: p.score,
        elapsed: p.elapsed,
        forfeit: p.forfeit,
        answers: p.answers,
        rating: p.rating + changes[i],
        delta: changes[i],
        outcome:
          comparison === 0
            ? "draw"
            : (i === 0 ? comparison > 0 : comparison < 0)
              ? "win"
              : "loss",
      })),
    };
    this.store.saveMatch(m.result);
    for (const p of m.players) {
      this.active.delete(p.id);
      clearTimeout(this.disconnects.get(p.id));
      this.disconnects.delete(p.id);
    }
  }
  tick() {
    const now = Date.now();
    this.matchQueue();
    for (const [code, room] of this.rooms)
      if (room.expires < now) {
        this.rooms.delete(code);
        this.emit(room.host, "queue:state", { status: "idle" });
      }
    for (const [id, m] of this.matches) {
      if (m.result) {
        if (now - m.result.endedAt > 30 * 60000) this.matches.delete(id);
        continue;
      }
      if (m.players.some((p) => !p.done && p.deadline <= now)) {
        for (const p of m.players) this.expire(m, p, now);
        this.complete(m);
        this.broadcast(m);
      }
    }
  }
}
