import type {
  Clawback,
  MPTokenAuthorize,
  MPTokenIssuanceCreate,
  MPTokenIssuanceDestroy,
  MPTokenIssuanceSet,
  Payment,
  TransactionMetadata,
  Wallet,
} from "xrpl";
import { MPTokenIssuanceCreateFlags, encodeMPTokenMetadata } from "xrpl";
import type { MPToken } from "xrpl/dist/npm/models/ledger/index.js";

import { getXRPLClient } from "@/config/xrpl.config.js";
import { submitTransaction } from "./transaction.service.js";

export const MPT_METADATA = {
  ticker: "TUSD",
  name: "Test USD Token",
  desc: "A test token for integration testing",
  icon: "https://example.com/tusd-icon.png",
  asset_class: "rwa",
  asset_subclass: "stablecoin",
  issuer_name: "Test Issuer",
};

export const DEFAULT_MPT_FLAGS =
  MPTokenIssuanceCreateFlags.tfMPTCanTransfer |
  MPTokenIssuanceCreateFlags.tfMPTCanLock |
  MPTokenIssuanceCreateFlags.tfMPTCanClawback;

export async function createMPTokenIssuance(
  issuer: Wallet,
  flags: number = DEFAULT_MPT_FLAGS,
  options: {
    assetScale?: number;
    maxAmount?: string;
    transferFee?: number;
  } = {},
): Promise<string> {
  const client = getXRPLClient();
  const metadata = encodeMPTokenMetadata(MPT_METADATA);

  const tx: MPTokenIssuanceCreate = await client.autofill({
    TransactionType: "MPTokenIssuanceCreate",
    Account: issuer.address,
    AssetScale: options.assetScale ?? 2,
    MaximumAmount: options.maxAmount ?? "100000000",
    TransferFee: options.transferFee ?? 0,
    Flags: flags,
    MPTokenMetadata: metadata,
  });

  const meta = (await submitTransaction(client, tx, issuer)) as TransactionMetadata & { mpt_issuance_id?: string };
  if (meta.mpt_issuance_id === undefined) throw new Error(`meta.mpt_issuance_id is not defined`);

  return meta.mpt_issuance_id;
}

export async function authorizeMPToken(holder: Wallet, mptIssuanceId: string): Promise<void> {
  const client = getXRPLClient();
  const tx: MPTokenAuthorize = await client.autofill({
    TransactionType: "MPTokenAuthorize",
    Account: holder.address,
    MPTokenIssuanceID: mptIssuanceId,
  });
  await submitTransaction(client, tx, holder);
}

export async function issuerAuthorizeMPToken(issuer: Wallet, holder: Wallet, mptIssuanceId: string): Promise<void> {
  const client = getXRPLClient();
  const tx: MPTokenAuthorize = await client.autofill({
    TransactionType: "MPTokenAuthorize",
    Account: issuer.address,
    MPTokenIssuanceID: mptIssuanceId,
    Holder: holder.address,
  });
  await submitTransaction(client, tx, issuer);
}

export async function unauthorizeMPToken(holder: Wallet, mptIssuanceId: string): Promise<void> {
  const client = getXRPLClient();
  const tx: MPTokenAuthorize = await client.autofill({
    TransactionType: "MPTokenAuthorize",
    Account: holder.address,
    MPTokenIssuanceID: mptIssuanceId,
    Flags: { tfMPTUnauthorize: true },
  });
  await submitTransaction(client, tx, holder);
}

export async function mintMPToken(issuer: Wallet, dest: Wallet, mptIssuanceId: string, amount: string): Promise<void> {
  const client = getXRPLClient();
  const tx: Payment = await client.autofill({
    TransactionType: "Payment",
    Account: issuer.address,
    Destination: dest.address,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value: amount,
    },
  });
  await submitTransaction(client, tx, issuer);
}

export async function transferMPToken(
  sender: Wallet,
  dest: Wallet,
  mptIssuanceId: string,
  amount: string,
  options: { sendMax?: string } = {},
): Promise<void> {
  const { sendMax } = options;
  const client = getXRPLClient();
  const tx: Payment = await client.autofill({
    TransactionType: "Payment",
    Account: sender.address,
    Destination: dest.address,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value: amount,
    },
    ...(sendMax ? { SendMax: { mpt_issuance_id: mptIssuanceId, value: sendMax } } : {}),
  });
  await submitTransaction(client, tx, sender);
}

export async function clawbackMPToken(
  issuer: Wallet,
  holder: Wallet,
  mptIssuanceId: string,
  amount: string,
): Promise<void> {
  const client = getXRPLClient();
  const tx: Clawback = await client.autofill({
    TransactionType: "Clawback",
    Account: issuer.address,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value: amount,
    },
    Holder: holder.address,
  });
  await submitTransaction(client, tx, issuer);
}

export async function lockMPToken(issuer: Wallet, mptIssuanceId: string, holder?: Wallet): Promise<void> {
  const client = getXRPLClient();
  const tx: MPTokenIssuanceSet = await client.autofill({
    TransactionType: "MPTokenIssuanceSet",
    Account: issuer.address,
    MPTokenIssuanceID: mptIssuanceId,
    ...(holder ? { Holder: holder.address } : {}),
    Flags: { tfMPTLock: true },
  });
  await submitTransaction(client, tx, issuer);
}

export async function unlockMPToken(issuer: Wallet, mptIssuanceId: string, holder?: Wallet): Promise<void> {
  const client = getXRPLClient();
  const tx: MPTokenIssuanceSet = await client.autofill({
    TransactionType: "MPTokenIssuanceSet",
    Account: issuer.address,
    MPTokenIssuanceID: mptIssuanceId,
    ...(holder ? { Holder: holder.address } : {}),
    Flags: { tfMPTUnlock: true },
  });
  await submitTransaction(client, tx, issuer);
}

export async function destroyMPTokenIssuance(issuer: Wallet, mptIssuanceId: string): Promise<void> {
  const client = getXRPLClient();
  const tx: MPTokenIssuanceDestroy = await client.autofill({
    TransactionType: "MPTokenIssuanceDestroy",
    Account: issuer.address,
    MPTokenIssuanceID: mptIssuanceId,
  });
  await submitTransaction(client, tx, issuer);
}

export async function getMPTokenBalance(holder: Wallet, mptIssuanceId: string): Promise<string> {
  const client = getXRPLClient();
  const accountObjects = await client.request({
    command: "account_objects",
    account: holder.address,
    type: "mptoken",
  });
  // SDK's LedgerEntry union doesn't include MPToken — cast needed
  const objects = accountObjects.result.account_objects as unknown as MPToken[];
  const mpt = objects.find((obj) => obj.MPTokenIssuanceID === mptIssuanceId);
  return mpt?.MPTAmount ?? "0";
}
