import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const { IMAGE_DIGEST, BUILD_NUMBER, COMMIT_SHA } = process.env;
if (
  !/^sha256:[a-f0-9]{64}$/.test(IMAGE_DIGEST || "") ||
  !/^\d+$/.test(BUILD_NUMBER || "") ||
  !/^[a-f0-9]{40}$/.test(COMMIT_SHA || "")
) {
  throw new Error(
    "Expected IMAGE_DIGEST, BUILD_NUMBER and COMMIT_SHA from GitHub Actions.",
  );
}
const tag = `build-${BUILD_NUMBER}-${COMMIT_SHA.slice(0, 7)}`;
const source = `ghcr.io/bongachiver/mathvs@${IMAGE_DIGEST}`;
const localImage = `mathvs:${tag}`;
function docker(...args) {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed`);
}
await mkdir("release", { recursive: true });
docker("pull", source);
docker("tag", source, localImage);
docker("save", "--output", "release/mathvs-image.tar", localImage);
await pipeline(
  createReadStream("release/mathvs-image.tar"),
  createGzip({ level: 6 }),
  createWriteStream("release/mathvs-image.tar.gz"),
);
await unlink("release/mathvs-image.tar");
const template = await readFile("deploy/compose.release.yaml", "utf8");
await writeFile(
  "release/compose.yaml",
  template.replace("IMAGE_PLACEHOLDER", localImage),
);
await writeFile("release/.env.example", await readFile(".env.example"));
await writeFile(
  "release/RELEASE.md",
  `# MATHVS ${tag}

Готовый Docker-образ **Linux amd64**. Работает на Linux и через Docker Desktop с Linux containers на Windows/macOS Intel. Нужны Docker и Docker Compose v2. Архив уже содержит frontend и backend; Node.js и сборка исходников на вашей машине не требуются.

Коммит: \`${COMMIT_SHA}\`.
Исходный образ: \`${source}\`.

Скачайте **mathvs-image.tar.gz**, **compose.yaml** и **.env.example** в одну папку. При необходимости скопируйте .env.example в .env и настройте порт и домен.

\`\`\`sh
docker load --input mathvs-image.tar.gz
docker compose up -d
\`\`\`

Откройте **http://localhost:3000**. Рейтинг и аккаунты сохраняются в Docker volume. Проверка: \`docker compose ps\`; журнал: \`docker compose logs -f mathvs\`.

Обновление: загрузите образ нового Release и замените compose.yaml, затем выполните \`docker compose up -d\`. Постоянное имя проекта mathvs сохраняет тот же том базы. Не используйте \`docker compose down -v\`, если хотите сохранить аккаунты.

SHA256SUMS содержит контрольные суммы всех файлов. На Linux: \`sha256sum -c SHA256SUMS\`. На Windows можно сравнить результат \`Get-FileHash mathvs-image.tar.gz -Algorithm SHA256\` с SHA256SUMS.

Образ также опубликован в GHCR. Публичное развёртывание требует своего сервера, HTTPS и APP_ORIGIN; сборка Release не размещает сайт на отдельном сервере автоматически.
`,
);
const files = [
  "mathvs-image.tar.gz",
  "compose.yaml",
  ".env.example",
  "RELEASE.md",
];
const sums = [];
for (const file of files) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(`release/${file}`))
    hash.update(chunk);
  sums.push(`${hash.digest("hex")}  ${file}`);
}
await writeFile("release/SHA256SUMS", sums.join("\n") + "\n");
console.log(`Release bundle ready: ${tag}`);
