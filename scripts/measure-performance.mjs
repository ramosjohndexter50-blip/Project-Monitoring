// Production Next build against the isolated fixture only. Never uses live credentials.
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
const label = process.argv[2] ?? "after";
if (!/^[a-z-]+$/.test(label)) throw Error("Invalid report label");
const auth = await fetch("http://127.0.0.1:55440/auth/v1/token", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@fixture.test" }),
}).then(r => r.json());
auth.expires_at = Math.floor(Date.now() / 1000) + auth.expires_in;
const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(auth)).toString("base64url")}`;
const results = [];
for (const route of ["/", "/portal", "/portal/tasks", "/portal/projects", "/portal/users", "/portal/reports", "/portal/search?q=ground", "/admin"]) {
  const samples = [];
  for (let i = 0; i < 4; i++) {
    await fetch("http://127.0.0.1:55440/__metrics", { method: "DELETE" });
    const start = performance.now();
    const response = await fetch(`http://127.0.0.1:3101${route}`, { headers: { cookie } });
    const ttfb = performance.now() - start;
    const body = await response.text();
    const ms = performance.now() - start;
    const requests = await fetch("http://127.0.0.1:55440/__metrics").then(r => r.json());
    samples.push({ ms: Math.round(ms), ttfb: Math.round(ttfb), status: response.status,
      htmlBytes: Buffer.byteLength(body), apiRequests: requests.length,
      apiBytes: requests.reduce((sum, r) => sum + r.bytes, 0), requests,
      renderError: /(?:\\"digest\\"|NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK)/.test(body),
    });
  }
  results.push({ route, cold: samples[0], warm: samples.slice(1) });
}
const assets = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|css)$/.test(file)) {
      const bytes = readFileSync(file);
      assets.push({ file, bytes: bytes.length, gzip: gzipSync(bytes).length });
    }
  }
}
walk(".next-verification/static");
mkdirSync("docs/performance", { recursive: true });
writeFileSync(`docs/performance/${label}.json`, JSON.stringify({
  environment: "Local production build; synthetic Auth/Storage; actual PostgreSQL RLS via PGlite; not production latency",
  results, assets,
}, null, 2));
console.table(results.map(({ route, warm }) => ({ route,
  medianMs: warm.map(x => x.ms).sort((a,b) => a-b)[1],
  apiRequests: warm[0].apiRequests, apiBytes: warm[0].apiBytes,
  renderError: warm[0].renderError,
})));
