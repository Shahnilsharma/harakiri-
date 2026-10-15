"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Transfer = { token: string; amount: number; from: string; to: string };
type Tx = {
  when: string;
  direction: "in" | "out" | "involved";
  native_value: number;
  value_usd: number;
  failed?: boolean;
  event?: string;
  transfers?: Transfer[];
  link: string;
};
export type Activity = { address: string; chain: string; transactions: Tx[] };

const short = (a = "") => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const num = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumSignificantDigits: 3 }).format(n);
const usd = (n: number) => new Intl.NumberFormat("en", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 }).format(n);

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  for (const [unit, secs] of [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]] as const)
    if (s >= secs) return `${Math.floor(s / secs)}${unit} ago`;
  return "just now";
}

const PILL = {
  in: { label: "IN", className: "bg-primary text-primary-foreground" },
  out: { label: "OUT", className: "bg-destructive text-background" },
  involved: { label: "TAGGED", className: "bg-blue text-foreground" },
};

/** What this tx did to the watched address, in one line: "+10M VACCINU", "−0.17 ETH", "Approval"... */
function headline(tx: Tx, me: string) {
  const mine = tx.transfers?.find((t) => t.to?.toLowerCase() === me || t.from?.toLowerCase() === me);
  if (mine) return { text: `${mine.to?.toLowerCase() === me ? "+" : "−"}${num(mine.amount)} ${mine.token}`, gain: mine.to?.toLowerCase() === me };
  if (tx.direction !== "involved" && tx.native_value > 0)
    return { text: `${tx.direction === "in" ? "+" : "−"}${num(tx.native_value)} ETH`, gain: tx.direction === "in" };
  return { text: tx.event ?? "contract call", gain: undefined };
}

export function ActivityFeed({ data }: { data: Activity }) {
  const [all, setAll] = useState(false);
  const me = data.address.toLowerCase();
  const txs = data.transactions;
  const count = (d: Tx["direction"]) => txs.filter((t) => t.direction === d).length;
  const tokens = new Set(txs.flatMap((t) => t.transfers?.map((x) => x.token) ?? []));
  const shown = all ? txs : txs.slice(0, 6);

  return (
    <div className="border bg-background font-mono text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <Sparkles className="size-3.5 text-primary" />
        <span className="font-bold text-foreground uppercase">Dossier</span>
        <span className="text-primary">{short(data.address)}</span>
        <span className="ml-auto bg-muted px-1.5 py-0.5 text-muted-foreground uppercase">{data.chain}</span>
      </div>

      <div className="grid grid-cols-4 border-b text-center">
        {[
          ["txs", txs.length],
          ["in", count("in")],
          ["out", count("out")],
          ["tokens", tokens.size],
        ].map(([label, value]) => (
          <div key={label} className="border-r px-2 py-2 last:border-r-0">
            <p className="text-lg font-bold text-foreground">{value}</p>
            <p className="text-muted-foreground uppercase">{label}</p>
          </div>
        ))}
      </div>

      <ul>
        {shown.map((tx) => {
          const h = headline(tx, me);
          return (
            <li key={tx.link} className="flex items-center gap-2 border-b px-3 py-1.5 last:border-b-0 hover:bg-muted">
              <span className={cn("w-14 shrink-0 py-0.5 text-center text-[10px] font-bold", PILL[tx.direction].className)}>
                {PILL[tx.direction].label}
              </span>
              {h.gain === true && <ArrowDownLeft className="size-3.5 shrink-0 text-primary" />}
              {h.gain === false && <ArrowUpRight className="size-3.5 shrink-0 text-destructive" />}
              <span className={cn("truncate", tx.failed && "text-destructive line-through")}>{h.text}</span>
              {tx.direction !== "involved" && tx.value_usd > 0 && <span className="text-muted-foreground">{usd(tx.value_usd)}</span>}
              <span className="ml-auto shrink-0 text-muted-foreground">{ago(tx.when)}</span>
              <a href={tx.link} target="_blank" rel="noreferrer" aria-label="View transaction" className="shrink-0 text-muted-foreground hover:text-primary">
                <ExternalLink className="size-3.5" />
              </a>
            </li>
          );
        })}
      </ul>

      {txs.length > 6 && (
        <button onClick={() => setAll(!all)} className="w-full border-t px-3 py-1.5 text-muted-foreground uppercase hover:bg-muted hover:text-primary">
          {all ? "Show less" : `Show all ${txs.length}`}
        </button>
      )}
    </div>
  );
}

