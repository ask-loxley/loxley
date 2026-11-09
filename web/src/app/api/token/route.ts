import { connection } from "next/server";
import { loxleyToken } from "@/lib/token";

// The official $LOXLEY contract for the site banner. null until launch.
export async function GET() {
  await connection();
  const token = await loxleyToken().catch(() => null);
  return Response.json({ token }, { headers: { "Cache-Control": "public, max-age=30" } });
}
