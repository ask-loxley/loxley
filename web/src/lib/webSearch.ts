// Web search through OpenRouter's web plugin, summarized by a small model with source links.
// Each call costs roughly $0.02-0.03 (search results + tokens), so the agent only uses it for fresh, off-chain info.

export type WebSearchResult = { summary: string; sources: { title: string | null; url: string }[] };

export async function searchWeb(query: string): Promise<WebSearchResult> {
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
            "You research crypto news for a Robinhood Chain assistant. Today is " +
            new Date().toISOString().slice(0, 10) +
            ". Answer from the search results only. Max 6 items, under 250 words. For each item give the key facts, what a user would do, and its source URL. Flag unverified claims and anything that looks like a scam.",
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
  return { summary: msg.content?.trim() || "No results.", sources };
}
