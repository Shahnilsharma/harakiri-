/**
 * THE AGENT'S WALLET
 *
 * The agent owns a wallet (a private key). It uses it to sign payments,
 * so it can pay for APIs on its own. This is the "x402" idea:
 *
 *   1. Agent calls an API         ->  API answers "402 Payment Required" + a price
 *   2. Agent signs a payment      ->  with its wallet
 *   3. Agent retries with payment ->  API checks the signature and answers 200 OK
 *
 * You create the wallet with the "Create wallet" button on the page.
 * It is saved in `.agent-wallet.json` so it survives restarts.
 *
 * Payments are test USDC on Base Sepolia, settled on-chain by the API's facilitator.
 */
import fs from "fs";
import path from "path";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { createPublicClient, erc20Abi, formatEther, formatUnits, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const WALLET_FILE = path.join(process.cwd(), ".agent-wallet.json");
const chain = createPublicClient({ chain: baseSepolia, transport: http() });

/** The wallet from .env or .agent-wallet.json, or null if none was created yet. */
function loadAccount() {
  const key = process.env.WALLET_PRIVATE_KEY || (fs.existsSync(WALLET_FILE) && JSON.parse(fs.readFileSync(WALLET_FILE, "utf8")).privateKey);
  return key ? privateKeyToAccount(key as Hex) : null;
}

function requireAccount() {
  const account = loadAccount();
  if (!account) throw new Error("The agent has no wallet yet. Ask the user to click 'Create wallet' first.");
  return account;
}

/** Make a brand new wallet and save it. */
export function createWallet() {
  if (loadAccount()) return getWalletAddress();
  const privateKey = generatePrivateKey();
  fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey }, null, 2));
  return privateKeyToAccount(privateKey).address;
}

export function getWalletAddress() {
  return loadAccount()?.address ?? null;
}

// Circle's test USDC on Base Sepolia: what real x402 servers (GoldRush) charge in.
const USDC: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export async function getWalletBalance() {
  const address = requireAccount().address;
  const [wei, usdc] = await Promise.all([
    chain.getBalance({ address }),
    chain.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
  ]);
  return `${formatEther(wei)} ETH · ${formatUnits(usdc, 6)} USDC`;
}

/**
 * Real x402: sign an EIP-3009 USDC transfer and let the server's facilitator settle it on Base Sepolia.
 */
export async function x402Fetch(url: string) {
  // Hard cap per payment, enforced by the x402 client before signing (its default is $1).
  const client = new x402Client()
    .setSpendControls({ maxAmountPerPayment: "$0.05" })
    .register("eip155:84532", new ExactEvmScheme(requireAccount()));
  const res = await wrapFetchWithPayment(fetch, client)(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // x402 v2 puts the real reason in the PAYMENT-REQUIRED header; the body is just {}.
    const pr = res.headers.get("PAYMENT-REQUIRED");
    const reason = pr ? JSON.parse(Buffer.from(pr, "base64").toString()).error : JSON.stringify(body)?.slice(0, 300);
    const hint =
      reason === "invalid_exact_evm_signature"
        ? " The wallet can't sign payments, usually because it's a public test key (EIP-7702-delegated). Use a fresh wallet."
        : /insufficient|balance/i.test(reason) ? " Fund the wallet with Base Sepolia USDC at faucet.circle.com." : "";
    throw new Error(`${res.status} from ${new URL(url).host}: ${reason}.${hint}`);
  }
  const receipt = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  const settled = receipt ? decodePaymentResponseHeader(receipt) : null;
  return {
    data: body,
    payment: {
      amount: `${res.headers.get("X-Paid-Price") ?? res.headers.get("X-Actual-Price") ?? ""} USDC`.trim(),
      tx: settled?.transaction ? `https://sepolia.basescan.org/tx/${settled.transaction}` : null,
    },
  };
}
