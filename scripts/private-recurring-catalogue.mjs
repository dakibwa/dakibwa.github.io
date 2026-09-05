// Outputs only to the receiving secret installer. Never run without piping it
// to Wrangler; the owner file lives outside this public repository.
import { readFileSync } from "node:fs";
const file = process.argv[2];
if (!file || process.stdout.isTTY) throw new Error("Provide the private owner file and pipe directly to the secret installer.");
const rows = [...readFileSync(file, "utf8").matchAll(/^\| (60|90) \| €(\d+) \| ([A-Z]{4}\d{2}) \|$/gm)]
  .map(([, duration, price, code]) => ({ duration: Number(duration), cents: Number(price) * 100, code }));
if (rows.length !== 22 || new Set(rows.map((row) => row.code.slice(0, 4))).size !== 22) throw new Error("Invalid private catalogue.");
process.stdout.write(JSON.stringify(rows));
