import type { Amount, EscrowCancel, EscrowCreate, EscrowFinish, MPTAmount, Wallet } from "xrpl";

import { getXRPLClient } from "@/config/xrpl.config.js";
import { submitTransaction } from "./transaction.service.js";

/**
 * Creates a time-based escrow holding XRP, an IOU, or an MPT amount (TokenEscrow, XLS-85).
 * IOU escrows require the issuer to have asfAllowTrustLineLocking set;
 * MPT escrows require the issuance to have tfMPTCanEscrow.
 * Release times are relative to the validated ledger close time, not the local
 * clock — fix1571 rejects times at or before the parent ledger close time.
 *
 * @returns The escrow's OfferSequence, needed by EscrowFinish / EscrowCancel.
 */
export async function createEscrow(
  sender: Wallet,
  dest: Wallet,
  amount: Amount | MPTAmount,
  options: { finishAfterSec?: number; cancelAfterSec?: number },
): Promise<number> {
  const client = getXRPLClient();
  const ledger = await client.request({ command: "ledger", ledger_index: "validated" });
  const closeTime = ledger.result.ledger.close_time;
  const tx: EscrowCreate = await client.autofill({
    TransactionType: "EscrowCreate",
    Account: sender.address,
    Destination: dest.address,
    Amount: amount,
    ...(options.finishAfterSec ? { FinishAfter: closeTime + options.finishAfterSec } : {}),
    ...(options.cancelAfterSec ? { CancelAfter: closeTime + options.cancelAfterSec } : {}),
  });
  await submitTransaction(client, tx, sender);

  if (tx.Sequence === undefined) throw new Error("EscrowCreate transaction has no Sequence after autofill");
  return tx.Sequence;
}

export async function finishEscrow(finisher: Wallet, owner: string, offerSequence: number): Promise<void> {
  const client = getXRPLClient();
  const tx: EscrowFinish = await client.autofill({
    TransactionType: "EscrowFinish",
    Account: finisher.address,
    Owner: owner,
    OfferSequence: offerSequence,
  });
  await submitTransaction(client, tx, finisher);
}

export async function cancelEscrow(canceller: Wallet, owner: string, offerSequence: number): Promise<void> {
  const client = getXRPLClient();
  const tx: EscrowCancel = await client.autofill({
    TransactionType: "EscrowCancel",
    Account: canceller.address,
    Owner: owner,
    OfferSequence: offerSequence,
  });
  await submitTransaction(client, tx, canceller);
}
