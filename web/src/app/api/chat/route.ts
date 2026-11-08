import { runAgent, type AgentEvent } from "@/lib/agent";
import { limitRequest } from "@/lib/rateLimit";

type IncomingMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;

function parseHistory(body: unknown): IncomingMessage[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) return null;
  const raw = (body as { messages: unknown[] }).messages.slice(-MAX_MESSAGES);
  const out: IncomingMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    out.push({ role, content: content.slice(0, MAX_CHARS) });
  }
  return out.length && out[out.length - 1].role === "user" ? out : null;
}

// Streams agent progress as newline-delimited JSON so the UI can show each tool step live.
export async function POST(request: Request) {
  const limited = await limitRequest(request, "chat");
  if (limited) return limited;
  const history = parseHistory(await request.json().catch(() => null));
  if (!history) {
    return Response.json({ error: "Send { messages: [...] } ending with a user message." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(history, emit);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
