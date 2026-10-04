// Each authored row contains one correct option and three specific misconceptions.
export function theory(prefix, rows) {
  return rows
    .trim()
    .split("\n")
    .map((row, index) => {
      const [topic, kind, prompt, answer, ...rest] = row.trim().split("|");
      const explanation = rest.pop();
      if (
        rest.length !== 3 ||
        !explanation ||
        new Set([answer, ...rest]).size !== 4
      )
        throw new Error(`Invalid question ${prefix}-${index}`);
      return {
        id: `${prefix}-t${index}`,
        topic,
        kind,
        type: "choice",
        build: () => ({
          prompt,
          answer,
          options: [answer, ...rest],
          explanation,
        }),
      };
    });
}
export function calculation(prefix, topic, build) {
  return { id: prefix, topic, kind: "Вычисление", type: "numeric", build };
}
export function result(prompt, answer, explanation) {
  return { prompt, answer: numberText(answer), explanation };
}
export function numberText(value) {
  // All current calculations have rational answers; display a reduced fraction
  // instead of a long rounded decimal, without evaluating user expressions.
  if (Number.isInteger(value)) return String(value);
  for (let denominator = 2; denominator <= 1000; denominator++) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(numerator / denominator - value) < 1e-10)
      return `${numerator}/${denominator}`;
  }
  return String(value);
}
export const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const factorial = (n) => (n < 2 ? 1 : n * factorial(n - 1));
export const choose = (n, k) => factorial(n) / factorial(k) / factorial(n - k);
export function matrixText(a) {
  return `[${a.map((row) => row.join(", ")).join("; ")}]`;
}
export function multiply(a, b) {
  return a.map((row) =>
    b[0].map((_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)),
  );
}
