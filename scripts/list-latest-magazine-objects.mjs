import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

async function listRecursive(supabase, bucket, prefix = "") {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    throw new Error(`Could not list ${prefix || bucket}: ${error.message}`);
  }

  const items = [];
  for (const item of data || []) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null || !item.metadata) {
      items.push(...await listRecursive(supabase, bucket, fullPath));
    } else {
      items.push({
        path: fullPath,
        size: item.metadata?.size ?? null,
        mimeType: item.metadata?.mimetype ?? item.metadata?.mimeType ?? null,
        createdAt: item.created_at ?? null,
        updatedAt: item.updated_at ?? null,
      });
    }
  }

  return items;
}

loadEnvFile(path.join(repoRoot, "backend", ".env"));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env.");
}

const limitArgIndex = process.argv.indexOf("--limit");
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 10;
const supabase = createClient(supabaseUrl, serviceRoleKey);
const objects = await listRecursive(supabase, "magazine");

objects.sort((a, b) => {
  const aTime = Date.parse(a.updatedAt || a.createdAt || "1970-01-01");
  const bTime = Date.parse(b.updatedAt || b.createdAt || "1970-01-01");
  return bTime - aTime;
});

console.log(JSON.stringify(objects.slice(0, Number.isFinite(limit) ? limit : 10), null, 2));
