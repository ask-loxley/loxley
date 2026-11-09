import { runAgent } from "./agent";
import { airdropScore } from "./airdrop";
import { auditContract } from "./audit";
import { loxleyToken } from "./token";
import { devOutgoing, findDeployer } from "./devwatch";
import { chainCalendar } from "./calendar";
import { loadState, saveState, type AlertState, type Watch } from "./alertStore";
import { EXPLORER_URL, getToken, getTokenTransfers, getTransfersOfToken, isAddress, type TokenTransfer } from "./blockscout";
import { coinId, currentPrices } from "./prices";
import { escapeHtml, getUpdates, markdownToTelegram, sendMessage, sendTyping, type TgUpdate } from "./telegram";

const MAX_WATCHES = 10;
const ZERO = "0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// Both loops read and write the same file, so every state change goes through this lock.
let lock: Promise<unknown> = Promise.resolve();
function withState<T>(fn: (s: AlertState) => Promise<T>): Promise<T> {
  const run = lock.then(async () => {
    const state = await loadState();
    const result = await fn(state);
    await saveState(state);
    return result;
  });
  lock = run.catch(() => undefined);
  return run;
}

const toQty = (raw: string | null | undefined, decimals: string | number | null | undefined) => {
  if (!raw) return 0;
  const d = Number(decimals ?? 18);
  try {
    const v = BigInt(raw);
    const base = BigInt(10) ** BigInt(d);
    return Number(v / base) + Number(v % base) / Number(base);
  } catch {
    return 0;
  }
};

const HELP = [
  "<b>Loxley alerts</b>",
  "/watch &lt;wallet&gt; [label] · alert when a wallet trades",
  "/whale &lt;token&gt; [min $] · alert on big buys or sells (default $1,000)",
  "/list · show your watches",
  "/unwatch &lt;id&gt; · stop a watch",
  "/audit &lt;contract&gt; · quick safety check",
  "/airdrop &lt;wallet&gt; · airdrop readiness score",
  "/devwatch &lt;token&gt; · alert when the token's dev sells, moves or burns",
  "/calendar · stock token dividends and splits, new Pons launches",
  "/ca · the official $LOXLEY contract",
  "",
  "Or just ask me anything about Robinhood Chain, like you would on the web app.",
].join("\n");

/* ---------------- commands ---------------- */

async function newestTransfer(kind: Watch["kind"], address: string, dev?: string | null) {
  if (kind === "dev") {
    const items = dev ? await devOutgoing(dev, address) : [];
    return items[0] ? Date.parse(items[0].timestamp) : Date.now();
  }
  const page = kind === "wallet" ? await getTokenTransfers(address, 1) : await getTransfersOfToken(address, 1);
  const newest = page.items[0];
  return newest ? Date.parse(newest.timestamp) : Date.now();
}

