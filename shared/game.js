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
function shuffle(a, random) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
const fact = (n) => (n < 2 ? 1 : n * fact(n - 1));
const choose = (n, k) => Math.round(fact(n) / fact(k) / fact(n - k));
export function makeQuestions(config, seed = Date.now()) {
  const random = seededRandom(seed),
    int = (a, b) => a + Math.floor(random() * (b - a + 1));
  const build = (index, numeric) => {
    const a = int(2, 7),
      b = int(1, 6),
      c = int(2, 5),
      x = int(1, 4);
    let prompt, answer, explanation;
    const kind = index % 7;
    if (config.discipline === "calculus") {
      if (kind === 0) {
        prompt = `Найди f′(${x}), если f(x) = ${a}x² + ${b}x.`;
        answer = 2 * a * x + b;
        explanation = `f′(x) = ${2 * a}x + ${b}. Подставляем x = ${x}.`;
      }
      if (kind === 1) {
        prompt = `Вычисли ∫ от 0 до ${c} (${a}x + ${b}) dx.`;
        answer = (a * c * c) / 2 + b * c;
        explanation = `Первообразная: ${a}x²/2 + ${b}x. Вычитаем значение в 0 из значения в ${c}.`;
      }
      if (kind === 2) {
        prompt = `Найди lim при x → ${a}: (x² − ${a * a}) / (x − ${a}).`;
        answer = 2 * a;
        explanation = `Сокращаем (x − ${a}), остаётся x + ${a}. Предел равен ${2 * a}.`;
      }
      if (kind === 3) {
        prompt = `Найди f″(x), если f(x) = ${a}x² + ${b}x + ${c}.`;
        answer = 2 * a;
        explanation = `f′(x) = ${2 * a}x + ${b}, f″(x) = ${2 * a}.`;
      }
      if (kind === 4) {
        prompt = `В какой точке x функция f(x) = x² − ${2 * a}x + ${b} достигает минимума?`;
        answer = a;
        explanation = `2x − ${2 * a} = 0, вторая производная положительна.`;
      }
      if (kind === 5) {
        prompt = `Вычисли ∫ от 0 до 1 ${a * 3}x² dx.`;
        answer = a;
        explanation = `Первообразная ${a}x³, значение на [0,1] равно ${a}.`;
      }
      if (kind === 6) {
        prompt = `Найди f′(0), если f(x) = sin(${a}x) + ${b}x.`;
        answer = a + b;
        explanation = `f′(0) = ${a}cos(0) + ${b} = ${a + b}.`;
      }
    } else if (config.discipline === "linear") {
      if (kind === 0) {
        prompt = `Найди определитель матрицы [${a}, ${b}; ${c}, ${x}].`;
        answer = a * x - b * c;
        explanation = `Для матрицы 2×2: ad − bc = ${a * x} − ${b * c}.`;
      }
      if (kind === 1) {
        prompt = `Найди скалярное произведение (${a}, ${b}) и (${c}, ${x}).`;
        answer = a * c + b * x;
        explanation = `Перемножаем соответствующие координаты и складываем: ${a * c} + ${b * x}.`;
      }
      if (kind === 2) {
        prompt = `Найди след матрицы [${a}, ${b}; ${c}, ${x}].`;
        answer = a + x;
        explanation = `След — сумма диагональных элементов: ${a} + ${x}.`;
      }
      if (kind === 3) {
        prompt = `Матрица A = diag(${a}, ${b}). Найди det(A²).`;
        answer = (a * b) ** 2;
        explanation = `det(A²) = det(A)² = (${a} · ${b})².`;
      }
      if (kind === 4) {
        prompt = `Реши систему: x + y = ${a + b}; x − y = ${a - b}. Введи x.`;
        answer = a;
        explanation = `Сложим уравнения: 2x = ${2 * a}, x = ${a}.`;
      }
      if (kind === 5) {
        prompt = `Сколько равен ранг матрицы [${a}, ${2 * a}; ${b}, ${2 * b}]?`;
        answer = 1;
        explanation =
          "Второй столбец вдвое больше первого, первый ненулевой. Ранг равен 1.";
      }
      if (kind === 6) {
        prompt = `Вектор v = (${a}, ${b}, ${c}). Найди квадрат его длины ‖v‖².`;
        answer = a * a + b * b + c * c;
        explanation = `Квадрат длины равен сумме квадратов координат: ${a * a} + ${b * b} + ${c * c}.`;
      }
    } else {
      if (kind === 0) {
        prompt = `Сколько подмножеств у множества из ${a} элементов?`;
        answer = 2 ** a;
        explanation = `Каждый элемент либо входит, либо не входит: 2^${a}.`;
      }
      if (kind === 1) {
        prompt = `Сколько способов выбрать 2 элемента из ${a + 2} без учёта порядка?`;
        answer = choose(a + 2, 2);
        explanation = `C(n,2) = n(n−1)/2 = ${(a + 2) * (a + 1)}/2.`;
      }
      if (kind === 2) {
        prompt = `Сколько рёбер у полного неориентированного графа K${a + 1}?`;
        answer = (a * (a + 1)) / 2;
        explanation = `Каждую пару вершин соединяет одно ребро: n(n−1)/2.`;
      }
      if (kind === 3) {
        prompt = `Сколько перестановок у ${c} различных элементов?`;
        answer = fact(c);
        explanation = `Число перестановок равно ${c}! = ${fact(c)}.`;
      }
      if (kind === 4) {
        prompt = `Сколько битовых строк длины ${a} начинаются с 1?`;
        answer = 2 ** (a - 1);
        explanation = `Первый бит фиксирован, остальные ${a - 1} свободны: 2^${a - 1}.`;
      }
      if (kind === 5) {
        prompt = `|A| = ${a + c}, |B| = ${b + c}, |A ∩ B| = ${c}. Найди |A ∪ B|.`;
        answer = a + b + c;
        explanation = `По формуле включения-исключения: |A| + |B| − |A ∩ B|.`;
      }
      if (kind === 6) {
        prompt = `В дереве ${a + b} вершин. Сколько в нём рёбер?`;
        answer = a + b - 1;
        explanation = `Любое дерево на n вершинах содержит n−1 рёбер.`;
      }
    }
    // Longer problems require several steps, rather than a quick recall fact.
    if (numeric && config.discipline === "calculus") {
      if (kind % 4 === 0) {
        prompt = `Вычисли определённый интеграл: ∫ от 0 до ${c} (3x² + ${2 * a}x + ${b}) dx.`;
        answer = c ** 3 + a * c * c + b * c;
        explanation = `Первообразная x³ + ${a}x² + ${b}x. Подстановка границ даёт ${c ** 3} + ${a * c * c} + ${b * c}.`;
      }
      if (kind % 4 === 1) {
        prompt = `Для f(x) = x³ − ${3 * a * a}x найди значение функции в точке локального минимума.`;
        answer = -2 * a ** 3;
        explanation = `f′(x) = 3x² − ${3 * a * a}. Критические точки ±${a}; f″(${a}) > 0, поэтому минимум при x = ${a}. f(${a}) = ${answer}.`;
      }
      if (kind % 4 === 2) {
        prompt = `Найди сумму бесконечного ряда: ∑ от n=1 до ∞ ${a} / ${c}ⁿ. Введи число или дробь.`;
        answer = a / (c - 1);
        explanation = `Это геометрический ряд с первым членом ${a}/${c} и знаменателем 1/${c}. Сумма равна ${a}/(${c}−1).`;
      }
      if (kind % 4 === 3) {
        prompt = `Найди f′(${x}), если f(x) = (x² + ${a})(${b}x + ${c}).`;
        answer = 2 * x * (b * x + c) + b * (x * x + a);
        explanation = `Правило произведения: f′(x) = 2x(${b}x + ${c}) + ${b}(x² + ${a}). Подставляем ${x}.`;
      }
    }
    if (numeric && config.discipline === "linear") {
      if (kind % 4 === 0) {
        prompt = `Найди det(A), где A = [${a}, ${b}, 1; 0, ${c}, ${x}; 2, 0, ${b}]. Строки матрицы разделены точкой с запятой.`;
        answer = a * c * b + 2 * b * x - 2 * c;
        explanation = `Разложение по первой строке: ${a}·${c * b} − ${b}·(${-2 * x}) + (${-2 * c}) = ${answer}.`;
      }
      if (kind % 4 === 1) {
        prompt = `Реши систему: 2x + y = ${2 * a + b}; x + 3y = ${a + 3 * b}. Введи значение x + y.`;
        answer = a + b;
        explanation = `Из первого уравнения y = ${2 * a + b} − 2x. Подстановка во второе даёт x = ${a}, y = ${b}, сумма ${answer}.`;
      }
      if (kind % 4 === 2) {
        prompt = `A = [${a}, ${b}; 0, ${c}]. Найди след A².`;
        answer = a * a + c * c;
        explanation = `Диагональные элементы A² равны ${a}² и ${c}². След равен ${a * a} + ${c * c}.`;
      }
      if (kind % 4 === 3) {
        prompt = `Вектор u = (${a}, ${b}), v = (${c}, ${x}). Найди коэффициент проекции u на v: (u·v)/(v·v). Можно ввести дробь.`;
        answer = (a * c + b * x) / (c * c + x * x);
        explanation = `Скалярное произведение равно ${a * c + b * x}, квадрат длины v равен ${c * c + x * x}. Коэффициент — их отношение.`;
      }
    }
    if (numeric && config.discipline === "discrete") {
      if (kind % 4 === 0) {
        prompt = `Сколько битовых строк длины ${a + 3} содержат ровно 3 единицы?`;
        answer = choose(a + 3, 3);
        explanation = `Выбираем 3 позиции для единиц из ${a + 3}: C(${a + 3},3) = ${answer}.`;
      }
      if (kind % 4 === 1) {
        prompt = `Сколько сюръективных отображений из множества из ${a} элементов в множество из 2 элементов?`;
        answer = 2 ** a - 2;
        explanation = `Всего 2^${a} отображений. Вычитаем два постоянных отображения: ${2 ** a} − 2.`;
      }
      if (kind % 4 === 2) {
        prompt = `Сколькими способами можно расположить ${c + 2} различных книг, если две определённые книги должны стоять рядом?`;
        answer = 2 * fact(c + 1);
        explanation = `Считаем пару одним блоком: (${c + 1})! перестановок блоков. Внутри пары 2 порядка. Ответ 2·${c + 1}! = ${answer}.`;
      }
      if (kind % 4 === 3) {
        prompt = `На сетке путь из (0,0) в (${a},${b}) состоит только из шагов вправо и вверх. Сколько различных кратчайших путей?`;
        answer = choose(a + b, a);
        explanation = `Всего ${a + b} шагов. Выбираем ${a} позиций для шагов вправо: C(${a + b},${a}) = ${answer}.`;
      }
    }
    let options;
    if (!numeric) {
      const values = new Set([answer]);
      for (const offset of shuffle([-3, -2, -1, 1, 2, 3, 5, 7], random)) {
        if (values.size === 4) break;
        values.add(answer + offset);
      }
      options = shuffle([...values].map(String), random);
    }
    return {
      id: index,
      prompt,
      answer: String(answer),
      explanation,
      options,
      type: numeric ? "numeric" : "choice",
    };
  };
  // Randomized template order; same seed gives identical tasks to both players.
  const offset = int(0, 6);
  return Array.from({ length: MODES[config.mode].count }, (_, i) => ({
    ...build(
      i + offset,
      config.mode === "long" || (config.mode === "grand" && i >= 8),
    ),
    id: i,
  }));
}
export function publicQuestion({ answer, explanation, ...question }) {
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
  const n = parseNumeric(answer);
  return Number.isFinite(n) && Math.abs(n - Number(question.answer)) < 1e-7;
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
