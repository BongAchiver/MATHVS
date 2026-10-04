import { linearBank } from "./linear.js";
import { calculusBank } from "./calculus.js";
import { discreteBank } from "./discrete.js";
import { numberText } from "./helpers.js";

export const QUESTION_BANKS = {
  linear: linearBank,
  calculus: calculusBank,
  discrete: discreteBank,
};
export const QUESTION_HISTORY_LIMIT = 180;
export const BANK_STATS = Object.fromEntries(
  Object.entries(QUESTION_BANKS).map(([discipline, bank]) => [
    discipline,
    {
      templates: bank.length,
      theory: bank.filter((t) => t.type === "choice").length,
      calculations: bank.filter((t) => t.type === "numeric").length,
      topics: [...new Set(bank.map((t) => t.topic))],
    },
  ]),
);

export function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// History contains template IDs and exact authored/parameterized prompts. Option order
// is deliberately excluded, so reshuffling answers never disguises a repeated task.
export function rememberQuestions(history, questions) {
  return [
    ...history,
    ...questions.map((q) => ({ templateId: q.templateId, key: q.key })),
  ].slice(-QUESTION_HISTORY_LIMIT);
}
export function selectQuestions(config, random, history = []) {
  const bank = QUESTION_BANKS[config.discipline],
    used = new Set(),
    topicCount = new Map();
  const records = (Array.isArray(history) ? history : []).filter(
    (h) => h && typeof h.templateId === "string",
  );
  const lastSeen = new Map(records.map((h, i) => [h.templateId, i + 1]));
  const keys = new Set(records.map((h) => h.key));
  const int = (a, b) => a + Math.floor(random() * (b - a + 1)),
    pick = (a) => a[int(0, a.length - 1)];
  const numericCount =
    config.mode === "long" ? 2 : config.mode === "grand" ? 3 : 0;
  const choiceCount =
    config.mode === "blitz" ? 10 : config.mode === "grand" ? 8 : 0;
  // Reserve numeric templates first; Grand Tour cannot repeat one of its calculations
  // in the test. Return the test first to preserve the established mode contract.
  const build = (type) => {
    let candidates = bank.filter(
      (t) => !used.has(t.id) && (type === "choice" || t.type === "numeric"),
    );
    const oldest = Math.min(...candidates.map((t) => lastSeen.get(t.id) || 0));
    candidates = candidates.filter((t) => (lastSeen.get(t.id) || 0) === oldest);
    const leastTopic = Math.min(
      ...candidates.map((t) => topicCount.get(t.topic) || 0),
    );
    const template = pick(
      candidates.filter((t) => (topicCount.get(t.topic) || 0) === leastTopic),
    );
    used.add(template.id);
    topicCount.set(template.topic, (topicCount.get(template.topic) || 0) + 1);
    let q;
    for (let attempt = 0; attempt < 32; attempt++) {
      q = template.build({ int, pick });
      q.key = `${template.id}:${q.prompt}`;
      if (!keys.has(q.key) || template.type === "choice") break;
    }
    q.answer = String(q.answer);
    if (type === "choice") {
      if (!q.options) {
        const [n, d = 1] = q.answer.split("/").map(Number);
        q.options = [
          q.answer,
          ...shuffle([-3, -2, -1, 1, 2, 3, 5, 7], random)
            .slice(0, 3)
            .map((offset) => numberText(n / d + offset)),
        ];
      }
      q.options = shuffle(q.options, random);
    }
    return {
      ...q,
      templateId: template.id,
      topic: template.topic,
      kind: template.kind,
      type,
    };
  };
  const numeric = Array.from({ length: numericCount }, () => build("numeric"));
  const choices = Array.from({ length: choiceCount }, () => build("choice"));
  return [...choices, ...numeric].map((q, id) => ({ ...q, id }));
}
