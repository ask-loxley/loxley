import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults: no incremental cache bucket needed, since Loxley has no ISR pages.
export default defineCloudflareConfig({});
