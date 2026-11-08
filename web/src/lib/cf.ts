// Helpers for running on Cloudflare Workers (via OpenNext). Locally these paths are never taken.

/** True when deployed to Cloudflare (set as a plain var in wrangler.jsonc). */
export const onCloudflare = () => process.env.LOXLEY_RUNTIME === "cloudflare";

// The slice of the D1 API that Loxley uses.
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};
export type D1 = { prepare(query: string): D1Statement };

export async function getDb(): Promise<D1> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const db = (getCloudflareContext().env as unknown as { DB?: D1 }).DB;
  if (!db) throw new Error("D1 binding DB is missing in wrangler.jsonc.");
  return db;
}
