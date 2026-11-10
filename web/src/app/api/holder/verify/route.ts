import { sessionCookie, verifySignature } from "@/lib/holder";
import { limitRequest } from "@/lib/rateLimit";

// Step 2: check the signature and the $LOXLEY balance; eligible holders get a 24h session cookie.
export async function POST(request: Request) {
  const limited = await limitRequest(request, "data");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { address?: string; message?: string; signature?: string; token?: string } | null;
  if (!body?.address || !body.message || !body.signature || !body.token) {
    return Response.json({ error: "Missing address, message, signature or token." }, { status: 400 });
  }
  try {
    const status = await verifySignature({ address: body.address, message: body.message, signature: body.signature, token: body.token });
    const headers = status.eligible ? { "Set-Cookie": await sessionCookie(status.address) } : undefined;
    return Response.json(status, { headers });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Verification failed." }, { status: 400 });
  }
}