const SUS_LINE = /^.*sus\W*o\W*meter\D*?(\d{1,2})\s*\/\s*10\W*(.*)$/im;
const VERDICTS = ["squeaky clean", "squeaky clean", "squeaky clean", "mildly spicy", "mildly spicy", "side-eye", "side-eye", "sus", "sus", "ultra sus", "ultra sus"];

function SusMeter({ score, why }: { score: number; why: string }) {
  const color = score <= 3 ? "bg-primary" : score <= 6 ? "bg-amber-400" : "bg-destructive";
  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-baseline justify-between font-mono uppercase">
        <span className="text-xs text-muted-foreground">Sus-o-meter</span>
        <span className="text-xs text-muted-foreground">{VERDICTS[score]}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <span className="font-mono text-3xl leading-none font-bold">{score}<span className="text-base text-muted-foreground">/10</span></span>
        <div className="flex flex-1 gap-1" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={10} aria-label="Sus-o-meter">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={cn("h-3 flex-1", i < score ? color : "bg-secondary")} />
          ))}
        </div>
      </div>
      {why && <p className="mt-2 text-sm text-muted-foreground">{why}</p>}
    </div>
  );
}

/** The agent's markdown reply, with explorer links shrunk to chips and the sus line turned into a meter. */
export function Reply({ text }: { text: string }) {
  const m = text.match(SUS_LINE);
  const score = m ? Math.min(10, Number(m[1])) : null;
  const body = m ? text.replace(m[0], "") : text;
  const why = m?.[2].replace(/[*_()]/g, "").replace(/^[\s–—-]+/, "") ?? "";

  return (
    <div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <p className="mb-2 font-bold tracking-tight uppercase" {...p} />,
          h2: (p) => <p className="mt-3 mb-1 font-bold tracking-tight text-primary uppercase first:mt-0" {...p} />,
          h3: (p) => <p className="mt-3 mb-1 font-bold tracking-tight text-primary uppercase first:mt-0" {...p} />,
          p: (p) => <p className="my-1.5 first:mt-0 last:mb-0" {...p} />,
          ul: (p) => <ul className="my-1.5 flex flex-col gap-1 pl-4 [&>li]:list-['▸_'] [&>li]:marker:text-primary" {...p} />,
          ol: (p) => <ol className="my-1.5 flex list-decimal flex-col gap-1 pl-5 marker:text-primary" {...p} />,
          strong: (p) => <strong className="font-bold text-foreground" {...p} />,
          code: (p) => <code className="bg-background px-1 font-mono text-[0.85em] text-primary" {...p} />,
          hr: () => <hr className="my-3 border-border" />,
          table: (p) => <div className="my-2 overflow-x-auto"><table className="w-full font-mono text-xs" {...p} /></div>,
          th: (p) => <th className="border-b px-2 py-1 text-left text-muted-foreground uppercase" {...p} />,
          td: (p) => <td className="border-b px-2 py-1" {...p} />,
          a: ({ href = "", children }) => {
            const bare = typeof children === "string" && children === href;
            const host = bare ? new URL(href).hostname.replace(/^www\./, "").split(".")[0] : "";
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "text-primary hover:underline",
                  bare && "mx-0.5 inline-flex items-center gap-1 border border-primary/40 px-1 align-middle font-mono text-[10px]",
                )}
              >
                {bare ? <><span className="uppercase">{host}</span> {short(href.split("/").pop())}<ExternalLink className="size-2.5" /></> : children}
              </a>
            );
          },
        }}
      >
        {body}
      </ReactMarkdown>
      {score !== null && <SusMeter score={score} why={why} />}
    </div>
  );
}
