import type {
  AccountSet,
  CheckCancel,
  CheckCash,
  CheckCreate,
  Clawback,
  CreatedNode,
  DepositPreauth,
  Payment,
  TrustSet,
  Wallet,
} from "xrpl";
import { type AccountSetAsfFlags, TrustSetFlags, convertStringToHex, xrpToDrops } from "xrpl";

import { getXRPLClient } from "@/config/xrpl.config.js";
import { currencyToHex, getAccountFlags, hasFlag, submitTransaction } from "./transaction.service.js";

const CURRENCY = "USD";
const DOMAIN = "example.com";

// ─── Account Flag Operations ────────────────────────────────────────────────

export async function setAccountFlag(wallet: Wallet, flag: AccountSetAsfFlags): Promise<void> {
  const client = getXRPLClient();
  const tx: AccountSet = await client.autofill({
    TransactionType: "AccountSet",
    Account: wallet.address,
    SetFlag: flag,
  });
  await submitTransaction(client, tx, wallet);
}

export async function clearAccountFlag(wallet: Wallet, flag: AccountSetAsfFlags): Promise<void> {
  const client = getXRPLClient();
  const tx: AccountSet = await client.autofill({
    TransactionType: "AccountSet",
    Account: wallet.address,
    ClearFlag: flag,
  });
  await submitTransaction(client, tx, wallet);
}

export async function setupIssuerWithDomain(wallet: Wallet): Promise<void> {
  const client = getXRPLClient();
  const tx: AccountSet = await client.autofill({
    TransactionType: "AccountSet",
    Account: wallet.address,
    Domain: convertStringToHex(DOMAIN),
  });
  await submitTransaction(client, tx, wallet);
}

export async function verifyAccountFlag(address: string, flag: number, expected: boolean): Promise<void> {
  const client = getXRPLClient();
  const flags = await getAccountFlags(client, address);
  if (hasFlag(flags, flag) !== expected) throw new Error(`Expected ${expected}, but got ${hasFlag(flags, flag)}`);
}

// ─── Transfer Rate Operations ───────────────────────────────────────────────

export async function setTransferRate(issuer: Wallet, transferRate: number): Promise<void> {
  const client = getXRPLClient();
  const tx: AccountSet = await client.autofill({
    TransactionType: "AccountSet",
    Account: issuer.address,
    TransferRate: transferRate,
  });
  await submitTransaction(client, tx, issuer);
}

// ─── Trust Line Operations ──────────────────────────────────────────────────

async function setTrustLineFlag(issuer: Wallet, user: Wallet, flags: TrustSetFlags, currency: string): Promise<void> {
  const client = getXRPLClient();
  const tx: TrustSet = await client.autofill({
    TransactionType: "TrustSet",
    Account: issuer.address,
    LimitAmount: {
      currency: currencyToHex(currency),
      issuer: user.address,
      value: "0",
    },
    Flags: flags,
  });
  await submitTransaction(client, tx, issuer);
}

export async function freezeTrustLine(issuer: Wallet, user: Wallet, currency = CURRENCY): Promise<void> {
  await setTrustLineFlag(issuer, user, TrustSetFlags.tfSetFreeze, currency);
}

export async function unfreezeTrustLine(issuer: Wallet, user: Wallet, currency = CURRENCY): Promise<void> {
  await setTrustLineFlag(issuer, user, TrustSetFlags.tfClearFreeze, currency);
}

// Deep freeze (XLS-77) requires the trust line to already be frozen by the issuer
export async function deepFreezeTrustLine(issuer: Wallet, user: Wallet, currency = CURRENCY): Promise<void> {
  await setTrustLineFlag(issuer, user, TrustSetFlags.tfSetDeepFreeze, currency);
}

export async function clearDeepFreezeTrustLine(issuer: Wallet, user: Wallet, currency = CURRENCY): Promise<void> {
  await setTrustLineFlag(issuer, user, TrustSetFlags.tfClearDeepFreeze, currency);
}

export async function clearNoRippleOnTrustLine(issuer: Wallet, user: Wallet, currency = CURRENCY): Promise<void> {
  await setTrustLineFlag(issuer, user, TrustSetFlags.tfClearNoRipple, currency);
}

export async function authorizeTrustLine(issuer: Wallet, user: Wallet, currency = CURRENCY): Promise<void> {
  await setTrustLineFlag(issuer, user, TrustSetFlags.tfSetfAuth, currency);
}

// ─── Token Transfer Operations ──────────────────────────────────────────────

