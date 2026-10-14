/**
 * YOUR AGENT'S TOOLS
 *
 * A tool is just a function the agent is allowed to call.
 * Gemini reads the `description` to decide WHEN to use it,
 * and `parameters` to know WHAT to pass in.
 *
 * Add your own tool: copy one of the objects below, change it,
 * and save. It shows up in the "Tools" list on the page.
 */
import { createPublicClient, http, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { getWalletAddress, getWalletBalance, payAndFetch, x402Fetch } from "./wallet";

const ens = createPublicClient({ chain: mainnet, transport: http() });

// Demo insurance: verified 2026-10-14, used only if the live ENS lookup fails.
const KNOWN: Record<string, string> = {
  "vitalik.eth": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "nick.eth": "0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5",
  "sassal.eth": "0x648aA14e4424e0825A5cE739C8C68610e143FB79",
  "jessepollak.eth": "0x849151d7D0bF1F34b70d5caD5149D28CC2308bf1",
  "punk6529.eth": "0xfD22004806A6846EA67ad883356be810F0428793",
};

const CHAINS = ["eth-mainnet", "base-mainnet", "arbitrum-mainnet", "optimism-mainnet", "matic-mainnet"];

type Tx = {
  block_signed_at: string;
  tx_hash: string;
  successful: boolean;
  from_address: string;
  to_address: string | null;
  value: string;
  value_quote: number | null;
  log_events?: {
    sender_contract_ticker_symbol: string | null;
    sender_contract_decimals: number | null;
    sender_address: string;
    decoded: { name: string; params: { name: string; value: string }[] | null } | null;
  }[];
};

/** Shrink one GoldRush tx to what the gossip actually needs (raw logs are huge). */
function trimTx(tx: Tx, me: string) {
  const transfers = (tx.log_events ?? [])
    .filter((l) => l.decoded?.name === "Transfer" && l.sender_contract_ticker_symbol)
    .map((l) => {
      const p = Object.fromEntries((l.decoded!.params ?? []).map((x) => [x.name, x.value]));
      const amount = Number(p.value) / 10 ** (l.sender_contract_decimals ?? 18);
      return { token: l.sender_contract_ticker_symbol, amount, from: p.from, to: p.to, contract: l.sender_address };
    })
    // transfers touching this address first, then cap at 3
    .sort((a, b) => Number([b.from, b.to].includes(me)) - Number([a.from, a.to].includes(me)))
    .slice(0, 3);
  return {
    when: tx.block_signed_at,
    // "involved" = a stranger's tx (e.g. a token launch) that only touches this address via its logs/airdrops;
    // native_value/value_usd then belong to the stranger, not to this address.
    direction: tx.from_address?.toLowerCase() === me ? "out" : tx.to_address?.toLowerCase() === me ? "in" : "involved",
    from: tx.from_address,
    to: tx.to_address,
    native_value: Number(tx.value) / 1e18,
    value_usd: tx.value_quote ? Math.round(tx.value_quote) : 0,
    failed: !tx.successful || undefined,
    event: tx.log_events?.find((l) => l.decoded)?.decoded?.name,
    transfers: transfers.length ? transfers : undefined,
    tx_hash: tx.tx_hash,
  };
}

export type Tool = {
  name: string;
  description: string;
  /** JSON Schema describing the inputs. */
  parameters: object;
  /** The code that runs when the agent calls this tool. */
  run: (args: any, ctx: { baseUrl: string }) => Promise<unknown>;
};

export const tools: Tool[] = [
  {
    name: "resolve_name",
    description:
      "Turn a person's ENS name into an Ethereum address. Pass a full name like vitalik.eth; a bare name like 'vitalik' gets .eth added. Free.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "ENS name, e.g. vitalik.eth" } },
      required: ["name"],
    },
    run: async ({ name }) => {
      const ensName = normalize(name.includes(".") ? name : `${name}.eth`);
      const address = await ens.getEnsAddress({ name: ensName }).catch(() => null) ?? KNOWN[ensName];
      if (!address) throw new Error(`${ensName} does not resolve to an address.`);
      return { name: ensName, address };
    },
  },

  {
    name: "get_wallet_activity",
    description:
      "Get the most recent real on-chain transactions of any address via GoldRush. Costs 0.02 test USDC per call, paid by x402 from the agent's wallet. Pass a 0x address or an ENS name.",
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x address or ENS name, e.g. vitalik.eth" },
        chain: { type: "string", enum: CHAINS, description: "Which chain to read. Default eth-mainnet." },
      },
      required: ["address"],
    },
    run: async ({ address, chain = "eth-mainnet" }) => {
      if (!isAddress(address) && !address.includes(".")) throw new Error(`"${address}" is not a 0x address or ENS name. Resolve it first.`);
      if (!CHAINS.includes(chain)) throw new Error(`Unsupported chain ${chain}. Use one of ${CHAINS.join(", ")}.`);
      // ponytail: tier=medium ($0.02, up to 200 items) covers one transactions_v3 page; no pagination.
      const { data, payment } = await x402Fetch(
        `https://x402.goldrush.dev/v1/${chain}/address/${encodeURIComponent(address)}/transactions_v3/?tier=medium`,
      );
      const me = String(data.data.address ?? address).toLowerCase();
      const items: Tx[] = data.data.items ?? [];
      return {
        address: data.data.address ?? address,
        chain,
        // ponytail: newest 40 only, keeps Gemini's context small. Raise if the gossip feels thin.
        transactions: items.slice(0, 40).map((tx) => trimTx(tx, me)),
        payment,
      };
    },
  },

  // ─── 1. A paid API: the agent's wallet signs a payment to unlock it ───
  {
    name: "get_weather",
    description: "Get the current weather for a city. Costs 0.01 USDC, paid automatically from the agent's wallet.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name, e.g. Mumbai" },
      },
      required: ["city"],
    },
    run: async ({ city }, { baseUrl }) => {
      return payAndFetch(`${baseUrl}/api/weather?city=${encodeURIComponent(city)}`);
    },
  },

  // ─── 2. Wallet tool: read the agent's own wallet ───
  {
    name: "get_my_wallet",
    description: "Get the agent's own wallet address and its ETH and USDC balance on Base Sepolia (testnet).",
    parameters: { type: "object", properties: {} },
    run: async () => ({
      address: getWalletAddress(),
      balance: await getWalletBalance(),
      network: "Base Sepolia (testnet)",
    }),
  },

  // ─── 3. A plain tool: no wallet, no API. Try changing this one first! ───
  {
    name: "roll_dice",
    description: "Roll a dice with the given number of sides.",
    parameters: {
      type: "object",
      properties: {
        sides: { type: "number", description: "How many sides the dice has. Default 6." },
      },
    },
    run: async ({ sides = 6 }) => ({ rolled: Math.floor(Math.random() * sides) + 1, sides }),
  },
  
  {
    name: "get_joke",
    description: "Get a random joke. Use when the user wants a joke.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const res = await fetch(
        "https://official-joke-api.appspot.com/random_joke"
        );
      return res.json();
    },
  },

  {
  name: "get_country_info",
  description: "Get facts about a country, including its capital and population.",
  parameters: {
    type: "object",
    properties: {
      country: {
        type: "string",
        description: "Country name, e.g. India",
      },
    },
    required: ["country"],
  },
  run: async ({ country }) => {
    const res = await fetch(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`
    );
    if (!res.ok) {
      throw new Error(`Country not found: ${country}`);
    }
    const [data] = await res.json();
    return {
      capital: data.capital?.[0] ?? "unknown",
      population: data.population,
      region: data.region,
    };
  },
}
];
