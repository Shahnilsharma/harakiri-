<p align="center"><img src="public/Harakiri.png" alt="Harakiri logo" width="96"></p>

# Harakiri | Onchain Gossip

**Ask what anyone is doing on-chain. The agent pays for the answer with its own wallet.**

**Live app:** https://harakiri-one.vercel.app

## The problem

Wallet activity is public, but reading it is not. Block explorers show raw hex, hundreds of spam airdrops and decoded events nobody understands. Good transaction data sits behind API keys and subscriptions. Harakiri turns "what is this wallet up to?" into a plain-English answer: the agent pays for the data itself (per request, over x402, no API key or account) and reports the newest, biggest and weirdest moves, with a link for every claim.

## Key features

- **An agent with its own wallet.** It signs x402 payments (EIP-3009 USDC on Base Sepolia) to buy data from GoldRush, 0.02 USDC per lookup.
- **Real mainnet data.** Ethereum, Base, Arbitrum, Optimism and Polygon transactions, not mocks.
- **ENS resolution.** Ask about `vitalik` or `nick.eth`; it finds the address.
- **Dossier card.** Each lookup shows in/out counts, tokens, and IN / OUT / TAGGED pills that link to the explorer.
- **Sus-o-meter.** Every answer ends with a 0-10 rating and a one-line reason.
- **Spend guardrails in code.** At most $0.05 per payment and 2 paid lookups per question; testnet only.
- **Prompt-injection defenses.** Token names are treated as untrusted data, and only explorer links are clickable (allowlist).
- **Multi-wallet questions.** Covers 2 wallets per question and names the ones it skipped.

## Supported AI models

