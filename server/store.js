import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { tierFor, levelFor } from "../shared/game.js";
const scrypt = promisify(scryptCallback);
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    await scrypt(password, salt, 64),
  );
}
export function createStore(
  filename = process.env.DB_PATH || "data/mathvs.db",
) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 1000, xp INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, mode TEXT NOT NULL, discipline TEXT NOT NULL, ranked INTEGER NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS match_players (match_id TEXT NOT NULL REFERENCES matches(id), user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(match_id,user_id));
    CREATE INDEX IF NOT EXISTS match_user_idx ON match_players(user_id);
    CREATE TABLE IF NOT EXISTS question_exposures (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), discipline TEXT NOT NULL, template_id TEXT NOT NULL, question_key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS exposure_user_idx ON question_exposures(user_id,discipline,id);`);
  const publicUser = (row) =>
    row
      ? {
          id: row.id,
          username: row.username,
          rating: row.rating,
          xp: row.xp,
          wins: row.wins,
          games: row.games,
          tier: tierFor(row.rating).name,
          level: levelFor(row.xp),
        }
      : null;
  const user = (id) =>
    publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id));
  return {
    db,
    user,
    publicUser,
    recentQuestions(ids, discipline) {
      if (!ids.length) return [];
      return db
        .prepare(
          `SELECT template_id AS templateId, question_key AS key FROM question_exposures WHERE user_id IN (${ids.map(() => "?").join(",")}) AND discipline=? ORDER BY id ASC`,
        )
        .all(...ids, discipline);
    },
    rememberQuestions(ids, discipline, questions) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const insert = db.prepare(
          "INSERT INTO question_exposures(user_id,discipline,template_id,question_key) VALUES(?,?,?,?)",
        );
        for (const id of ids) {
          for (const q of questions)
            insert.run(id, discipline, q.templateId, q.key);
          db.prepare(
            "DELETE FROM question_exposures WHERE user_id=? AND discipline=? AND id NOT IN (SELECT id FROM question_exposures WHERE user_id=? AND discipline=? ORDER BY id DESC LIMIT 180)",
          ).run(id, discipline, id, discipline);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async register(username, password) {
      const hash = await passwordHash(password);
      const info = db
        .prepare(
          "INSERT INTO users(username,password,created_at) VALUES(?,?,?)",
        )
        .run(username, hash, Date.now());
      return user(Number(info.lastInsertRowid));
    },
    async login(username, password) {
      const row = db
        .prepare("SELECT * FROM users WHERE username=?")
        .get(username);
      // Always perform a password hash to avoid a trivial username timing oracle.
      const fallback = "00000000000000000000000000000000:" + "00".repeat(64);
      const valid = await passwordMatches(password, row?.password || fallback);
      return valid && row ? publicUser(row) : null;
    },
    newSession(userId) {
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        hashToken(token),
        userId,
        Date.now() + 30 * 86400000,
      );
      return token;
    },
    session(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      const s = db
        .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
        .get(hashToken(token), Date.now());
      return s ? user(s.user_id) : null;
    },
    logout(token) {
      if (token)
        db.prepare("DELETE FROM sessions WHERE token=?").run(hashToken(token));
    },
    leaderboard() {
      return db
        .prepare(
          "SELECT * FROM users WHERE games>0 ORDER BY rating DESC, wins DESC, id ASC LIMIT 50",
        )
        .all()
        .map(publicUser);
    },
    history(userId) {
      return db
        .prepare(
          "SELECT m.payload FROM matches m JOIN match_players p ON p.match_id=m.id WHERE p.user_id=? ORDER BY m.created_at DESC LIMIT 20",
        )
        .all(userId)
        .map((row) => JSON.parse(row.payload));
    },
    saveMatch(result) {
      db.exec("BEGIN IMMEDIATE");
      try {
        if (db.prepare("SELECT id FROM matches WHERE id=?").get(result.id)) {
          db.exec("ROLLBACK");
          return false;
        }
        db.prepare("INSERT INTO matches VALUES(?,?,?,?,?,?)").run(
          result.id,
          result.config.mode,
          result.config.discipline,
          Number(result.ranked),
          Date.now(),
          JSON.stringify(result),
        );
        for (const p of result.players) {
          db.prepare("INSERT INTO match_players VALUES(?,?)").run(
            result.id,
            p.id,
          );
          if (result.ranked)
            db.prepare(
              "UPDATE users SET rating=rating+?,xp=xp+?,wins=wins+?,games=games+1 WHERE id=?",
            ).run(
              p.delta,
              p.forfeit
                ? 0
                : 30 + p.score * 15 + (p.outcome === "win" ? 50 : 0),
              Number(p.outcome === "win"),
              p.id,
            );
        }
        db.exec("COMMIT");
        return true;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
