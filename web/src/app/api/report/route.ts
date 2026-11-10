import { currentHolder } from "@/lib/holder";
import { limitRequest } from "@/lib/rateLimit";
import { walletReport } from "@/lib/report";

// Premium wallet report: $LOXLEY holders only.
export async function POST(request: Request) {
  const holder = await currentHolder(request).catch(() => null);
  if (!holder) return Response.json({ error: "Verify your $LOXLEY wallet first." }, { status: 401 });
  if (!holder.eligible) {
    return Response.json({ error: `This wallet holds ${holder.balance.toLocaleString("en-US")} $LOXLEY. The premium report needs $${holder.minUsd} worth, about ${holder.min.toLocaleString("en-US")} at today's price.` }, { status: 403 });
  }
  const limited = await limitRequest(request, "report");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { address?: string } | null;
  try {
    return Response.json(await walletReport(body?.address || holder.address));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Report failed." }, { status: 400 });
  }
}
