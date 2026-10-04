import { selectQuestions } from "./questions/index.js";
export const DISCIPLINES = {
  calculus: "Матанализ",
  linear: "Линейная алгебра",
  discrete: "Дискретная математика",
};
export const MODES = {
  blitz: { name: "Блиц", label: "BLITZ", count: 10, seconds: 10 },
  long: { name: "Long Call", label: "LONG CALL", count: 2, seconds: 60 },
  grand: { name: "Grand Tour", label: "GRAND TOUR", count: 11, seconds: 300 },
};
export const TIERS = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 1000 },
  { name: "Gold", min: 1200 },
  { name: "Platinum", min: 1450 },
  { name: "Diamond", min: 1750 },
  { name: "Master", min: 2100 },
];
export function tierFor(rating) {
  return [...TIERS].reverse().find((t) => rating >= t.min) || TIERS[0];
}
export function levelFor(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}
export function validateConfig(raw) {
  if (!raw || !MODES[raw.mode] || !DISCIPLINES[raw.discipline])
    throw new Error("Выберите режим и дисциплину.");
  if (raw.mode === "long" && ![30, 60].includes(raw.duration))
    throw new Error("Допустимое время: 30 или 60 секунд.");
  return {
    mode: raw.mode,
    discipline: raw.discipline,
    duration: raw.mode === "long" ? raw.duration : MODES[raw.mode].seconds,
  };
}
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeQuestions(config, seed = Date.now(), history = []) {
  return selectQuestions(config, seededRandom(seed), history);
}
export function publicQuestion({
  answer,
  explanation,
  templateId,
  key,
  ...question
}) {
  return question;
}
export function parseNumeric(value) {
  if (typeof value !== "string" || value.length > 64) return NaN;
  const s = value.trim().replaceAll("−", "-").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?(?:\s*\/\s*[+-]?\d+(?:\.\d+)?)?$/.test(s))
    return NaN;
  const [n, d = "1"] = s.split("/").map(Number);
  return d === 0 ? NaN : n / d;
}
export function isCorrect(question, answer) {
  if (question.type === "choice")
    return (
      typeof answer === "string" &&
      answer === question.answer &&
      question.options.includes(answer)
    );
  const n = parseNumeric(answer);
  return (
    Number.isFinite(n) && Math.abs(n - parseNumeric(question.answer)) < 1e-7
  );
}
export function compareResults(a, b) {
  if (a.forfeit || b.forfeit)
    return a.forfeit === b.forfeit ? 0 : a.forfeit ? -1 : 1;
  if (a.score !== b.score) return a.score > b.score ? 1 : -1;
  // Milliseconds are server-measured; differences below 10ms are treated as ties.
  if (Math.abs(a.elapsed - b.elapsed) < 10) return 0;
  return a.elapsed < b.elapsed ? 1 : -1;
}
export function ratingChanges(a, b, result) {
  if (result === 0) return [0, 0];
  const expected = 1 / (1 + 10 ** ((b - a) / 400));
  const delta = Math.round(32 * ((result > 0 ? 1 : 0) - expected));
  // A zero-sum change also respects the minimum rating of zero.
  const bounded = Math.max(-a, Math.min(b, delta));
  return [bounded, -bounded];
}
