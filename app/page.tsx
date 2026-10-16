"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { SwingChain } from "@/components/swing-chain";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActivityFeed, Reply } from "@/components/gossip";
import { cn } from "@/lib/utils";

type Step = { tool: string; args: unknown; result: any; error?: boolean };
type Message = { role: "user" | "agent"; text: string; steps?: Step[]; error?: boolean };
type Status = { hasApiKey: boolean; model: string; tools: { name: string; description: string }[] };
type WalletInfo = { address: string | null; balance?: string };

// The chat survives a refresh (this browser only); only the Clear button empties it.
const CHAT_KEY = "onchain-gossip-chat";
const NO_MESSAGES: Message[] = [];

const EXAMPLES = ["What's vitalik doing on-chain?", "Anything sus in jessepollak.eth's Base activity?", "What's in your wallet?"];

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>(NO_MESSAGES);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [progress, setProgress] = useState("");
  const [creating, setCreating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadWallet = () => fetch("/api/wallet").then((r) => r.json()).then(setWallet);

  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then(setStatus);
    loadWallet();
    try {
      const saved = localStorage.getItem(CHAT_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    // Skip the untouched initial state, so a mount (or StrictMode's double mount) never overwrites the saved chat.
    if (messages === NO_MESSAGES) return;
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    // Scroll only the chat's own viewport. scrollIntoView would also scroll the card and the page.
    const viewport = bottomRef.current?.closest("[data-slot=scroll-area-viewport]");
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function createWallet() {
    setCreating(true);
    await fetch("/api/wallet", { method: "POST" });
    await loadWallet();
    setCreating(false);
  }

  async function send(text: string) {
    if (!text.trim() || thinking) return;
    const history: Message[] = [...messages, { role: "user", text }];
    setMessages(history);
    setInput("");
    setThinking(true);
    setProgress("");

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.filter((m) => !m.error).map(({ role, text }) => ({ role, text })) }),
      });
      // One JSON object per line: { status } updates, then the result. (A missing API key comes back as plain JSON.)
      let data = { error: "The agent stopped without answering. Try again." } as { answer?: string; steps?: Step[]; error?: string };
      let buffer = "";
      const handle = (line: string) => {
        if (!line.trim()) return;
        const msg = JSON.parse(line);
        if ("status" in msg) setProgress(msg.status);
        else data = msg;
      };
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        const lines = (buffer + chunk.value).split("\n");
        buffer = lines.pop()!;
        lines.forEach(handle);
      }
      handle(buffer);
      setMessages((m) => [...m, data.error ? { role: "agent", text: data.error, error: true } : { role: "agent", text: data.answer ?? "", steps: data.steps }]);
      if (data.steps?.some((s: Step) => s.result?.payment)) loadWallet();
    } catch {
      setMessages((m) => [...m, { role: "agent", text: "Could not reach the server. Is `npm run dev` still running?", error: true }]);
    }
    setThinking(false);
  }

  const ready = Boolean(status?.hasApiKey);

  return (
    <main className="mx-auto flex overflow-x-clip min-h-screen max-w-[1920px] flex-col gap-10 px-4 py-8 md:px-12 md:py-12">
      {/* Header */}
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>
            <span className="relative mr-2 shrink-0">
              <img src="/logo.png" alt="" className="size-28" />
              <SwingChain />
            </span>
            <span className="text-foreground">Harakiri</span>
          </Label>
          {status && <Label>Model: {status.model}</Label>}
        </div>
        <h1 className="text-5xl leading-[0.9] font-bold tracking-[-0.045em] uppercase md:text-7xl">
          Onchain <span className="text-primary">gossip.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Ask what anyone is doing on-chain. The agent pays for real data with its own wallet, then spills the tea.
        </p>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left: setup + tools */}
        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <SectionTitle num="01" title="Setup" />
            </CardHeader>
            <CardContent className="flex flex-col">
              <SetupStep number={1} title="Add your Groq API key" done={ready}>
                {status && !ready && (
                  <p className="text-muted-foreground">
                    Paste it into <Code>.env</Code> as <Code>GROQ_API_KEY</Code>, then restart <Code>npm run dev</Code>.{" "}
                    <a className="text-primary underline underline-offset-4" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                      Get a free key
                    </a>
                  </p>
                )}
                {ready && <p className="text-muted-foreground">Connected.</p>}
              </SetupStep>

              <SetupStep number={2} title="Create the agent wallet" done={Boolean(wallet?.address)}>
                {wallet && !wallet.address && (
                  <div className="flex flex-col gap-3">
                    <p className="text-muted-foreground">The agent signs payments with this wallet to use paid APIs.</p>
                    <Button onClick={createWallet} disabled={creating} className="w-fit font-mono tracking-wider uppercase">
                      <Wallet /> {creating ? "Creating..." : "Create wallet"}
                    </Button>
                  </div>
                )}
                {wallet?.address && <WalletDetails wallet={wallet} onRefresh={loadWallet} />}
              </SetupStep>

              <SetupStep number={3} title="Chat with your agent" done={messages.some((m) => m.role === "agent" && !m.error)} last>
                <p className="text-muted-foreground">Pick an example prompt, or ask anything.</p>
              </SetupStep>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionTitle num="02" title="Tools" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {status?.tools.map((t) => (
                <div key={t.name}>
                  <p className="font-mono text-sm">
                    <span className="text-primary">&gt;</span> {t.name}
                  </p>
                  <p className="mt-1 text-muted-foreground">{t.description}</p>
                </div>
              ))}
              {/* <p className="border-t pt-4 text-muted-foreground">
                Add your own in <Code>agent/tools.ts</Code>. Save, and it shows up here.
              </p> */}
            </CardContent>
          </Card>
        </aside>

        {/* Right: chat */}
        <Card className="flex h-[calc(100vh-4rem)] min-h-[560px] flex-col lg:sticky lg:top-8">
          <CardHeader className="border-b">
            <SectionTitle num="03" title="Chat" />
            <CardAction>
              <Button variant="ghost" size="sm" className="font-mono uppercase" onClick={() => setMessages([])} disabled={messages.length === 0 || thinking}>
                <RotateCcw /> Clear
              </Button>
            </CardAction>
          </CardHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-5 px-4 py-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-5 py-16 text-center">
                  <div className="flex size-12 items-center justify-center bg-primary text-primary-foreground">
                    <Bot className="size-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tracking-tight uppercase">Ask your agent something</p>
                    <p className="mt-1 text-muted-foreground">
                      {!ready
                        ? "Add your Groq API key to start."
                        : wallet && !wallet.address
                          ? "Tip: create a wallet and fund it with Base Sepolia USDC so the agent can pay GoldRush."
                          : "Pick an example to start."}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXAMPLES.map((e) => (
                      <Button key={e} variant="outline" onClick={() => send(e)} disabled={!ready} className="font-mono">
                        <span className="text-primary">&gt;</span> {e}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="max-w-[85%] self-end bg-primary px-4 py-2.5 font-medium text-primary-foreground">
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="flex w-full gap-2 self-start md:w-auto md:max-w-[85%] md:gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center border">
                      <Bot className="size-4 text-primary" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      {m.steps?.map((s, j) => <ToolCall key={j} step={s} />)}
                      {m.steps?.map((s, j) => s.tool === "get_wallet_activity" && s.result?.transactions && <ActivityFeed key={j} data={s.result} />)}
                      {m.error ? (
                        <div className="flex gap-2 bg-destructive/10 px-4 py-2.5 whitespace-pre-wrap text-destructive">
                          <CircleAlert className="mt-0.5 size-4 shrink-0" />
                          <Linkify text={m.text} />
                        </div>
                      ) : (
                        <div className="border-l-2 border-primary bg-muted px-4 py-3">
                          <Reply text={m.text} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {thinking && <ThinkingLoader status={progress} />}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <CardFooter className="border-t pt-4">
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className={cn("flex flex-1 items-center border border-input bg-background focus-within:border-primary", !ready && "opacity-50")}>
                <span className="pl-3 font-mono text-base whitespace-nowrap text-muted-foreground md:text-sm">~/agent $</span>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={ready ? "ask your agent something..." : "add your Groq API key to start"}
                  disabled={!ready}
                  className="h-11 border-0 bg-transparent font-mono focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100 dark:bg-transparent dark:disabled:bg-transparent"
                />
              </div>
              <Button type="submit" className="h-auto px-5" disabled={!ready || thinking || !input.trim()} aria-label="Send">
                <SendHorizontal />
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

const LOADER_MUTED_KEY = "onchain-gossip-loader-muted";

/**
 * The loader: a centred card with the singing pigeon, a seconds counter and what the agent is really doing.
 * It plays with sound: sending a message counts as the user interacting, which browsers require for audio.
 * If a browser still blocks it, it plays muted and the button offers sound. The mute choice is remembered;
 * the answer arriving unmounts it, which stops the audio.
 */
function ThinkingLoader({ status }: { status: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(LOADER_MUTED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const video = ref.current!;
    video.muted = muted;
    // Respect "reduce motion": stay on the poster until the user presses the button.
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      video.play().catch(() => {
        video.muted = true;
        setMuted(true);
        video.play().catch(() => {});
      });
    return () => clearInterval(tick);
  }, []);

  function toggle() {
    const video = ref.current!;
    const next = video.paused ? false : !video.muted;
    video.muted = next;
    setMuted(next);
    video.play().catch(() => {});
    try {
      localStorage.setItem(LOADER_MUTED_KEY, next ? "1" : "0");
    } catch {}
  }


  return (
    <div className="relative my-2 w-full max-w-md self-center border border-primary/40 bg-background font-mono text-xs">
      <span role="status" className="sr-only">
        Agent is thinking
      </span>
      <div className="flex items-center gap-2 border-b px-3 py-2 uppercase">
        <span className="size-2 animate-pulse bg-primary motion-reduce:animate-none" />
        <span className="font-bold text-foreground">Live</span>
        <span className="text-muted-foreground">/ agent is thinking</span>
        <span className="ml-auto text-muted-foreground tabular-nums">{seconds}s</span>
      </div>
      <div className="relative">
        <video ref={ref} src="/loader.mp4" poster="/loader-poster.jpg" loop playsInline preload="auto" className="aspect-video w-full" />
        <button
          onClick={toggle}
          aria-label={muted ? "Turn sound on" : "Mute"}
          className="absolute right-2 bottom-2 flex items-center gap-1 bg-background/80 px-1.5 py-1 text-[10px] text-foreground uppercase hover:text-primary"
        >
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          {muted && "Sound"}
        </button>
      </div>
      <p aria-hidden className="flex items-center gap-2 border-t px-3 py-2 text-muted-foreground">
        <span className="text-primary">&gt;</span> {status || "warming up the vocals"}
        <span className="inline-block h-3.5 w-1.5 animate-pulse bg-primary motion-reduce:animate-none" />
      </p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">{children}</p>;
}

function SectionTitle({ num, title }: { num: string; title: string }) {
  return (
    <p className="font-mono text-xs font-medium tracking-[0.06em] uppercase">
      <span className="text-primary">{num}</span>
      <span className="ml-3 text-muted-foreground">{title}</span>
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}

function SetupStep(props: { number: number; title: string; done: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center border-2 font-mono text-xs font-bold",
            props.done ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary"
          )}
        >
          {props.done ? <Check className="size-3.5" strokeWidth={3} /> : props.number}
        </span>
        {!props.last && <span className={cn("w-0.5 flex-1", props.done ? "bg-primary" : "bg-border")} />}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-2", !props.last && "pb-6")}>
        <p className="font-bold tracking-tight uppercase">{props.title}</p>
        {props.children}
      </div>
    </div>
  );
}

function WalletDetails({ wallet, onRefresh }: { wallet: WalletInfo; onRefresh: () => void }) {
  const [copied, setCopied] = useState(false);
  const address = wallet.address!;

  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-3 border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-xs text-primary">{address}</code>
        <Button variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy address">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <div className="flex items-center justify-between font-mono text-xs text-muted-foreground uppercase">
        <span>
          Balance <span className="text-foreground">{wallet.balance}</span>
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onRefresh} aria-label="Refresh balance">
          <RefreshCw />
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 font-mono text-xs uppercase">
        <a className="inline-flex items-center gap-1 hover:text-primary" href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noreferrer">
          Explorer <ExternalLink className="size-3" />
        </a>
        <a className="inline-flex items-center gap-1 hover:text-primary" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          Get test USDC <ExternalLink className="size-3" />
        </a>
      </div>
      <p className="text-xs text-muted-foreground">Base Sepolia testnet. Saved in .agent-wallet.json.</p>
    </div>
  );
}

function ToolCall({ step }: { step: Step }) {
  const payment = step.result?.payment;
  return (
    <Collapsible className="border font-mono text-xs">
      <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-muted">
        <ChevronRight className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
        <span className="text-muted-foreground uppercase">Tool</span>
        <span className="text-primary">{step.tool}</span>
        {payment && <Badge className="ml-auto bg-primary/10 font-mono text-primary uppercase ring-1 ring-inset ring-primary/50">Paid {payment.amount}</Badge>}
        {step.error && <Badge variant="destructive" className="ml-auto font-mono uppercase">Failed</Badge>}
      </CollapsibleTrigger>
      {payment?.tx && (
        <a className="flex items-center gap-1 border-t px-3 py-1.5 text-muted-foreground hover:text-primary" href={payment.tx} target="_blank" rel="noreferrer">
          Payment tx {payment.tx.split("/").pop().slice(0, 10)}… <ExternalLink className="size-3" />
        </a>
      )}
      <CollapsibleContent className="flex flex-col gap-2 border-t px-3 py-2">
        <Json label="Input" value={step.args} />
        <Json label="Output" value={step.result} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Agent replies are plain text: make the URLs in them clickable. */
function Linkify({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s)]+)/).map((part, i) =>
    i % 2 ? (
      <a key={i} className="break-all text-primary underline underline-offset-4" href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-muted-foreground uppercase">{label}</p>
      <pre className="overflow-x-auto bg-background p-2">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
