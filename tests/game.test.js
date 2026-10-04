import test from "node:test";
import assert from "node:assert/strict";
import {
  DISCIPLINES,
  validateConfig,
  makeQuestions,
  publicQuestion,
  parseNumeric,
  isCorrect,
  compareResults,
  ratingChanges,
  tierFor,
  levelFor,
} from "../shared/game.js";
test("all modes generate deterministic, solvable tasks without duplicate choices", () => {
  for (const discipline of Object.keys(DISCIPLINES))
    for (const mode of ["blitz", "long", "grand"])
      for (let seed = 0; seed < 100; seed++) {
        const config = validateConfig({ mode, discipline, duration: 30 });
        const questions = makeQuestions(config, seed);
        assert.deepEqual(questions, makeQuestions(config, seed));
        assert.equal(
          questions.length,
          mode === "blitz" ? 10 : mode === "long" ? 2 : 11,
        );
        for (const q of questions) {
          assert.ok(q.prompt && q.explanation);
          assert.ok(isCorrect(q, q.answer));
          assert.equal(publicQuestion(q).answer, undefined);
          assert.equal(publicQuestion(q).explanation, undefined);
          if (q.options) {
            assert.equal(new Set(q.options).size, 4);
            assert.ok(q.options.includes(q.answer));
          }
        }
        if (mode === "grand")
          assert.equal(questions.filter((q) => q.type === "numeric").length, 3);
      }
});
test("numeric answers support decimal commas and fractions but never expressions or code", () => {
  assert.equal(parseNumeric(" −3,5 "), -3.5);
  assert.equal(parseNumeric("3/2"), 1.5);
  for (const bad of [
    "Infinity",
    "1/0",
    "",
    "alert(1)",
    "1+1",
    "NaN",
    "0x10",
    "1e2",
    "1/2/3",
  ])
    assert.ok(Number.isNaN(parseNumeric(bad)));
});
test("score has priority, speed breaks ties, forfeits lose and ties are zero-sum", () => {
  assert.equal(
    compareResults({ score: 7, elapsed: 10000 }, { score: 6, elapsed: 3000 }),
    1,
  );
  assert.equal(
    compareResults({ score: 7, elapsed: 10000 }, { score: 7, elapsed: 9000 }),
    -1,
  );
  assert.equal(
    compareResults({ score: 7, elapsed: 10000 }, { score: 7, elapsed: 10005 }),
    0,
  );
  assert.equal(
    compareResults(
      { score: 10, elapsed: 100, forfeit: true },
      { score: 0, elapsed: 9999 },
    ),
    -1,
  );
  assert.deepEqual(ratingChanges(1000, 1000, 1), [16, -16]);
  assert.deepEqual(ratingChanges(1800, 1000, 0), [0, 0]);
  for (const a of [0, 5, 1000, 2000])
    for (const b of [0, 5, 1000, 2000])
      for (const result of [-1, 0, 1]) {
        const [x, y] = ratingChanges(a, b, result);
        assert.equal(x + y, 0);
        assert.ok(a + x >= 0 && b + y >= 0);
      }
});
test("tiers, levels and invalid configurations", () => {
  assert.equal(tierFor(1000).name, "Silver");
  assert.equal(tierFor(2100).name, "Master");
  assert.equal(levelFor(400), 3);
  assert.throws(() => validateConfig({ mode: "oops", discipline: "linear" }));
  assert.throws(() =>
    validateConfig({ mode: "long", discipline: "calculus", duration: 45 }),
  );
});
