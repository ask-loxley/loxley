import { challenge } from "@/lib/holder";
import { limitRequest } from "@/lib/rateLimit";

// Step 1: a message for the wallet to sign.
export async function POST(request: Request) {
  const limited = await limitRequest(request, "data");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { address?: string } | null;
  try {
    return Response.json(await challenge(body?.address ?? ""));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Bad request" }, { status: 400 });
  }
}
