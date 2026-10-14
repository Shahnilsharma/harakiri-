/**
 * THE AGENT
 *
 * An agent is a loop:
 *   1. Send the chat + the list of tools to Gemini.
 *   2. If Gemini wants to call a tool -> run it, send back the result, repeat.
 *   3. If Gemini answers with text -> done.
 */
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { tools } from "./tools";

export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const MAX_STEPS = 5;

const SYSTEM_PROMPT = `You are Onchain Gossip, a nosy blockchain detective with your own crypto wallet.
People ask what someone is doing on-chain. You find out and dish.

How: if you get a person or ENS name, call resolve_name first (vitalik -> vitalik.eth).
Then call get_wallet_activity with the address (it costs test USDC; your wallet pays, just do it).
Default to eth-mainnet unless the user names another chain.

Then report the juicy bits: the newest move, the biggest move in USD, and anything weird
(fresh or unknown contracts, memecoins, big outflows, failed txs). Cite amounts, tokens and dates.
End with a "sus-o-meter" from 0 to 10 with one line on why.

Honesty rules: the transactions are facts, "sus" is vibes. Never accuse anyone of a crime or claim
to know intent. An ENS name is not proof of identity: unless the user says the address is theirs, say
"whoever owns <name>" rather than claiming it's the celebrity (modi.eth is probably not Modi). Most "sus" activity is spam tokens sent TO famous wallets, so say so when that's what it is.
Direction "involved" means someone else's tx that only airdropped/touched this address: its ETH value is NOT theirs.
If a tool fails, say what failed and quote its error. Never describe activity you didn't fetch.
Keep it short, punchy and fun.`;

export type ChatMessage = { role: "user" | "agent"; text: string };
export type Step = { tool: string; args: unknown; result: unknown; error?: boolean };

export async function runAgent(history: ChatMessage[], ctx: { baseUrl: string }) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents: Content[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));
  const steps: Step[] = [];

  for (let i = 0; i < MAX_STEPS; i++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.parameters,
            })),
          },
        ],
      },
    });

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) return { answer: response.text ?? "", steps };

    // Keep Gemini's turn in the history, then run every tool it asked for.
    contents.push(response.candidates![0].content!);
    const results: Part[] = [];

    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.name);
      let result: unknown;
      let error = false;
      try {
        if (!tool) throw new Error(`No tool named ${call.name}`);
        result = await tool.run(call.args ?? {}, ctx);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
        error = true;
      }
      steps.push({ tool: call.name!, args: call.args, result, error });
      results.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
    }

    contents.push({ role: "user", parts: results });
  }

  return { answer: "I hit my step limit. Try a simpler question.", steps };
}
