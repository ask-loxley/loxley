import { connection } from "next/server";
import { limitRequest } from "@/lib/rateLimit";
import { walletSummary } from "@/lib/x402";

// Public view of Loxley's operating wallet: balance, limits and recent x402 payments.
export async function GET(request: Request) {
  await connection();
  const limited = await limitRequest(request, "data");
  if (limited) return limited;
  const summary = await walletSummary();
  return Response.json(summary, { headers: { "Cache-Control": "public, max-age=30" } });
}
