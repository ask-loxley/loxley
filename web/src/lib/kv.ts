// Tiny JSON key-value store: D1's kv table on Cloudflare, files under web/data/ locally.

import { getDb, onCloudflare } from "./cf";

async function localPath(key: string) {
  const path = await import("node:path");
  return path.join(process.cwd(), "data", `kv-${key.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    if (onCloudflare()) {
      const row = await (await getDb()).prepare("SELECT v FROM kv WHERE k = ?").bind(key).first<{ v: string }>();
      return row ? (JSON.parse(row.v) as T) : null;
    }
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(await localPath(key), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  if (onCloudflare()) {
    await (await getDb())
      .prepare("INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
      .bind(key, json, Date.now())
      .run();
    return;
  }
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const file = await localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, json);
}
