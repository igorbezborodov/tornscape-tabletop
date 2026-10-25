// Prisma Studio 7 requires a parseable URL with a `://` scheme, so a relative
// `DATABASE_URL="file:./prisma/dev.db"` is rejected. This launcher converts the
// SQLite path to an absolute `file://` URL and forwards the remaining CLI flags.
import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..");
const extraArgs = process.argv.slice(2);
const rawUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

let url = rawUrl;

if (rawUrl.startsWith("file:")) {
  const filePath = rawUrl.slice("file:".length);
  const isAbsolute = path.isAbsolute(filePath) || filePath.startsWith("/");
  url = pathToFileURL(
    isAbsolute ? filePath : path.resolve(projectRoot, filePath),
  ).href;
}

const child = spawn("npx", ["prisma", "studio", `--url=${url}`, ...extraArgs], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
