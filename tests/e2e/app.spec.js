import { test, expect } from "@playwright/test";
import { QUESTION_BANKS } from "../../shared/questions/index.js";

test("stereo button sound is gesture-only, does not repeat, and mute survives reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.audioStarts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.audioStarts++;
      window.lastSound = {
        channels: this.buffer.numberOfChannels,
        duration: this.buffer.duration,
      };
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  expect(await page.evaluate(() => window.audioStarts)).toBe(0);
  await page.locator(".mode-card.long").hover();
  expect(await page.evaluate(() => window.audioStarts)).toBe(0);
  await page.locator(".mode-card.long").click();
  await expect.poll(() => page.evaluate(() => window.audioStarts)).toBe(1);
  expect(await page.evaluate(() => window.lastSound)).toEqual({
    channels: 2,
    duration: 0.19,
  });
  // Observe longer than the former soundtrack's beat interval.
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.audioStarts)).toBe(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Выключить звуки кнопок" }).click();
  await expect(
    page.getByRole("button", { name: "Включить звуки кнопок" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await page.locator(".mode-card.blitz").click();
  expect(await page.evaluate(() => window.audioStarts)).toBe(0);
});

test("page switches only under the completed wipe, even on a throttled CPU", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.evaluate(() => {
    window.wipeAnimations = {};
    window.wipeObserver = new MutationObserver(() => {
      const surface = document.querySelector(".transition-surface");
      if (!surface) return;
      const animation = surface.getAnimations()[0];
      if (
        !animation ||
        window.wipeAnimations[animation.animationName] === animation
      )
        return;
      window.wipeAnimations[animation.animationName] = animation;
      animation.pause();
      animation.currentTime = animation.animationName === "wipe-cover" ? 70 : 0;
    });
    window.wipeObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
  await page.getByRole("button", { name: "Рейтинг", exact: true }).click();
  await expect(page.locator(".transition-overlay")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await expect(page.locator(".app-shell")).toHaveClass(/screen-arena/);
  await expect(
    page.getByRole("heading", { name: "СИЛЬНЕЙШИЕ УМЫ." }),
  ).toHaveCount(0);
  // Rapid requests during the cover coalesce to the most recent destination.
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.evaluate(() => window.wipeAnimations["wipe-cover"].finish());
  await expect(page.locator(".transition-overlay")).toHaveAttribute(
    "data-phase",
    "uncover",
  );
  await expect(page.locator(".app-shell")).toHaveClass(/screen-profile/);
  const covered = await page.locator(".transition-surface").evaluate((e) => {
    const r = e.getBoundingClientRect();
    return (
      r.left <= 0 &&
      r.top <= 0 &&
      r.right >= innerWidth &&
      r.bottom >= innerHeight
    );
  });
  expect(covered).toBeTruthy();
  await page.evaluate(() => {
    window.wipeObserver.disconnect();
    window.wipeAnimations["wipe-uncover"].finish();
  });
  await expect(page.locator(".transition-overlay")).toHaveCount(0);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("idle arena schedules no game timer and pointer movement does not mutate the portrait", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.fastIntervals = 0;
    const original = window.setInterval;
    window.setInterval = function (callback, delay, ...args) {
      if (delay <= 250) window.fastIntervals++;
      return original.call(this, callback, delay, ...args);
    };
  });
  await page.goto("/");
  await expect(page.locator(".arena-portrait img")).toBeVisible();
  const before = await page
    .locator(".arena-portrait img")
    .evaluate((e) => getComputedStyle(e).transform);
  await page.mouse.move(100, 170);
  await page.mouse.move(800, 420);
  await page.mouse.move(300, 240);
  expect(
    await page
      .locator(".arena-portrait img")
      .evaluate((e) => getComputedStyle(e).transform),
  ).toBe(before);
  expect(await page.locator(".arena-stage").getAttribute("style")).toBeNull();
  expect(await page.evaluate(() => window.fastIntervals)).toBe(0);
  expect(
    await page
      .locator(".arena-portrait img")
      .evaluate((e) => getComputedStyle(e).filter),
  ).toBe("none");
  await page.locator(".mode-card.long").click();
  await page.getByRole("button", { name: "Начать тренировку" }).click();
  await expect
    .poll(() => page.evaluate(() => window.fastIntervals))
    .toBeGreaterThan(0);
});
test("desktop and mobile arena are responsive with working navigation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ДУМАЙ/ })).toBeVisible();
  await expect(page.locator(".mode-card")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".arena-portrait img").evaluate((image) => image.decode());
  await page
    .locator(".page-view")
    .evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
  await page.screenshot({
    path: "test-results/arena-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Рейтинг", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "СИЛЬНЕЙШИЕ УМЫ." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Арена", exact: true }).click();
  await expect(page.locator(".transition-overlay")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/arena-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Как играть" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("game menu responds to keyboard focus and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".mode-card.blitz").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".mode-card.long")).toBeFocused();
  await expect(page.locator(".brief-name")).toHaveText("Long Call");
  await expect(page.locator(".mode-card.long")).toHaveClass(/selected/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Long Call / Настройка");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Рейтинг", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "СИЛЬНЕЙШИЕ УМЫ." }),
  ).toBeVisible();
  expect(
    await page
      .locator(".page-view")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
});
test("offline Blitz completes and has a full answer review", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".mode-card.blitz").click();
  await page.getByRole("button", { name: "Начать тренировку" }).click();
  for (let i = 0; i < 10; i++) {
    await expect(page.locator(".question-index")).toContainText(
      `${i + 1} / 10`,
    );
    await expect(page.locator(".answer-option").first()).toBeEnabled({
      timeout: 5000,
    });
    await page.locator(".answer-option").first().click();
  }
  await expect(
    page.getByRole("heading", { name: "РАУНД ЗАВЕРШЁН." }),
  ).toBeVisible();
  await page.getByText("Разбор всех заданий").click();
  await expect(page.locator(".review-item")).toHaveCount(10);
  await page.screenshot({
    path: "test-results/blitz-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "На главную", exact: true }).click();
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await expect(page.locator(".history-item")).toHaveCount(1);
});

test("long proof options fit a mobile viewport and offline history survives reload", async ({
  page,
}) => {
  const template = QUESTION_BANKS.linear.find(
    (q) =>
      q.type === "choice" &&
      q.kind === "Доказательство" &&
      q.build().answer.length > 64,
  );
  const proof = template.build();
  await page.addInitScript(
    ({ history }) => {
      if (!localStorage.getItem("mathvs-question-history-v1-linear"))
        localStorage.setItem(
          "mathvs-question-history-v1-linear",
          JSON.stringify(history),
        );
    },
    {
      history: QUESTION_BANKS.linear
        .filter((t) => t.id !== template.id)
        .map((t) => ({ templateId: t.id, key: "already-seen" })),
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".mode-card.blitz").click();
  await page.getByLabel("Дисциплина").selectOption("linear");
  await page.getByRole("button", { name: "Начать тренировку" }).click();
  await expect(page.locator(".question-text")).toHaveText(proof.prompt);
  await expect(page.locator(".question-meta")).toContainText("Доказательство");
  await expect(page.locator(".answer-grid-prose")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/proof-mobile.png",
    fullPage: true,
  });
  await expect(page.locator(".answer-option").first()).toBeEnabled({
    timeout: 5000,
  });
  await page
    .locator(".answer-option")
    .filter({ hasText: proof.answer })
    .click();
  await expect(page.locator(".question-index")).toContainText("2 / 10");
  for (let i = 1; i < 10; i++)
    await page.locator(".answer-option").first().click();
  await expect(page.locator(".result-panel")).toBeVisible();
  const history = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mathvs-question-history-v1-linear")),
  );
  const previous = new Set(history.slice(-10).map((q) => q.templateId));
  await page.reload();
  await page.locator(".mode-card.blitz").click();
  await page.getByLabel("Дисциплина").selectOption("linear");
  await page.getByRole("button", { name: "Начать тренировку" }).click();
  const next = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mathvs-question-history-v1-linear")).slice(
      -10,
    ),
  );
  for (const q of next) expect(previous.has(q.templateId)).toBeFalsy();
});
test("Grand Tour supports arbitrary order and locks accepted answers", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".mode-card.grand").click();
  await page.getByRole("button", { name: "Начать тренировку" }).click();
  await page.locator(".question-tabs button").nth(8).click();
  await expect(page.locator(".answer-input")).toBeEnabled({ timeout: 5000 });
  await page.locator(".answer-input").fill("1/2");
  await page.getByRole("button", { name: "Принять ответ" }).click();
  await expect(page.locator(".answer-input")).toBeDisabled();
  for (let i = 0; i < 8; i++) {
    await page.locator(".question-tabs button").nth(i).click();
    await page.locator(".answer-option").first().click();
  }
  for (const i of [10, 9]) {
    await page.locator(".question-tabs button").nth(i).click();
    await page.locator(".answer-input").fill("0");
    await page.getByRole("button", { name: "Принять ответ" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "РАУНД ЗАВЕРШЁН." }),
  ).toBeVisible();
});
test("cached production application starts a practice with network disabled", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /ДУМАЙ/ })).toBeVisible();
  await page.locator(".mode-card.long").click();
  await page.getByRole("button", { name: "Начать тренировку" }).click();
  await expect(page.locator(".answer-input")).toBeEnabled({ timeout: 5000 });
  await page.locator(".answer-input").fill("0");
  await page.getByRole("button", { name: "Принять ответ" }).click();
  await expect(page.locator(".question-index")).toContainText("2 / 2");
  await page.locator(".answer-input").fill("0");
  await page.getByRole("button", { name: "Принять ответ" }).click();
  await expect(
    page.getByRole("heading", { name: "РАУНД ЗАВЕРШЁН." }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("two browser accounts join a private room and play a complete live match", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const p1 = await a.newPage(),
    p2 = await b.newPage();
  try {
    for (const [page, prefix] of [
      [p1, "Host"],
      [p2, "Guest"],
    ]) {
      await page.goto("/");
      await page.locator(".profile-chip").click();
      await page
        .getByLabel("Никнейм")
        .fill(`${prefix}_${Date.now().toString(36)}`);
      await page
        .getByLabel("Пароль · минимум 8 символов")
        .fill("test-password-123");
      await page
        .getByRole("button", { name: "Создать аккаунт", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator(".mode-card.long").click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "С другом", exact: true })
        .click();
    }
    await p1
      .getByRole("button", { name: "Создать комнату", exact: true })
      .last()
      .click();
    await expect(p1.locator(".room-code")).toBeVisible();
    const code = await p1.locator(".room-code").textContent();
    await p2.getByRole("button", { name: "Ввести код", exact: true }).click();
    await p2.getByLabel("Код комнаты").fill(code);
    await p2.getByRole("button", { name: "Присоединиться" }).click();
    await expect(p1.locator(".game-header h1")).toHaveText("Long Call");
    await expect(p2.locator(".game-header h1")).toHaveText("Long Call");
    await expect(p1.locator(".question-text")).toHaveText(
      await p2.locator(".question-text").textContent(),
    );
    for (const page of [p1, p2]) {
      for (let i = 0; i < 2; i++) {
        await expect(page.locator(".answer-input")).toBeEnabled({
          timeout: 5000,
        });
        await page.locator(".answer-input").fill("0");
        await page.getByRole("button", { name: "Принять ответ" }).click();
      }
    }
    await expect(p1.locator(".result-panel")).toBeVisible();
    await expect(p2.locator(".result-panel")).toBeVisible();
    await p1.screenshot({
      path: "test-results/live-match-result.png",
      fullPage: true,
    });
    await expect(p1.locator(".result-rating")).toHaveCount(0);
    await p1.reload();
    await expect(p1.locator(".profile-chip")).toContainText("Host_");
  } finally {
    await a.close();
    await b.close();
  }
});

test("ranked matchmaking updates profile, leaderboard and history", async ({
  browser,
}) => {
  const contexts = [await browser.newContext(), await browser.newContext()];
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const names = ["RankA", "RankB"].map(
    (n) => `${n}_${Date.now().toString(36)}`,
  );
  try {
    for (let i = 0; i < 2; i++) {
      const page = pages[i];
      await page.goto("/");
      await page.locator(".profile-chip").click();
      await page.getByLabel("Никнейм").fill(names[i]);
      await page
        .getByLabel("Пароль · минимум 8 символов")
        .fill("test-password-123");
      await page
        .getByRole("button", { name: "Создать аккаунт", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator(".mode-card.blitz").click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Рейтинг", exact: true })
        .click();
      await page.getByRole("button", { name: "Найти соперника" }).click();
    }
    for (const page of pages)
      await expect(page.locator(".game-header h1")).toHaveText("Блиц");
    await pages[1].getByRole("button", { name: "Завершить матч" }).click();
    await pages[1]
      .getByRole("dialog")
      .getByRole("button", { name: "Завершить", exact: true })
      .click();
    await expect(
      pages[0].getByRole("heading", { name: "ПОБЕДА." }),
    ).toBeVisible();
    await expect(pages[0].locator(".result-rating")).toContainText("+16 MR");
    await expect(pages[1].locator(".result-rating")).toContainText("-16 MR");
    await pages[0]
      .getByRole("button", { name: "Профиль", exact: true })
      .click();
    await expect(pages[0].locator(".personal-card .rating-big")).toContainText(
      "1 016",
    );
    await expect(pages[0].locator(".history-item").first()).toContainText(
      "+16 MR",
    );
    await pages[0]
      .getByRole("button", { name: "Рейтинг", exact: true })
      .click();
    await expect(pages[0].locator(".leaderboard-table")).toContainText(
      names[0],
    );
  } finally {
    for (const context of contexts) await context.close();
  }
});
