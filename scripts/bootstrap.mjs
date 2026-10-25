import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
if (!existsSync(".env")) {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    ".env",
    `POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://atlas:${password}@127.0.0.1:54339/color_atlas\nAPP_ORIGIN=http://localhost:3017\n`,
    { mode: 0o600 },
  );
}
for (const [cmd, args] of [
  ["docker", ["compose", "up", "-d", "--wait"]],
  ["npm", ["run", "db:setup"]],
]) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  "Ready. Run npm run dev, then open http://localhost:3017. No username or password is needed.",
);
