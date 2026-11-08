import { getDb, onCloudflare } from "./cf";

// Alert state is one small JSON document: on Cloudflare it lives in D1 (table kv, key "alerts"),
// locally in web/data/alerts.json (git-ignored).

export type Watch = {
  id: number;
  kind: "wallet" | "whale";
  address: string;
  label: string | null;
  minUsd: number;
  lastSeenAt: number; // ms timestamp of the newest transfer already handled
  seenTx: string[]; // recent tx hashes at lastSeenAt, to avoid double alerts
  createdAt: number;
};

export type AlertState = {
  ownerChatId: number | null;
  updateOffset: number; // next Telegram update_id to accept (also dedupes webhook retries)
  nextId: number;
  watches: Watch[];
};

const EMPTY: AlertState = { ownerChatId: null, updateOffset: 0, nextId: 1, watches: [] };
const KEY = "alerts";

const parse = (raw: string | null | undefined): AlertState => {
  if (!raw) return { ...EMPTY, watches: [] };
  try {
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY, watches: [] };
  }
};

async function localFile() {
  const path = await import("node:path");
  return path.join(process.cwd(), "data", "alerts.json");
}

export async function loadState(): Promise<AlertState> {
  if (onCloudflare()) {
    const row = await (await getDb()).prepare("SELECT v FROM kv WHERE k = ?").bind(KEY).first<{ v: string }>();
    return parse(row?.v);
  }
  const { readFile } = await import("node:fs/promises");
  return parse(await readFile(await localFile(), "utf8").catch(() => null));
}

export async function saveState(state: AlertState): Promise<void> {
  const json = JSON.stringify(state);
  if (onCloudflare()) {
    await (await getDb())
      .prepare("INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
      .bind(KEY, json, Date.now())
      .run();
    return;
  }
  const { mkdir, rename, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const file = await localFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file + ".tmp", JSON.stringify(state, null, 2));
  await rename(file + ".tmp", file);
}
