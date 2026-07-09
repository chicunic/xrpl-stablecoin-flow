import type { TicketCreate, Wallet } from "xrpl";
import { getXRPLClient } from "@/config/xrpl.config.js";
import { submitTransaction } from "./transaction.service.js";

/**
 * Creates Tickets for the specified account.
 * Tickets allow transactions to be prepared, signed, and submitted out of order,
 * bypassing the strict sequence number requirements.
 *
 * @param wallet The account that will own the tickets.
 * @param count The number of tickets to create (up to 250).
 * @returns The starting sequence number of the newly allocated tickets.
 */
export async function createTickets(wallet: Wallet, count: number): Promise<number> {
  const client = getXRPLClient();
  const tx: TicketCreate = await client.autofill({
    TransactionType: "TicketCreate",
    Account: wallet.address,
    TicketCount: count,
  });

  await submitTransaction(client, tx, wallet);

  if (tx.Sequence === undefined) throw new Error("TicketCreate transaction has no Sequence after autofill");

  // The first ticket sequence allocated is exactly the Sequence of the TicketCreate tx + 1
  return tx.Sequence + 1;
}

/**
 * Retrieves all currently available/unused Tickets for a given account.
 *
 * @param address The XRPL account address.
 * @returns An array of available TicketSequence numbers sorted in ascending order.
 */
export async function getAvailableTickets(address: string): Promise<number[]> {
  const client = getXRPLClient();
  const response = await client.request({
    command: "account_objects",
    account: address,
    type: "ticket",
  });

  const objects = response.result.account_objects as unknown as {
    LedgerEntryType: string;
    TicketSequence: number;
  }[];

  return objects
    .filter((obj) => obj.LedgerEntryType === "Ticket")
    .map((obj) => obj.TicketSequence)
    .sort((a, b) => a - b);
}