async function addWatch(chatId: number, kind: Watch["kind"], args: string[]) {
  const address = (args[0] ?? "").toLowerCase();
  if (!isAddress(address)) {
    return sendMessage(chatId, `Send a full 0x address, e.g. <code>/${kind === "wallet" ? "watch" : kind === "dev" ? "devwatch" : "whale"} 0x…</code>`);
  }
  const minUsd = kind === "whale" ? Math.max(10, Number(args[1]) || 1000) : 0;
  const label = kind === "wallet" ? args.slice(1).join(" ").slice(0, 40) || null : null;

  let symbol: string | null = null;
  let dev: string | null = null;
  if (kind === "dev") {
    const token = await getToken(address);
    if (!token) return sendMessage(chatId, "I couldn't find that token on Robinhood Chain. New tokens can take a few minutes to index.");
    symbol = token.symbol ?? null;
    dev = (await findDeployer(address)).dev?.toLowerCase() ?? null;
    if (!dev) return sendMessage(chatId, "I couldn't identify the wallet that launched this token.");
  }
  if (kind === "whale") {
    const token = await getToken(address);
    if (!token) return sendMessage(chatId, "I couldn't find that token on Robinhood Chain.");
    symbol = token.symbol ?? null;
  }
  const lastSeenAt = await newestTransfer(kind, address, dev);

  const result = await withState(async (s) => {
    if (s.watches.length >= MAX_WATCHES) return "full" as const;
    if (s.watches.some((w) => w.kind === kind && w.address === address)) return "dupe" as const;
    const w: Watch = {
      id: s.nextId++,
      kind,
      address,
      label: label ?? symbol,
      minUsd,
      dev,
      lastSeenAt,
      seenTx: [],
      createdAt: Date.now(),
    };
    s.watches.push(w);
    return w;
  });

  if (result === "full") return sendMessage(chatId, `You already have ${MAX_WATCHES} watches. Remove one with /unwatch first.`);
  if (result === "dupe") return sendMessage(chatId, "You're already watching that.");
  const what =
    kind === "dev"
      ? `the dev of <b>${escapeHtml(result.label ?? short(address))}</b> (<code>${short(dev ?? "")}</code>). I'll ping you when it sells, moves or burns supply.`
      : kind === "wallet"
      ? `wallet <b>${escapeHtml(result.label ?? short(address))}</b>. I'll ping you when it trades.`
      : `<b>${escapeHtml(result.label ?? short(address))}</b> for single buys or sells over ${usd(minUsd)}.`;
  return sendMessage(chatId, `Watch #${result.id} set: ${what}`);
}

async function listWatches(chatId: number) {
  const s = await loadState();
  if (!s.watches.length) return sendMessage(chatId, "No watches yet. Try /watch or /whale.");
  const lines = s.watches.map((w) =>
    w.kind === "dev"
      ? `#${w.id} · dev of ${escapeHtml(w.label ?? short(w.address))} <code>${short(w.dev ?? "")}</code>`
      : w.kind === "wallet"
      ? `#${w.id} · wallet ${escapeHtml(w.label ?? "")} <code>${short(w.address)}</code>`
      : `#${w.id} · whale ${escapeHtml(w.label ?? short(w.address))} · over ${usd(w.minUsd)}`,
  );
  return sendMessage(chatId, ["<b>Your watches</b>", ...lines].join("\n"));
}

async function removeWatch(chatId: number, idArg: string | undefined) {
  const id = Number(idArg);
  const removed = await withState(async (s) => {
    const before = s.watches.length;
    s.watches = s.watches.filter((w) => w.id !== id);
    return before !== s.watches.length;
  });
  return sendMessage(chatId, removed ? `Watch #${id} removed.` : "No watch with that id. See /list.");
}

async function quickAudit(chatId: number, address: string | undefined) {
  if (!address || !isAddress(address)) return sendMessage(chatId, "Usage: <code>/audit 0x…</code>");
  await sendTyping(chatId);
  const r = await auditContract(address);
  const name = r.token?.symbol ? `${r.token.name ?? r.token.symbol} (${r.token.symbol})` : r.name ?? short(r.address);
  const findings = r.findings
    .filter((f) => f.severity !== "info")
    .slice(0, 5)
    .map((f) => `• <b>${f.severity}</b>: ${escapeHtml(f.title)}`);
  return sendMessage(
    chatId,
    [
      `<b>${escapeHtml(name)}</b>`,
      `Score ${r.isContract ? r.score : "–"}/100 · ${r.verdict}`,
      ...(findings.length ? findings : ["No red flags found."]),
      `<a href="${r.explorerUrl}">Explorer</a> · signals, not proof`,
    ].join("\n"),
  );
}

async function quickAirdrop(chatId: number, address: string | undefined) {
  if (!address || !isAddress(address)) return sendMessage(chatId, "Usage: <code>/airdrop 0x…</code>");
  await sendTyping(chatId);
  const r = await airdropScore(address);
  return sendMessage(
    chatId,
    [
      `<b>Airdrop readiness: ${r.score}/100</b> · ${r.tier}`,
      ...r.breakdown.map((b) => `${escapeHtml(b.label)}: ${b.points}/${b.max} · ${escapeHtml(b.detail)}`),
      "",
      "<b>Next steps</b>",
      ...r.nextSteps.map((s) => `• ${escapeHtml(s)}`),
      "",
      "<i>No Robinhood Chain airdrop is announced. Based on past L2 airdrop patterns.</i>",
    ].join("\n"),
  );
}

