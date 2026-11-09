// Web search and page reading for the agent.
// Search: Tavily first (with TAVILY_API_KEY, or its keyless mode for light use), falling back to
// OpenRouter's web plugin if Tavily fails. Tavily costs ~$0.008 per search versus ~$0.025 for the plugin.
// Reading: Jina Reader turns any public page into plain text, free without a key.

export type WebSearchResult = {
  summary: string;
  sources: { title: string | null; url: string }[];
  results?: { title: string; url: string; snippet: string; published: string | null }[];
  engine: "tavily" | "openrouter";
};

export type Recency = "day" | "week" | "month" | "year";

type TavilyResponse = {
  answer?: string | null;
  results?: { title?: string; url?: string; content?: string; published_date?: string | null }[];
};

async function searchTavily(query: string, recency?: Recency): Promise<WebSearchResult> {
  const key = process.env.TAVILY_API_KEY;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : { "X-Tavily-Access-Mode": "keyless" }),
    },
    body: JSON.stringify({
      query: query.slice(0, 400),
      search_depth: "basic",
      max_results: 6,
      include_answer: "basic",
      topic: "general",
      include_published_date: true,
      ...(recency ? { time_range: recency } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as TavilyResponse | null;
  if (!res.ok || !body || !Array.isArray(body.results)) throw new Error(`Tavily search failed: HTTP ${res.status}`);

  const results = body.results
    .filter((r) => r.url)
    .slice(0, 6)
    .map((r) => ({
      title: (r.title ?? r.url ?? "").slice(0, 160),
      url: r.url as string,
      snippet: (r.content ?? "").replace(/\s+/g, " ").slice(0, 500),
      published: r.published_date ?? null,
    }));
  return {
    summary: body.answer?.trim() || (results.length ? "See the results below." : "No results."),
    sources: results.map((r) => ({ title: r.title || null, url: r.url })),
    results,
    engine: "tavily",
  };
}

async function searchOpenRouter(query: string): Promise<WebSearchResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is missing.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "Loxley",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_SEARCH_MODEL || "anthropic/claude-haiku-5.5",
      plugins: [{ id: "web", max_results: 5 }],
      reasoning: { effort: "low" },
      max_tokens: 2500,
      messages: [
        {
          role: "system",
          content:
            "You research the web for an assistant. Today is " +
            new Date().toISOString().slice(0, 10) +
            ". Answer from the search results only. Max 6 items, under 250 words. For each item give the key facts and its source URL. Flag unverified claims and anything that looks like a scam.",
        },
        { role: "user", content: query.slice(0, 500) },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.choices?.[0]) throw new Error(`Web search failed: ${body?.error?.message ?? res.status}`);

  const msg = body.choices[0].message as {
    content: string | null;
    annotations?: { type: string; url_citation?: { url: string; title?: string } }[];
  };
  const seen = new Set<string>();
  const sources = (msg.annotations ?? [])
    .map((a) => a.url_citation)
    .filter((c): c is { url: string; title?: string } => Boolean(c?.url))
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .slice(0, 8)
    .map((c) => ({ title: c.title ?? null, url: c.url }));
  return { summary: msg.content?.trim() || "No results.", sources, engine: "openrouter" };
}

export async function searchWeb(query: string, recency?: Recency): Promise<WebSearchResult> {
  try {
    return await searchTavily(query, recency);
  } catch (err) {
    console.warn("[search] Tavily failed, falling back to OpenRouter:", err instanceof Error ? err.message : err);
    return searchOpenRouter(query);
  }
}

// ---------- page reading ----------

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

export type PageText = { url: string; title: string | null; text: string; truncated: boolean };

/** Fetches a public web page as readable text through Jina Reader. */
export async function readUrl(raw: string): Promise<PageText> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That is not a valid URL. Pass a full link starting with https://");
  }
  if (!["http:", "https:"].includes(url.protocol) || PRIVATE_HOST.test(url.hostname)) {
    throw new Error("Only public http(s) pages can be read.");
  }
  const key = process.env.JINA_API_KEY;
  const res = await fetch(`https://r.jina.ai/${url.toString()}`, {
    headers: { Accept: "text/plain", "X-Return-Format": "markdown", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Could not read the page (HTTP ${res.status}).`);
  const body = await res.text();
  const title = body.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const content = (body.split(/^Markdown Content:\s*$/m)[1] ?? body)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // drop images
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const LIMIT = 8000;
  return { url: url.toString(), title, text: content.slice(0, LIMIT), truncated: content.length > LIMIT };
}
