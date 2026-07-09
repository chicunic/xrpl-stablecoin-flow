import { expect } from "vitest";
import {
  type AccountLinesTrustline,
  type AccountSet,
  AccountSetAsfFlags,
  type Client,
  type Payment,
  type TrustSet,
  Wallet,
  convertStringToHex,
  dropsToXrp,
} from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

import { getXRPLClient, initializeXRPLClient } from "@/config/xrpl.config.js";
import { currencyToHex, getAccountFlags, hasFlag, submitTransaction } from "@/services/transaction.service.js";
import { fundWallet } from "./fund.helper.js";
import { CURRENCY, DOMAIN, TRUST_AMOUNT } from "./data.js";

// Resolves to a fixed-length tuple when `count` is a literal, so callers can destructure without `!`
type WalletTuple<N extends number, A extends Wallet[] = []> = number extends N
  ? Wallet[]
  : A["length"] extends N
    ? A
    : WalletTuple<N, [...A, Wallet]>;

// Assert that a transaction fails with the given result code (tec/tef/tem/ter)
export async function expectTxFail(expectedResult: string, action: () => Promise<unknown>): Promise<void> {
  await expect(action()).rejects.toThrow(expectedResult);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Connect the shared XRPL client at suite start, logging the suite name
export async function connectClient(suiteName: string): Promise<Client> {
  console.log(`🚀 Starting ${suiteName}`);
  await initializeXRPLClient();
  return getXRPLClient();
}

// Disconnect the shared XRPL client at suite end
export async function disconnectClient(client: Client): Promise<void> {
  if (client.isConnected()) {
    await client.disconnect();
    console.log("✅ Disconnected from XRPL");
  }
}

// Find a specific trust line between a wallet and a peer account
export async function findTrustLine(
  wallet: Wallet,
  peer: Wallet,
  currency = CURRENCY,
): Promise<AccountLinesTrustline | undefined> {
  const client = getXRPLClient();
  const accountLines = await client.request({
    command: "account_lines",
    account: wallet.address,
    peer: peer.address,
  });
  return accountLines.result.lines.find(
    (l: AccountLinesTrustline) => l.currency === currencyToHex(currency) && l.account === peer.address,
  );
}

// Generate and fund multiple wallets, verifying each has the expected balance
export async function setupWallets<N extends number>(count: N, fundAmount?: string): Promise<WalletTuple<N>>;
export async function setupWallets(count: number, fundAmount = "2"): Promise<Wallet[]> {
  const wallets = Array.from({ length: count }, () => Wallet.generate());

  for (const wallet of wallets) {
    await fundWallet(wallet, { amount: fundAmount });
  }

  const client = getXRPLClient();
  for (const wallet of wallets) {
    const info = await client.request({
      command: "account_info",
      account: wallet.address,
      ledger_index: "validated",
    });
    const balance = dropsToXrp(info.result.account_data.Balance);
    if (balance !== Number(fundAmount)) {
      throw new Error(`Wallet ${wallet.address} funded with ${String(balance)} XRP, expected ${fundAmount}`);
    }
  }

  return wallets;
}

// Configure an issuer account with DefaultRipple and optional additional flags
export async function setupIssuerWithFlags(issuer: Wallet, flags: AccountSetAsfFlags[] = []): Promise<void> {
  const client = getXRPLClient();

  const setupTx: AccountSet = await client.autofill({
    TransactionType: "AccountSet",
    Account: issuer.address,
    Domain: convertStringToHex(DOMAIN),
    SetFlag: AccountSetAsfFlags.asfDefaultRipple,
  });
  await submitTransaction(client, setupTx, issuer);

  for (const flag of flags) {
    const flagTx: AccountSet = await client.autofill({
      TransactionType: "AccountSet",
      Account: issuer.address,
      SetFlag: flag,
    });
    await submitTransaction(client, flagTx, issuer);
  }

  const accountFlags = await getAccountFlags(client, issuer.address);
  if (!hasFlag(accountFlags, AccountRootFlags.lsfDefaultRipple)) {
    throw new Error(`Issuer ${issuer.address} does not have lsfDefaultRipple set after setup`);
  }
}

// Create a trust line from a wallet to an issuer
export async function createTrustLine(
  wallet: Wallet,
  issuer: Wallet,
  currency = CURRENCY,
  limit = TRUST_AMOUNT,
): Promise<void> {
  const client = getXRPLClient();

  const trustTx: TrustSet = await client.autofill({
    TransactionType: "TrustSet",
    Account: wallet.address,
    LimitAmount: {
      currency: currencyToHex(currency),
      issuer: issuer.address,
      value: limit,
    },
  });
  await submitTransaction(client, trustTx, wallet);

  const line = await findTrustLine(wallet, issuer, currency);
  if (line?.limit !== limit) {
    throw new Error(
      `Trust line ${wallet.address} → ${issuer.address} has limit ${line?.limit ?? "none"}, expected ${limit}`,
    );
  }
}

// Mint (issue) tokens from issuer to destination
export async function mintTokens(issuer: Wallet, dest: Wallet, amount: string, currency = CURRENCY): Promise<void> {
  const client = getXRPLClient();

  const mintTx: Payment = await client.autofill({
    TransactionType: "Payment",
    Account: issuer.address,
    Destination: dest.address,
    Amount: {
      currency: currencyToHex(currency),
      issuer: issuer.address,
      value: amount,
    },
  });
  await submitTransaction(client, mintTx, issuer);
}

// Get the token balance of a wallet for a specific issuer/currency
export async function getTokenBalance(wallet: Wallet, issuer: Wallet, currency = CURRENCY): Promise<string> {
  const line = await findTrustLine(wallet, issuer, currency);
  return line?.balance ?? "0";
}
