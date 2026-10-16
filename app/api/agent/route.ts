import { MODEL, runAgent } from "@/agent/agent";
import { tools } from "@/agent/tools";

// GET /api/agent -> setup status + the list of tools (shown on the page)
export async function GET() {
  return Response.json({
    hasApiKey: Boolean(process.env.GROQ_API_KEY),
    model: MODEL,
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
  });
}

// POST /api/agent { messages } -> live status lines, then the agent's answer + the tools it used
export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "Add GROQ_API_KEY to your .env file, then restart `npm run dev`." }, { status: 500 });
  }

  const { messages } = await req.json();
  // Stream one JSON object per line: { status } while it works, then the result ({ answer, steps } or { error }).
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        write(await runAgent(messages, (status) => write({ status })));
      } catch (err) {
        write({ error: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