| Provider | Model | Notes |
| :--- | :--- | :--- |
| [Groq](https://console.groq.com/docs/models) (OpenAI-compatible API, `openai` SDK 7.25.0) | `openai/gpt-oss-120b` | Default. Tool calling. |

You can swap in any Groq model that supports tool use with `GROQ_MODEL` in `.env`. There is no in-app model switcher.

## Tools

| Tool | Cost | What it does |
| :--- | :--- | :--- |
| `resolve_name` | Free | ENS name to address. |
| `get_wallet_activity` | 0.02 test USDC (x402) | Newest 40 transactions for an address on a chosen chain, via GoldRush. |
| `get_my_wallet` | Free | The agent's own address and ETH/USDC balance. |

The details are in [The tools](#the-tools).

## Tech stack

| Layer | What | Version |
| :--- | :--- | :--- |
| Runtime | Node.js | 20+ (built on 24.19.0) |
| Framework | Next.js (App Router, API routes) | 16.4.0 |
| UI | React / React DOM | 19.3.0 |
| Styling | Tailwind CSS, shadcn/ui, Base UI | 4.3.3 / 4.21.5 / 1.9.0 |
| Markdown replies | react-markdown, remark-gfm | 10.1.0 / 4.0.1 |
| Icons | lucide-react | 1.57.0 |
| LLM client | openai (pointed at Groq) | 7.25.0 |
| Wallet / chain | viem | 2.57.6 |
| Payments | @x402/core, @x402/fetch, @x402/evm | 2.28.0 |
| Data | GoldRush `transactions_v3` over x402 | - |
| Language | TypeScript | 5.9.3 |



## Future scope

- **Week 3:** watchlists with alerts when a followed wallet makes a big move; gossip about NFT and DeFi positions, not just transfers.
- Rate limiting and a per-day spend budget for the public endpoint.
- ZK proof that the agent's data really came from the paid API (verifiable gossip).
- Agent-to-agent: let other agents pay this one over x402 for a gossip report.

## Social

- X / Twitter: https://x.com/harakiripigeon
- GitHub: https://github.com/Shahnilsharma/harakiri-

---

## How it answers

> "What's vitalik doing on-chain?"

1. The agent resolves `vitalik` to `vitalik.eth` and then to `0xd8dA…6045` (free ENS lookup).
2. It pays [GoldRush](https://goldrush.dev/docs/goldrush-x402/overview) 0.02 test USDC over **x402** for that address's real recent transactions.
3. It picks out the newest move, the biggest move, and anything weird, then rates it on a **sus-o-meter**.

You pay with test USDC on Base Sepolia, but the data is real mainnet activity (Ethereum, Base, Arbitrum, Optimism, Polygon).

Built on the [agentmaxxin](https://www.npmjs.com/package/agentmaxxin) template (Next.js + a viem wallet), running on [Groq](https://console.groq.com) through its OpenAI-compatible API.

## Prerequisites

1. Node.js 20 or newer.
2. A free Groq API key from [console.groq.com/keys](https://console.groq.com/keys).
3. Test USDC on Base Sepolia from [Circle's faucet](https://faucet.circle.com). Each lookup costs 0.02 USDC. You don't need ETH, because x402 payments are gasless signatures and GoldRush's facilitator pays the gas.

## Setup

### Step 1. Install

```bash
npm install
```

### Step 2. Add your Groq key

Create `.env` in the project root:

```bash
GROQ_API_KEY=your_key_here
```

### Step 3. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Step 4. Create and fund the wallet

1. In the Setup panel, click **Create wallet**. The key is saved to `.agent-wallet.json`.
2. Copy the address. On [faucet.circle.com](https://faucet.circle.com), pick **Base Sepolia** and send USDC to it.
3. Click refresh next to **Balance**. It shows ETH and USDC, for example `0 ETH · 10 USDC`.

> **Don't use a well-known test key** (such as Hardhat/Anvil's `0xac0974…` / `0xf39F…6266`) in `WALLET_PRIVATE_KEY`. Those accounts are EIP-7702-delegated to sweeper contracts on public testnets, and GoldRush rejects their payments with `invalid_exact_evm_signature`. Use a fresh wallet.

## Using it

| Prompt | What happens |
| :--- | :--- |
| `What's vitalik doing on-chain?` | `resolve_name` → `get_wallet_activity` on eth-mainnet → gossip and a sus-o-meter. |
| `Anything sus in jessepollak.eth's Base activity?` | Same flow, but on `base-mainnet`. |
| `What's in your wallet?` | Shows the agent's address and its ETH and USDC balance. |

Each answer comes with a **dossier card** showing the fetched transactions: in/out counts, tokens, and colored `IN` / `OUT` / `TAGGED` pills (`TAGGED` means someone else's tx that only airdropped to the address). Each row links to the explorer. The reply ends with a 10-segment **sus-o-meter**.

Any ENS name or `0x` address works. Name the chain in your prompt to switch from Ethereum. Click a tool entry above a reply to see the raw inputs, the trimmed transactions, and the payment (with a Basescan link when GoldRush returns a settlement tx).

**About "sus":** the transactions are real; the sus-o-meter is the AI's opinion. The persona is told never to claim intent or accuse anyone, and to point out spam tokens airdropped *to* famous wallets, which make up most of the "weird" activity.

### Which famous names work

An ENS name resolving does **not** mean the celebrity owns it. Anyone could have registered `modi.eth` or `srk.eth`. As of 2026-10-14:

- **Good for demos** (names these people are publicly known to use; most carry matching Twitter/website records): `vitalik.eth`, `parishilton.eth`, `markcuban.eth`, `loganpaul.eth`, `barmstrong.eth` (Brian Armstrong), `cozomomedici.eth` (Snoop Dogg), `garyvee.eth`, `balajis.eth`, `stani.eth`, `haydenadams.eth`.
- **Resolve, but ownership is unverified** (probably squatters): `elonmusk.eth`, `modi.eth`, `waqarzaka.eth`, `trump.eth`, `donaldtrump.eth`, `realdonaldtrump.eth`, `salmankhan.eth`, `shahrukhkhan.eth`, `srk.eth`. Don't present their activity as the celebrity's.
- **Don't resolve:** `elon.eth`, `narendramodi.eth`, `snoopdogg.eth`, `jimmyfallon.eth`, `cz.eth`.

Tip: say "what's Snoop Dogg doing? his ENS is cozomomedici.eth". The agent won't guess the alias on its own.

### The tools

| Tool | Cost | What it does |
| :--- | :--- | :--- |
| `resolve_name` | Free | ENS name → address, via a public Ethereum RPC. Falls back to a few hardcoded names (vitalik, nick, sassal, jessepollak, punk6529) so the demo never fails on resolution. |
| `get_wallet_activity` | 0.02 USDC | GoldRush `transactions_v3` (`tier=medium`) over x402. Returns the newest 40 transactions, trimmed to time, direction (`in` / `out` / `involved` = someone else's tx that only airdropped to this address), value, USD value, decoded event, up to 3 token transfers (ones touching the address first), and an explorer link. The agent cites those links, and the payment's Basescan link shows under the tool call. |
| `get_my_wallet` | Free | The agent's own address and balance. |

## How It Works

### The agent loop

The loop lives in `agent/agent.ts`.

1. Your message and the list of tools are sent to Groq (`openai` SDK, `baseURL: https://api.groq.com/openai/v1`).
2. If the model replies with `tool_calls`, the matching `run` functions are executed and each result goes back as a `role: "tool"` message with its `tool_call_id`.
3. This repeats until the model replies with plain text, which becomes the final answer.
4. The loop stops after eight rounds to prevent runaway tool calls, and refuses a third paid lookup in one question.

### Real x402 (GoldRush)

`x402Fetch` in `agent/wallet.ts` speaks the real protocol, using the official `@x402/fetch` and `@x402/evm` packages:

1. The request gets back `402` with a `PAYMENT-REQUIRED` header (price, USDC contract, recipient, network `eip155:84532`).
2. The wallet signs an EIP-3009 `transferWithAuthorization` for exactly that amount.
3. The request is retried with the signature. GoldRush's facilitator settles the USDC transfer on Base Sepolia and the API returns the data.

## Project Structure

| Path | Description |
| :--- | :--- |
| `agent/tools.ts` | The tools, including `resolve_name` and `get_wallet_activity`. |
| `agent/agent.ts` | The agent loop and the gossip-detective persona (`SYSTEM_PROMPT`). |
| `agent/wallet.ts` | The agent wallet, the ETH and USDC balance, and real x402 payments (`x402Fetch`). |
| `app/page.tsx` | The page: setup steps, tools list, and chat (saved in the browser until you click Clear). |
| `components/gossip.tsx` | The dossier card, markdown replies and the sus-o-meter. |
| `components/swing-chain.tsx` | The swinging 3D chain hanging off the logo. |
| `app/api/agent/route.ts` | The server endpoint that runs the agent. |
| `app/api/wallet/route.ts` | The server endpoint that creates and reads the agent wallet. |
| `components/ui/` | Interface components from [shadcn/ui](https://ui.shadcn.com). You do not need to edit these. |
| `.env` | Your API key and optional settings. |
| `.agent-wallet.json` | The agent wallet, created when you click Create wallet. Never share this file. |

## Configuration

All settings live in the `.env` file.

| Variable | Required | Description |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | Yes | Your Groq API key. |
| `GROQ_MODEL` | No | The Groq model to use. Defaults to `openai/gpt-oss-120b`. It must support tool use. `llama-3.3-70b-versatile` is no longer offered. |
| `WALLET_PRIVATE_KEY` | No | Use an existing wallet instead of the Create wallet button. A private key starting with `0x`. When set, it takes priority over `.agent-wallet.json`. |

Restart `npm run dev` after changing any value in `.env`.

## The Agent Wallet

Clicking **Create wallet** generates a new private key and saves it to `.agent-wallet.json`. The file is listed in `.gitignore`, so it is never committed.

Once the wallet exists, the Setup panel shows:

1. The wallet address, with a button to copy it.
2. The current ETH and USDC balance on Base Sepolia, with a refresh button.
3. A link to view the wallet on the Base Sepolia block explorer.
4. A link to faucets. For this agent you need test USDC from [faucet.circle.com](https://faucet.circle.com), not ETH.

To start again with a new wallet, stop the server, delete `.agent-wallet.json`, restart, and click **Create wallet** again.

To use a wallet you already have, set `WALLET_PRIVATE_KEY` in `.env` instead.

> **Security note:** Only ever use this wallet for testing. Never send real funds to it. Private keys in `.agent-wallet.json` and `.env` are stored as plain text.

## Troubleshooting

| Problem | Solution |
| :--- | :--- |
| The page says to add `GROQ_API_KEY` | Add your key to `.env` and restart `npm run dev`. |
| A tool fails with "no wallet yet" | Click **Create wallet** in the Setup panel, then ask again. |
| `402 ... invalid_exact_evm_signature` | The wallet is EIP-7702-delegated, which usually means it's a public test key. Remove `WALLET_PRIVATE_KEY` from `.env`, delete `.agent-wallet.json`, restart, and click **Create wallet**. |
| `402` with no error, or a balance error | The wallet needs Base Sepolia USDC from [faucet.circle.com](https://faucet.circle.com). |
| "does not resolve to an address" | That ENS name has no address set. Pass a `0x` address instead. |
| Port 3000 is already in use | Run `npm run dev -- -p 3001` and open that port instead. |
| A model error appears in the chat | Check that your API key is valid, or set a different model in `GROQ_MODEL`. |
| `413 Request too large ... tokens per minute` | Groq's free tier caps tokens per minute. Lower `MAX_TOOL_CHARS` in `agent/agent.ts`, or upgrade the Groq tier. |
| `429` errors | Rate limited. The SDK retries automatically with exponential backoff (up to 5 times, honoring `retry-after`). If it still fails, wait a minute. |

## License

MIT
