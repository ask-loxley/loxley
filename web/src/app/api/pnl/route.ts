import { ChainDataError, isAddress } from "@/lib/blockscout";
import { computePnl } from "@/lib/pnl";
import { limitRequest } from "@/lib/rateLimit";

// Direct P&L report without the LLM: GET /api/pnl?address=0x...
export async function GET(request: Request) {
  const limited = await limitRequest(request, "data");
  if (limited) return limited;
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!isAddress(address)) {
    return Response.json({ error: "Pass ?address= with a full 0x address." }, { status: 400 });
  }
  try {
    return Response.json(await computePnl(address));
  } catch (err) {
    const status = err instanceof ChainDataError ? 502 : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Report failed." }, { status });
  }
}
