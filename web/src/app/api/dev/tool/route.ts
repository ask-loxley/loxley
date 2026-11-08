import { runTool } from "@/lib/tools";

// Development-only: run one agent tool without the LLM.
// GET /api/dev/tool?name=find_yields&args={"asset":"USDG"}
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  const params = new URL(request.url).searchParams;
  const name = params.get("name") ?? "";
  try {
    return Response.json(await runTool(name, params.get("args") ?? "{}"));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Tool failed" }, { status: 500 });
  }
}
