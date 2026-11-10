import { connection } from "next/server";
import { clearCookie, currentHolder, minHolding } from "@/lib/holder";

export async function GET(request: Request) {
  await connection();
  const holder = await currentHolder(request).catch(() => null);
  return Response.json({ holder, min: minHolding() }, { headers: { "Cache-Control": "no-store" } });
}

// Sign out.
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
}
