// Run: npx tsx scripts/check-status.mts
// Fake Groq: first call 429 (retry-after 1s), then a plain answer. Checks the loader gets told about the wait.
import assert from "node:assert";
const real = globalThis.fetch;
let calls = 0;
globalThis.fetch = (async (url: any, init: any) => {
  if (!String(url).includes("api.groq.com")) return real(url, init);
  calls++;
  if (calls === 1) return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429, headers: { "retry-after": "1", "content-type": "application/json" } });
  return new Response(JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: "m", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hi" } }] }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
process.env.GROQ_API_KEY = "test";
const { runAgent } = await import("../agent/agent");
const seen: string[] = [];
const out = await runAgent([{ role: "user", text: "hello" }], (s) => seen.push(s));
console.log(seen, out.answer);
assert.deepEqual(seen, ["reading your question", "Groq is rate-limiting us, retrying in 1s"]);
assert.equal(out.answer, "hi");
console.log("PASS");