async function askAgent(chatId: number, text: string) {
  await sendTyping(chatId);
  let answer = "";
  let drafts: { platform: string; text: string }[] = [];
  await runAgent([{ role: "user", content: text.slice(0, 2000) }], (e) => {
    if (e.type === "tool_start") void sendTyping(chatId);
    if (e.type === "tool_result" && e.name === "publish_drafts") {
      const d = e.data as { drafts?: { platform: string; text: string }[] };
      if (Array.isArray(d?.drafts)) drafts = d.drafts;
    }
    if (e.type === "text") answer = e.text;
    if (e.type === "error") answer = `Something went wrong: ${e.message}`;
  });
  // Each draft goes out as its own message so it can be copied or forwarded as-is.
  for (const [i, d] of drafts.entries()) {
    const label = `<i>${d.platform === "x" ? "X post" : "Telegram post"}${drafts.length > 1 ? ` ${i + 1}/${drafts.length}` : ""}</i>`;
    await sendMessage(chatId, `${label}\n${escapeHtml(d.text)}`);
  }
  return sendMessage(chatId, markdownToTelegram(answer || "I couldn't come up with an answer."));
}

async function handleUpdate(u: TgUpdate) {
  const msg = u.message;
  if (!msg?.text || msg.chat.type !== "private") return;
  const chatId = msg.chat.id;
  const [rawCmd, ...args] = msg.text.trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, "");

  // The first person to /start becomes the owner; the bot stays private after that.
  const owner = await withState(async (s) => {
    if (s.ownerChatId == null && cmd === "/start") s.ownerChatId = chatId;
    return s.ownerChatId;
  });
  if (owner !== chatId) {
    return sendMessage(chatId, owner == null ? "Send /start to connect this bot." : "This Loxley bot is private.");
  }

  try {
    switch (cmd) {
      case "/start":
      case "/help":
        return await sendMessage(chatId, HELP);
      case "/watch":
        return await addWatch(chatId, "wallet", args);
      case "/whale":
        return await addWatch(chatId, "whale", args);
      case "/list":
        return await listWatches(chatId);
      case "/unwatch":
        return await removeWatch(chatId, args[0]);
      case "/audit":
        return await quickAudit(chatId, args[0]);
      case "/airdrop":
        return await quickAirdrop(chatId, args[0]);
      case "/devwatch":
        return await addWatch(chatId, "dev", args);
      case "/calendar": {
        await sendTyping(chatId);
        const c = await chainCalendar();
        const ev = c.upcoming.slice(0, 6).map((e) => `${e.date ?? "TBA"} · <b>${escapeHtml(e.symbol)}</b> ${e.kind}: ${escapeHtml(e.detail)}`);
        const ln = c.launches.slice(0, 5).map((l) => `<a href="${l.url}">${escapeHtml(l.symbol)}</a> · ${usd(l.liquidityUsd)} liquidity`);
        return await sendMessage(chatId, [
          "<b>Stock token calendar</b>", ...(ev.length ? ev : ["Nothing scheduled right now."]),
          "", "<b>New on Pons</b>", ...(ln.length ? ln : ["No new launches in the feed."]),
          "", "Dividends are reinvested into the token. New launches are unaudited: try /audit first.",
        ].join("\n"));
      }
      case "/ca": {
        const t = await loxleyToken();
        return await sendMessage(
          chatId,
          t
            ? `<b>Official $LOXLEY contract</b> (Robinhood Chain)
<code>${t.ca}</code>

${t.pons ? `<a href="${t.pons}">Pons</a> · ` : ""}<a href="${t.explorerUrl}">Explorer</a> · <a href="${t.dexscreenerUrl}">Chart</a>

Only this address is official. Not financial advice.`
            : "$LOXLEY has not launched yet. The official contract will be posted only by @askloxleycom on X and on askloxley.com.",
        );
      }
      default:
        if (cmd.startsWith("/")) return await sendMessage(chatId, HELP);
        return await askAgent(chatId, msg.text);
    }
  } catch (err) {
    await sendMessage(chatId, `Sorry, that failed: ${escapeHtml(err instanceof Error ? err.message : "unknown error")}`).catch(
      () => null,
    );
  }
}

