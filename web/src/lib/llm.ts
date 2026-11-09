// Minimal OpenRouter client (OpenAI-compatible chat completions).
// Swap OPENROUTER_MODEL in .env.local to change models without touching code.

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export class LlmError extends Error {}

export const MAIN_MODEL = () => process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5.5";
// Cheaper model for small talk and simple questions; see runAgent for when it hands over to MAIN_MODEL.
export const LIGHT_MODEL = () => process.env.OPENROUTER_LIGHT_MODEL || "anthropic/claude-haiku-5.5";

export async function chatCompletion(messages: ChatMessage[], tools: readonly unknown[], model = MAIN_MODEL()) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new LlmError("OPENROUTER_API_KEY is missing. Add it to web/.env.local.");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Optional attribution headers OpenRouter uses for its app rankings.
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "Loxley",
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.choices?.[0]) {
    const reason = body?.error?.message ?? `HTTP ${res.status}`;
    throw new LlmError(`OpenRouter request failed: ${reason}`);
  }
  return body.choices[0].message as { content: string | null; tool_calls?: ToolCall[] };
}
