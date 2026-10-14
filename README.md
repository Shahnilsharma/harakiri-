# Onchain Gossip

**Ask what anyone is doing on-chain. The agent pays for the answer with its own wallet.**

> "What's vitalik doing on-chain?"

1. The agent resolves `vitalik` to `vitalik.eth` and then to `0xd8dA…6045` (free ENS lookup).
2. It pays [GoldRush](https://goldrush.dev/docs/goldrush-x402/overview) 0.02 test USDC over **x402** for that address's real recent transactions.
3. It picks out the newest move, the biggest move, and anything weird, then rates it on a **sus-o-meter**.

You pay with test USDC on Base Sepolia, but the data is real mainnet activity (Ethereum, Base, Arbitrum, Optimism, Polygon).

Built on the [agentmaxxin](https://www.npmjs.com/package/agentmaxxin) template (Next.js + Gemini + a viem wallet).

## Prerequisites

1. Node.js 20 or newer.
2. A free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
3. Test USDC on Base Sepolia from [Circle's faucet](https://faucet.circle.com). Each lookup costs 0.02 USDC. You don't need ETH, because x402 payments are gasless signatures and GoldRush's facilitator pays the gas.

## Setup

### Step 1. Install

```bash
npm install
```

### Step 2. Add your Gemini key

Create `.env` in the project root:

```bash
GEMINI_API_KEY=your_key_here
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
| `get_wallet_activity` | 0.02 USDC | GoldRush `transactions_v3` (`tier=medium`) over x402. Returns the newest 40 transactions, trimmed to time, direction (`in` / `out` / `involved` = someone else's tx that only airdropped to this address), value, USD value, decoded event, and up to 3 token transfers (ones touching the address first). |
| `get_my_wallet` | Free | The agent's own address and balance. |

The template's weather, dice, joke, and country tools are still there.

## Writing Good Tools

Every tool has four parts.

| Field | Purpose |
| :--- | :--- |
| `name` | A unique identifier in snake case, such as `get_weather`. |
| `description` | Plain English explaining what the tool does. Gemini reads this to decide when to use it, so be clear and specific. |
| `parameters` | A JSON Schema describing the inputs. Gemini fills in these values for you. |
| `run` | The function that does the work. Whatever it returns is sent back to Gemini. |

A few guidelines:

1. Return plain objects, for example `{ temperature: 28 }`, rather than strings or class instances.
2. Keep each tool focused on one job. Several small tools work better than one large tool.
3. If something can fail, let it throw. The agent loop catches the error and reports it back to Gemini, which can then explain the problem or try again.

## How It Works

### The agent loop

The loop lives in `agent/agent.ts`.

1. Your message and the list of tools are sent to Gemini.
2. If Gemini replies with a tool call, the matching `run` function is executed and its result is sent back to Gemini.
3. This repeats until Gemini replies with plain text, which becomes the final answer.
4. The loop stops after five rounds to prevent runaway tool calls.

### Paying for an API

The weather tool demonstrates the x402 pattern, where an agent pays for an API one request at a time.

1. The agent requests `/api/weather`.
2. The API responds with status `402 Payment Required` along with a price, an asset, and a recipient address.
3. The agent wallet signs a payment message for that amount.
4. The agent repeats the request with the signed payment in an `X-PAYMENT` header.
5. The API verifies the signature and responds with status `200 OK` and the weather data.

All of this is handled by the `payAndFetch` helper in `agent/wallet.ts`. Any tool that calls a paid API can use the same helper.

`payAndFetch` is the template's toy version: it signs a message that only our mock `/api/weather` understands, and nothing touches a blockchain.

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
| `agent/wallet.ts` | The agent wallet, the ETH and USDC balance, real x402 (`x402Fetch`), and the toy `payAndFetch`. |
| `app/page.tsx` | The page: setup steps, tools list, and chat. |
| `app/api/agent/route.ts` | The server endpoint that runs the agent. |
| `app/api/wallet/route.ts` | The server endpoint that creates and reads the agent wallet. |
| `app/api/weather/route.ts` | The mock paid weather API. |
| `components/ui/` | Interface components from [shadcn/ui](https://ui.shadcn.com). You do not need to edit these. |
| `.env` | Your API key and optional settings. |
| `.agent-wallet.json` | The agent wallet, created when you click Create wallet. Never share this file. |

## Configuration

All settings live in the `.env` file.

| Variable | Required | Description |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Yes | Your Gemini API key. |
| `GEMINI_MODEL` | No | The Gemini model to use. Defaults to `gemini-flash-latest`. |
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
| The page says to add `GEMINI_API_KEY` | Add your key to `.env` and restart `npm run dev`. |
| The agent never uses my new tool | Make the `description` more specific about when the tool should be used, then restart the server. |
| A tool fails with "no wallet yet" | Click **Create wallet** in the Setup panel, then ask again. |
| `402 ... invalid_exact_evm_signature` | The wallet is EIP-7702-delegated, which usually means it's a public test key. Remove `WALLET_PRIVATE_KEY` from `.env`, delete `.agent-wallet.json`, restart, and click **Create wallet**. |
| `402` with no error, or a balance error | The wallet needs Base Sepolia USDC from [faucet.circle.com](https://faucet.circle.com). |
| "does not resolve to an address" | That ENS name has no address set. Pass a `0x` address instead. |
| Port 3000 is already in use | Run `npm run dev -- -p 3001` and open that port instead. |
| A model error appears in the chat | Check that your API key is valid, or set a different model in `GEMINI_MODEL`. |

## Tech Stack

1. [Next.js](https://nextjs.org) for the app and API routes.
2. [shadcn/ui](https://ui.shadcn.com) and [Tailwind CSS](https://tailwindcss.com) for the interface.
3. [Google Gen AI SDK](https://www.npmjs.com/package/@google/genai) for Gemini function calling.
4. [x402](https://www.x402.org) (`@x402/fetch`, `@x402/evm`) for real pay-per-request API calls.
5. [GoldRush](https://goldrush.dev) for multichain transaction data.
6. [viem](https://viem.sh) for wallet creation, message signing, and reading Base Sepolia.

## License

MIT
