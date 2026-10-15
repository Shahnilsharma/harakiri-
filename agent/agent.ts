/**
 * THE AGENT
 *
 * An agent is a loop:
 *   1. Send the chat + the list of tools to the model (Groq, via its OpenAI-compatible API).
 *   2. If the model wants to call a tool -> run it, send back the result, repeat.
 *   3. If the model answers with text -> done.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { tools } from "./tools";

export const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const MAX_STEPS = 5;

const SYSTEM_PROMPT = `You are Onchain Gossip, a nosy blockchain detective with your own crypto wallet.
People ask what someone is doing on-chain. You find out and dish.

How: if you get a person or ENS name, call resolve_name first (vitalik -> vitalik.eth).
Then call get_wallet_activity with the address (it costs test USDC; your wallet pays, just do it).
Default to eth-mainnet unless the user names another chain.

Then report the juicy bits: the newest move, the biggest move in USD, and anything weird
(fresh or unknown contracts, memecoins, big outflows, failed txs). Cite amounts, tokens and dates,
and put the tx's link (plain URL, no markdown) after every transaction you mention.
Format: markdown with short "### " section headers (Newest move, Biggest move, Weird stuff), bullets,
and **bold** amounts. Put each tx link as a bare URL (no [text](url)). Skip tables.
Last line, exactly: "Sus-o-meter: N/10 - one line on why".

Honesty rules: the transactions are facts, "sus" is vibes. Never accuse anyone of a crime or claim
to know intent. An ENS name is not proof of identity: unless the user says the address is theirs, say
"whoever owns <name>" rather than claiming it's the celebrity (modi.eth is probably not Modi). Most "sus" activity is spam tokens sent TO famous wallets, so say so when that's what it is.
Direction "involved" means someone else's tx that only airdropped/touched this address: its ETH value is NOT theirs.
If a tool fails, say what failed and quote its error. Never describe activity you didn't fetch.
Keep it short, punchy and fun.`;

export type ChatMessage = { role: "user" | "agent"; text: string };
export type Step = { tool: string; args: unknown; result: unknown; error?: boolean };

const groqTools: ChatCompletionTool[] = tools.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> },
}));

// Groq's free tier allows ~8k tokens per minute in total; a full 40-tx activity dump is ~12k on its own (413).
// ponytail: char budget (~2.2 chars/token for hex-heavy JSON). Raise it on a paid tier.
const MAX_TOOL_CHARS = 8000;

/** Shrink an oversized tool result by keeping the first (newest) items of its array, so it fits the model. */
function fitForModel(result: unknown) {
  let json = JSON.stringify(result);
  if (json.length <= MAX_TOOL_CHARS || !result || typeof result !== "object") return json;
  const obj = result as Record<string, unknown>;
  const key = Object.keys(obj).find((k) => Array.isArray(obj[k]));
  if (!key) return json.slice(0, MAX_TOOL_CHARS);
  const items = obj[key] as unknown[];
  for (let n = items.length; n > 1 && json.length > MAX_TOOL_CHARS; ) {
    n = Math.floor(n * 0.75);
    json = JSON.stringify({ ...obj, [key]: items.slice(0, n), note: `showing the first ${n} of ${items.length} ${key}` });
  }
  return json;
}

export async function runAgent(history: ChatMessage[], ctx: { baseUrl: string }) {
  const groq = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    // The SDK retries 429 (and 408/409/5xx) with exponential backoff + jitter (0.5s doubling, 8s cap),
    // and waits for Groq's retry-after header instead when it's under 60s.
    maxRetries: 5,
  });
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m): ChatCompletionMessageParam =>
      m.role === "user" ? { role: "user", content: m.text } : { role: "assistant", content: m.text },
    ),
  ];
  const steps: Step[] = [];

  for (let i = 0; i < MAX_STEPS; i++) {
    const response = await groq.chat.completions.create({ model: MODEL, messages, tools: groqTools });
    const message = response.choices[0].message;
    const calls = (message.tool_calls ?? []).filter((c) => c.type === "function");
    if (calls.length === 0) return { answer: message.content ?? "", steps };

    // Keep the model's turn in the history, then run every tool it asked for.
    messages.push({ role: "assistant", content: message.content, tool_calls: calls });

    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.function.name);
      let args: unknown = {};
      let result: unknown;
      let error = false;
      try {
        args = JSON.parse(call.function.arguments || "{}") ?? {};
        if (!tool) throw new Error(`No tool named ${call.function.name}`);
        result = await tool.run(args, ctx);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
        error = true;
      }
      steps.push({ tool: call.function.name, args, result, error });
      messages.push({ role: "tool", tool_call_id: call.id, content: fitForModel(result) });
    }
  }

  return { answer: "I hit my step limit. Try a simpler question.", steps };
}
