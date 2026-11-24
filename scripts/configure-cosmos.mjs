import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const [account, resourceGroup] = process.argv.slice(2);
if (!account || !resourceGroup) {
  throw new Error("Usage: node scripts/configure-cosmos.mjs <account> <resource-group>");
}
const run = (args) => execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const endpoint = run(["cosmosdb", "show", "-n", account, "-g", resourceGroup, "--query", "documentEndpoint", "-o", "tsv"]);
const key = run(["cosmosdb", "keys", "list", "-n", account, "-g", resourceGroup, "--query", "primaryMasterKey", "-o", "tsv"]);
if (!endpoint.startsWith("https://") || !key) throw new Error("Azure did not return valid connection settings.");
let content;
try {
  content = readFileSync(".env.local", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  content = readFileSync(".env.example", "utf8");
}
for (const [name, value] of Object.entries({
  COSMOS_ENDPOINT: endpoint,
  COSMOS_KEY: key,
  COSMOS_DATABASE: "cinevault",
  COSMOS_CONTAINER: "movies",
})) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  content = pattern.test(content) ? content.replace(pattern, () => line) : `${content}\n${line}\n`;
}
writeFileSync(".env.local", content, { mode: 0o600 });
chmodSync(".env.local", 0o600);
console.log("Cosmos settings saved privately in .env.local. Existing TMDB settings preserved.");