export async function transferTokens(
  sender: Wallet,
  dest: Wallet,
  amount: string,
  issuer: Wallet,
  options: { currency?: string; sendMax?: string } = {},
): Promise<void> {
  const { currency = CURRENCY, sendMax } = options;
  const client = getXRPLClient();
  const tx: Payment = await client.autofill({
    TransactionType: "Payment",
    Account: sender.address,
    Destination: dest.address,
    Amount: {
      currency: currencyToHex(currency),
      issuer: issuer.address,
      value: amount,
    },
    ...(sendMax ? { SendMax: { currency: currencyToHex(currency), issuer: issuer.address, value: sendMax } } : {}),
  });
  await submitTransaction(client, tx, sender);
}

export async function transferXRP(sender: Wallet, dest: Wallet, xrpAmount: string): Promise<void> {
  const client = getXRPLClient();
  const tx: Payment = await client.autofill({
    TransactionType: "Payment",
    Account: sender.address,
    Destination: dest.address,
    Amount: xrpToDrops(xrpAmount),
  });
  await submitTransaction(client, tx, sender);
}

// ─── Clawback Operations ────────────────────────────────────────────────────

export async function clawbackTokens(
  issuer: Wallet,
  holder: Wallet,
  amount: string,
  currency = CURRENCY,
): Promise<void> {
  const client = getXRPLClient();
  const tx: Clawback = await client.autofill({
    TransactionType: "Clawback",
    Account: issuer.address,
    Amount: {
      currency: currencyToHex(currency),
      issuer: holder.address,
      value: amount,
    },
  });
  await submitTransaction(client, tx, issuer);
}

// ─── Deposit Preauth Operations ─────────────────────────────────────────────

export async function preauthorizeSender(receiver: Wallet, sender: Wallet): Promise<void> {
  const client = getXRPLClient();
  const tx: DepositPreauth = await client.autofill({
    TransactionType: "DepositPreauth",
    Account: receiver.address,
    Authorize: sender.address,
  });
  await submitTransaction(client, tx, receiver);
}

export async function revokeSenderPreauth(receiver: Wallet, sender: Wallet): Promise<void> {
  const client = getXRPLClient();
  const tx: DepositPreauth = await client.autofill({
    TransactionType: "DepositPreauth",
    Account: receiver.address,
    Unauthorize: sender.address,
  });
  await submitTransaction(client, tx, receiver);
}

// ─── Check Operations ───────────────────────────────────────────────────────

export async function createCheck(
  sender: Wallet,
  receiver: Wallet,
  amount: string,
  issuer: Wallet,
  currency = CURRENCY,
): Promise<string> {
  const client = getXRPLClient();
  const tx: CheckCreate = await client.autofill({
    TransactionType: "CheckCreate",
    Account: sender.address,
    Destination: receiver.address,
    SendMax: {
      currency: currencyToHex(currency),
      issuer: issuer.address,
      value: amount,
    },
  });
  const meta = await submitTransaction(client, tx, sender);

  const createdNode = meta.AffectedNodes.find(
    (node) => "CreatedNode" in node && node.CreatedNode.LedgerEntryType === "Check",
  ) as CreatedNode | undefined;

  const checkId = createdNode?.CreatedNode.LedgerIndex;
  if (checkId === undefined) throw new Error(`checkId is not defined`);

  return checkId;
}

export async function cashCheck(
  receiver: Wallet,
  checkId: string,
  amount: string,
  issuer: Wallet,
  currency = CURRENCY,
): Promise<void> {
  const client = getXRPLClient();
  const tx: CheckCash = await client.autofill({
    TransactionType: "CheckCash",
    Account: receiver.address,
    CheckID: checkId,
    Amount: {
      currency: currencyToHex(currency),
      issuer: issuer.address,
      value: amount,
    },
  });
  await submitTransaction(client, tx, receiver);
}

export async function cancelCheck(wallet: Wallet, checkId: string): Promise<void> {
  const client = getXRPLClient();
  const tx: CheckCancel = await client.autofill({
    TransactionType: "CheckCancel",
    Account: wallet.address,
    CheckID: checkId,
  });
  await submitTransaction(client, tx, wallet);
}

// ─── Balance Query Operations ───────────────────────────────────────────────

export async function getXRPBalance(wallet: Wallet): Promise<bigint> {
  const client = getXRPLClient();
  const accountInfo = await client.request({
    command: "account_info",
    account: wallet.address,
    ledger_index: "validated",
  });
  return BigInt(accountInfo.result.account_data.Balance);
}
