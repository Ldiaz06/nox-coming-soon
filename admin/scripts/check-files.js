import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

function collect(directory) {
  return readdirSync(directory).flatMap((name) => {
    const target = path.join(directory, name);
    if (name === "node_modules") return [];
    return statSync(target).isDirectory() ? collect(target) : target.endsWith(".js") ? [target] : [];
  });
}

const files = collect(new URL("..", import.meta.url).pathname);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`${files.length} archivos JavaScript verificados.`);
