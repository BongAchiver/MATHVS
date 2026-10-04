import { makeQuestions, publicQuestion, isCorrect } from "../shared/game.js";
export function createPractice(config) {
  const startedAt = Date.now() + 3000;
  return {
    id: `practice-${Date.now()}`,
    config,
    ranked: false,
    offline: true,
    startedAt,
    deadline: startedAt + config.duration * 1000,
    questions: makeQuestions(config),
    answers: [],
    index: 0,
    score: 0,
    done: false,
  };
}
export function practiceSnapshot(p) {
  return {
    ...p,
    question: p.done ? null : publicQuestion(p.questions[p.index]),
    questions:
      p.config.mode === "grand" ? p.questions.map(publicQuestion) : undefined,
    serverNow: Date.now(),
  };
}
function finish(p, now) {
  p.done = true;
  p.result = {
    id: p.id,
    config: p.config,
    ranked: false,
    endedAt: Date.now(),
    questions: p.questions,
    players: [
      {
        id: 0,
        username: "Ты",
        score: p.score,
        elapsed: now - p.startedAt,
        answers: p.answers,
        delta: 0,
        outcome: "practice",
        rating: 0,
      },
    ],
  };
  return p;
}
export function expirePractice(p, now = Date.now()) {
  if (p.done || now < p.deadline) return false;
  if (p.config.mode === "grand") {
    finish(p, p.deadline);
    return true;
  }
  while (!p.done && now >= p.deadline) {
    p.answers.push({ index: p.index, value: "", correct: false });
    p.index++;
    if (p.index === p.questions.length) finish(p, p.deadline);
    else p.deadline += p.config.duration * 1000;
  }
  return true;
}
export function answerPractice(p, index, value) {
  const now = Date.now();
  if (p.done || now < p.startedAt || now >= p.deadline) {
    expirePractice(p, now);
    return;
  }
  if (
    p.answers.some((a) => a.index === index) ||
    !p.questions[index] ||
    (p.config.mode !== "grand" && index !== p.index)
  )
    return;
  const q = p.questions[index];
  if (q.options && !q.options.includes(value)) return;
  const correct = isCorrect(q, value);
  p.answers.push({ index, value, correct });
  if (correct) p.score++;
  if (p.config.mode === "grand")
    p.index = p.questions.findIndex(
      (_, i) => !p.answers.some((a) => a.index === i),
    );
  else p.index++;
  if (p.answers.length === p.questions.length) finish(p, now);
  else if (p.config.mode !== "grand")
    p.deadline = now + p.config.duration * 1000;
}
