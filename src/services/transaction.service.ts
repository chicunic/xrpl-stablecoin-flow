import {
  type Client,
  type SubmittableTransaction,
  type TransactionMetadata,
  type Wallet,
  convertStringToHex,
  multisign,
} from "xrpl";

/** Thrown when a validated transaction ends with a non-tesSUCCESS result code. */
export class TransactionResultError extends Error {
  constructor(
    readonly txType: string,
    readonly result: string,
    readonly hash: string,
  ) {
    super(`${txType} failed with ${result} (hash: ${hash})`);
    this.name = "TransactionResultError";
  }
}

export function currencyToHex(currency: string): string {
  if (currency.length === 3) {
    return currency;
  }
  // Non-standard codes are 160-bit hex; 20 ASCII chars is the encoding limit
  if (currency.length < 3 || currency.length > 20) {
    throw new Error(`Invalid currency code "${currency}": length must be 3 (standard) or 4-20 (non-standard)`);
  }
  return convertStringToHex(currency).padEnd(40, "0");
}

function extractMeta(
  tx: SubmittableTransaction,
  result: { result: { meta?: TransactionMetadata | string; hash: string } },
): TransactionMetadata {
  const meta = result.result.meta;
  if (typeof meta !== "object") {
    throw new Error(`${tx.TransactionType} returned unexpected metadata: ${String(meta)}`);
  }
  if (meta.TransactionResult !== "tesSUCCESS") {
    throw new TransactionResultError(tx.TransactionType, meta.TransactionResult, result.result.hash);
  }
  return meta;
}

export async function submitTransaction(
  client: Client,
  tx: SubmittableTransaction,
  signer: Wallet,
): Promise<TransactionMetadata> {
  const signed = signer.sign(tx);
  const result = await client.submitAndWait(signed.tx_blob);
  return extractMeta(tx, result);
}

/** A multisig participant: a Wallet signing as itself, or a key pair signing on behalf of a signer account (e.g. its regular key). */
export type MultisigSigner = Wallet | { wallet: Wallet; account: string };

/** Submits a transaction signed by multiple signers from the account's SignerList. */
export async function submitMultisigned(
  client: Client,
  tx: SubmittableTransaction,
  signers: MultisigSigner[],
): Promise<TransactionMetadata> {
  const signedBlobs = signers.map((signer) =>
    "wallet" in signer ? signer.wallet.sign(tx, signer.account).tx_blob : signer.sign(tx, true).tx_blob,
  );
  const result = await client.submitAndWait(multisign(signedBlobs));
  return extractMeta(tx, result);
}

export async function getAccountFlags(client: Client, address: string): Promise<bigint> {
  const accountInfo = await client.request({
    command: "account_info",
    account: address,
    ledger_index: "validated",
  });
  return BigInt(accountInfo.result.account_data.Flags);
}

export function hasFlag(flags: bigint, flag: number): boolean {
  const mask = BigInt(flag);
  return (flags & mask) === mask;
}