/**
 * Webhook mode (Cloudflare): handle one update pushed by Telegram.
 * Telegram retries slow deliveries, so updates at or below the last accepted id are ignored.
 */
export async function processWebhookUpdate(u: TgUpdate) {
  const fresh = await withState(async (s) => {
    if (u.update_id < s.updateOffset) return false;
    s.updateOffset = u.update_id + 1;
    return true;
  });
  if (fresh) await handleUpdate(u);
}

/** One long-poll round: waits up to ~25s for messages and handles them. */
export async function pollCommands() {
  const { updateOffset } = await loadState();
  const updates = await getUpdates(updateOffset);
  if (!updates.length) return;
  await withState(async (s) => {
    s.updateOffset = updates[updates.length - 1].update_id + 1;
  });
  for (const u of updates) await handleUpdate(u);
}

/* ---------------- watch checks ---------------- */

/** Transfers newer than what this watch already handled, oldest first. */
function fresh(w: Watch, items: TokenTransfer[]) {
  return items
    .filter((t) => {
      const ts = Date.parse(t.timestamp);
      return ts > w.lastSeenAt || (ts === w.lastSeenAt && !w.seenTx.includes(t.transaction_hash));
    })
    .reverse();
}

function advance(w: Watch, items: TokenTransfer[]) {
  if (!items.length) return;
  const newest = Math.max(...items.map((t) => Date.parse(t.timestamp)));
  const atNewest = items.filter((t) => Date.parse(t.timestamp) === newest).map((t) => t.transaction_hash);
  w.seenTx = newest === w.lastSeenAt ? [...new Set([...w.seenTx, ...atNewest])].slice(-20) : atNewest;
  w.lastSeenAt = newest;
}

