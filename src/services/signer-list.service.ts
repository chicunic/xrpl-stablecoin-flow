import type { SignerListSet, Wallet } from "xrpl";
import { getXRPLClient } from "@/config/xrpl.config.js";
import { submitTransaction } from "./transaction.service.js";

export interface SignerEntry {
  address: string;
  weight: number;
}

/**
 * Installs a signer list on the account so transactions can be authorized
 * by a quorum of signer weights instead of (or in addition to) its own keys.
 */
export async function setSignerList(wallet: Wallet, signers: SignerEntry[], quorum: number): Promise<void> {
  const client = getXRPLClient();
  const tx: SignerListSet = await client.autofill({
    TransactionType: "SignerListSet",
    Account: wallet.address,
    SignerQuorum: quorum,
    SignerEntries: signers.map((signer) => ({
      SignerEntry: { Account: signer.address, SignerWeight: signer.weight },
    })),
  });
  await submitTransaction(client, tx, wallet);
}

/** Removes the account's signer list (SignerQuorum 0 with no entries). */
export async function removeSignerList(wallet: Wallet): Promise<void> {
  const client = getXRPLClient();
  const tx: SignerListSet = await client.autofill({
    TransactionType: "SignerListSet",
    Account: wallet.address,
    SignerQuorum: 0,
  });
  await submitTransaction(client, tx, wallet);
}
