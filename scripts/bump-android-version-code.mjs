import fs from "node:fs";
import path from "node:path";

const appJsonPath = path.resolve("app.json");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const current = Number(appJson?.expo?.android?.versionCode || 0);
const nextArg = process.argv.find((arg) => arg.startsWith("--to="));
const next = nextArg ? Number(nextArg.slice("--to=".length)) : current + 1;

if (!Number.isInteger(next) || next <= current) {
  throw new Error(`Next versionCode must be an integer greater than ${current}. Received: ${nextArg || next}`);
}

appJson.expo = appJson.expo || {};
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.versionCode = next;

fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
console.log(`Android versionCode updated: ${current} -> ${next}`);
