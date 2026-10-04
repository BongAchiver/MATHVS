import test from "node:test";
import assert from "node:assert/strict";
import {
  makeQuestions,
  seededRandom,
  parseNumeric,
  isCorrect,
  publicQuestion,
} from "../shared/game.js";
import {
  QUESTION_BANKS,
  BANK_STATS,
  rememberQuestions,
} from "../shared/questions/index.js";

test("all 240 authored templates have complete, unique option sets and bounded payloads", () => {
  for (const [discipline, bank] of Object.entries(QUESTION_BANKS)) {
    assert.equal(bank.length, 80);
    assert.equal(new Set(bank.map((t) => t.id)).size, 80);
    assert.equal(BANK_STATS[discipline].theory, 60);
    assert.equal(BANK_STATS[discipline].calculations, 20);
    for (const template of bank)
      for (let seed = 0; seed < 40; seed++) {
        const random = seededRandom(seed),
          int = (a, b) => a + Math.floor(random() * (b - a + 1));
        const q = template.build({ int, pick: (a) => a[int(0, a.length - 1)] });
        assert.ok(q.prompt && q.explanation, template.id);
        if (q.options) {
          assert.equal(new Set(q.options).size, 4, template.id);
          assert.ok(q.options.includes(q.answer), template.id);
          for (const option of q.options) assert.ok(option.length <= 2048);
        } else assert.ok(Number.isFinite(parseNumeric(q.answer)), template.id);
      }
  }
});

test("a full Blitz rotation covers every template once; exhaustion and mixed modes remain valid", () => {
  for (const discipline of Object.keys(QUESTION_BANKS)) {
    let history = [],
      seen = new Set();
    for (let seed = 0; seed < 8; seed++) {
      const qs = makeQuestions({ mode: "blitz", discipline }, seed, history);
      for (const q of qs) {
        assert.ok(!seen.has(q.templateId));
        seen.add(q.templateId);
      }
      history = rememberQuestions(history, qs);
    }
    assert.equal(seen.size, 80);
    for (let seed = 8; seed < 90; seed++) {
      const mode = ["long", "grand", "blitz"][seed % 3];
      const qs = makeQuestions({ mode, discipline }, seed, history);
      assert.equal(new Set(qs.map((q) => q.templateId)).size, qs.length);
      const previous = new Set(history.slice(-11).map((q) => q.templateId));
      for (const q of qs)
        assert.ok(
          !previous.has(q.templateId),
          `${discipline}: ${q.templateId}`,
        );
      assert.deepEqual(qs, makeQuestions({ mode, discipline }, seed, history));
      history = rememberQuestions(history, qs);
      assert.ok(history.length <= 180);
    }
  }
});

test("choice answers are exact authored strings; numeric fractions remain equivalent and secrets stay private", () => {
  const q = {
    type: "choice",
    answer: "∀ε>0 ∃N",
    options: ["∀ε>0 ∃N", "∃ε>0 ∀N", "0", "1"],
    templateId: "hidden",
    key: "hidden",
    explanation: "secret",
  };
  assert.ok(isCorrect(q, q.answer));
  for (const bad of ["0", " ∀ε>0 ∃N", null, 1])
    assert.equal(isCorrect(q, bad), false);
  assert.ok(isCorrect({ type: "numeric", answer: "1/2" }, "0,5"));
  for (const key of ["answer", "explanation", "templateId", "key"])
    assert.equal(publicQuestion(q)[key], undefined);
});

function build(id, seed) {
  const template = Object.values(QUESTION_BANKS)
    .flat()
    .find((t) => t.id === id);
  const random = seededRandom(seed),
    int = (a, b) => a + Math.floor(random() * (b - a + 1));
  return template.build({ int, pick: (a) => a[int(0, a.length - 1)] });
}
function matrix(prompt) {
  return prompt
    .match(/\[([^\]]+)\]/)[1]
    .split(";")
    .map((row) => row.split(",").map((x) => Number(x.replaceAll("−", "-"))));
}
test("generated graph counts agree with independent enumeration of edges, walks and triangles", () => {
  for (let seed = 0; seed < 100; seed++)
    for (const id of [
      "discrete-adjacency-edges",
      "discrete-walks2",
      "discrete-triangles",
    ]) {
      const q = build(id, seed),
        a = matrix(q.prompt);
      let expected = 0;
      if (id.endsWith("edges"))
        for (let i = 0; i < 5; i++)
          for (let j = i + 1; j < 5; j++) if (a[i][j]) expected++;
      if (id.endsWith("walks2"))
        for (let mid = 0; mid < 5; mid++)
          if (a[0][mid] && a[mid][4]) expected++;
      if (id.endsWith("triangles"))
        for (let i = 0; i < 5; i++)
          for (let j = i + 1; j < 5; j++)
            for (let k = j + 1; k < 5; k++)
              if (a[i][j] && a[j][k] && a[k][i]) expected++;
      assert.equal(parseNumeric(q.answer), expected, q.prompt);
    }
});
test("group orders and modular inverses agree with repeated operations", () => {
  for (let seed = 0; seed < 100; seed++) {
    const q = build("linear-order", seed),
      [, k, n] = q.prompt.match(/класса (\d+).*ℤ\/(\d+)ℤ/).map(Number);
    let sum = 0,
      order = 0;
    do {
      sum = (sum + k) % n;
      order++;
    } while (sum !== 0);
    assert.equal(parseNumeric(q.answer), order);
    const inv = build("linear-inverse", seed),
      [, a, p] = inv.prompt.match(/к (\d+) по модулю (\d+)/).map(Number);
    assert.equal((a * parseNumeric(inv.answer)) % p, 1);
  }
});
test("operator infinity norms agree with the maximum on all vertices of the unit square", () => {
  for (let seed = 0; seed < 100; seed++) {
    const q = build("calculus-operator-norm", seed),
      a = matrix(q.prompt);
    let maximum = 0;
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        maximum = Math.max(
          maximum,
          ...a.map((row) => Math.abs(row[0] * x + row[1] * y)),
        );
    assert.equal(parseNumeric(q.answer), maximum);
  }
});
