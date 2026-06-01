import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function requireTypeScriptModule(filePath) {
  const ts = require("typescript");
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filePath,
  }).outputText;

  const module = { exports: {} };
  const localRequire = createRequire(filePath);
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) { ${output}\n })`,
    { filename: filePath }
  );
  wrapper(module.exports, localRequire, module, filePath, path.dirname(filePath));
  return module.exports;
}

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function detectImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function assertImage(buffer, label, expectedMime) {
  const detectedMime = detectImageMime(buffer);
  if (!detectedMime) {
    throw new Error(`${label} is not a valid JPG, PNG, or WEBP byte stream.`);
  }
  if (expectedMime && detectedMime !== expectedMime) {
    throw new Error(`${label} MIME mismatch. Expected ${expectedMime}, got ${detectedMime}.`);
  }
  return detectedMime;
}

function extractMagazineStoragePath(publicUrl) {
  const marker = "/storage/v1/object/public/magazine/";
  const cleanUrl = publicUrl.split("?")[0];
  const index = cleanUrl.indexOf(marker);
  if (index === -1) {
    throw new Error(`Could not extract magazine storage path from ${publicUrl}`);
  }
  return decodeURIComponent(cleanUrl.slice(index + marker.length));
}

loadEnvFile(path.join(repoRoot, "backend", ".env"));

const { uploadMagazineImage, decodeMagazineImageBase64 } = requireTypeScriptModule(
  path.join(repoRoot, "backend", "trpc", "magazine-image.ts")
);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const ctx = { supabase };

const fileArgIndex = process.argv.indexOf("--file");
const sourceFile = fileArgIndex >= 0 ? process.argv[fileArgIndex + 1] : null;
let base64;
let expectedMime;
let sourceLabel;

if (sourceFile) {
  const sourceBuffer = fs.readFileSync(path.resolve(sourceFile));
  expectedMime = assertImage(sourceBuffer, "Source file");
  base64 = sourceBuffer.toString("base64");
  sourceLabel = path.resolve(sourceFile);
} else {
  // Tiny valid JPEG fixture. This keeps the default test deterministic and avoids needing real user media.
  base64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z";
  expectedMime = "image/jpeg";
  sourceLabel = "embedded JPEG fixture";
}

const decoded = decodeMagazineImageBase64(base64, expectedMime);
assertImage(decoded.buffer, "Local decoded fixture", expectedMime);

const sourceId = `smoke-${Date.now()}`;
let publicUrl;
let storagePath;

try {
  publicUrl = await uploadMagazineImage(ctx, "smoke-tests", sourceId, base64, expectedMime);
  storagePath = extractMagazineStoragePath(publicUrl);

  const response = await fetch(publicUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Public URL returned HTTP ${response.status}.`);
  }

  const downloaded = Buffer.from(await response.arrayBuffer());
  assertImage(downloaded, "Downloaded Supabase object", decoded.mimeType);

  const { data: objectInfo, error: listError } = await supabase.storage
    .from("magazine")
    .list(`smoke-tests/${sourceId}`, { limit: 10 });

  if (listError) {
    throw new Error(`Could not list uploaded object: ${listError.message}`);
  }

  const fileName = storagePath.split("/").pop();
  const listed = objectInfo?.find((item) => item.name === fileName);
  if (!listed) {
    throw new Error("Uploaded object was not found in Supabase Storage listing.");
  }

  console.log(JSON.stringify({
    ok: true,
    publicUrl,
    storagePath,
    source: sourceLabel,
    mimeType: decoded.mimeType,
    uploadedBytes: decoded.buffer.length,
    downloadedBytes: downloaded.length,
    contentType: response.headers.get("content-type"),
  }, null, 2));
} finally {
  if (storagePath) {
    const { error } = await supabase.storage.from("magazine").remove([storagePath]);
    if (error) {
      console.warn(`Cleanup warning: ${error.message}`);
    }
  }
}