async function checkWallet(w: Watch, chatId: number) {
  const { items } = await getTokenTransfers(w.address, 1);
  const news = fresh(w, items);
  if (!news.length) return;

  const byTx = new Map<string, { legs: { key: string; qty: number; dir: "in" | "out"; sym: string }[] }>();
  for (const t of news) {
    const key = (t.token.address_hash ?? t.token.address ?? "").toLowerCase();
    const qty = toQty(t.total?.value, t.total?.decimals ?? t.token.decimals);
    const dir = t.to.hash.toLowerCase() === w.address ? "in" : t.from.hash.toLowerCase() === w.address ? "out" : null;
    if (!dir || !qty || t.from.is_scam || t.to.is_scam) continue;
    const entry = byTx.get(t.transaction_hash) ?? { legs: [] };
    entry.legs.push({ key, qty, dir, sym: t.token.symbol ?? "?" });
    byTx.set(t.transaction_hash, entry);
  }
  const prices = await currentPrices([...new Set([...byTx.values()].flatMap((e) => e.legs.map((l) => coinId(l.key))))]);

  let sent = 0;
  for (const [tx, e] of byTx) {
    if (sent >= 5) break;
    const fmt = (l: (typeof e.legs)[number]) => {
      const p = prices[coinId(l.key)];
      const amount = l.qty.toLocaleString("en-US", { maximumFractionDigits: l.qty < 1 ? 4 : 2 });
      return `${amount} ${escapeHtml(l.sym)}${p != null ? ` (${usd(p * l.qty)})` : ""}`;
    };
    const out = e.legs.filter((l) => l.dir === "out").map(fmt);
    const inn = e.legs.filter((l) => l.dir === "in").map(fmt);
    await sendMessage(
      chatId,
      [
        `<b>${escapeHtml(w.label ?? short(w.address))}</b> just traded`,
        out.length ? `Sent: ${out.join(", ")}` : null,
        inn.length ? `Got: ${inn.join(", ")}` : null,
        `<a href="${EXPLORER_URL}/tx/${tx}">View tx</a> · watch #${w.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    sent++;
  }
  if (byTx.size > sent) await sendMessage(chatId, `…and ${byTx.size - sent} more trades from ${escapeHtml(w.label ?? short(w.address))}.`);
  advance(w, items);
}

async function checkWhale(w: Watch, chatId: number) {
  const { items } = await getTransfersOfToken(w.address, 1);
  const news = fresh(w, items);
  if (!news.length) return advance(w, items);
  const price = (await currentPrices([coinId(w.address)]))[coinId(w.address)];
  if (price == null) return advance(w, items);

  let sent = 0;
  for (const t of news) {
    if (t.from.hash === ZERO || t.to.hash === ZERO) continue;
    const buy = t.from.is_contract && !t.to.is_contract;
    const sell = !t.from.is_contract && t.to.is_contract;
    if (!buy && !sell) continue;
    const value = toQty(t.total?.value, t.total?.decimals ?? t.token.decimals) * price;
    if (value < w.minUsd) continue;
    if (sent >= 5) break;
    const wallet = buy ? t.to.hash : t.from.hash;
    await sendMessage(
      chatId,
      [
        `<b>Big ${buy ? "buy" : "sell"}</b> · ${escapeHtml(w.label ?? short(w.address))} · ${usd(value)}`,
        `By <a href="${EXPLORER_URL}/address/${wallet}">${short(wallet)}</a>`,
        `<a href="${EXPLORER_URL}/tx/${t.transaction_hash}">View tx</a> · watch #${w.id}`,
      ].join("\n"),
    );
    sent++;
  }
  advance(w, items);
}

async function checkDev(w: Watch, chatId: number) {
  if (!w.dev) return;
  const items = await devOutgoing(w.dev, w.address);
  const news = fresh(w, items);
  if (!news.length) return advance(w, items);
  let sent = 0;
  for (const t of news) {
    if (sent >= 5) break;
    const to = t.to.hash.toLowerCase();
    const burn = to === ZERO || to === "0x000000000000000000000000000000000000dead";
    const what = burn ? "burned" : t.to.is_contract ? "sold (sent to a contract)" : "moved to another wallet";
    const qty = toQty(t.total?.value, t.total?.decimals ?? t.token.decimals);
    await sendMessage(
      chatId,
      [
        `<b>Dev ${what}</b> · ${escapeHtml(w.label ?? short(w.address))}`,
        `${qty.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${escapeHtml(t.token.symbol ?? "")}${burn ? "" : ` to <a href="${EXPLORER_URL}/address/${t.to.hash}">${short(t.to.hash)}</a>`}`,
        `<a href="${EXPLORER_URL}/tx/${t.transaction_hash}">View tx</a> · watch #${w.id}`,
      ].join("\n"),
    );
    sent++;
  }
  advance(w, items);
}

/** Runs every watch once and sends alerts for anything new. */
export async function checkWatches() {
  const s = await loadState();
  if (s.ownerChatId == null || !s.watches.length) return;
  const updated = new Map<number, Watch>();
  for (const w of s.watches) {
    const copy: Watch = { ...w, seenTx: [...w.seenTx] };
    try {
      if (w.kind === "wallet") await checkWallet(copy, s.ownerChatId);
      else if (w.kind === "dev") await checkDev(copy, s.ownerChatId);
      else await checkWhale(copy, s.ownerChatId);
      updated.set(w.id, copy);
    } catch (err) {
      console.error(`[alerts] watch #${w.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  // Merge progress back without dropping watches added or removed meanwhile.
  await withState(async (state) => {
    state.watches = state.watches.map((w) => {
      const u = updated.get(w.id);
      return u ? { ...w, lastSeenAt: u.lastSeenAt, seenTx: u.seenTx } : w;
    });
  });
}
