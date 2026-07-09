import { connectClient, disconnectClient, setupWallets } from "@tests/utils/test.helper.js";
import { createTickets, getAvailableTickets } from "@/services/ticket.service.js";
import { submitTransaction } from "@/services/transaction.service.js";
import {
  DEFAULT_MPT_FLAGS,
  MPT_METADATA,
  authorizeMPToken,
  getMPTokenBalance,
} from "@/services/multi-purpose-token.service.js";
import type { Client, MPTokenIssuanceCreate, Payment, TransactionMetadata, Wallet } from "xrpl";
import { encodeMPTokenMetadata } from "xrpl";

/**
 * Advanced XRPL: Tickets for MPT
 *
 * Demonstrates:
 * 1. Allocating Tickets for the MPT Issuer.
 * 2. Creating an MPT and Minting tokens out-of-order.
 */
describe("Multi-Purpose Token Tickets", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let userWallet: Wallet;
  let mptIssuanceId: string;

  beforeAll(async () => {
    client = await connectClient("MPT Ticket Test");

    [issuerWallet, userWallet] = await setupWallets(2);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  it("should allocate 2 tickets for the MPT issuer", async () => {
    const firstTicket = await createTickets(issuerWallet, 2);
    console.log(`✅ Created 2 tickets starting at sequence: ${firstTicket}`);

    const available = await getAvailableTickets(issuerWallet.address);
    expect(available.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("should execute MPT Creation and Minting cleanly using Tickets", async () => {
    const available = await getAvailableTickets(issuerWallet.address);
    const ticket1 = available[0]!;
    const ticket2 = available[1]!;

    // 1. Create MPT using Ticket 1
    const createTx: MPTokenIssuanceCreate = await client.autofill({
      TransactionType: "MPTokenIssuanceCreate",
      Account: issuerWallet.address,
      Sequence: 0,
      TicketSequence: ticket1,
      AssetScale: 2,
      MaximumAmount: "1000000",
      Flags: DEFAULT_MPT_FLAGS,
      MPTokenMetadata: encodeMPTokenMetadata(MPT_METADATA),
    });

    const meta = await submitTransaction(client, createTx, issuerWallet);
    mptIssuanceId = (meta as TransactionMetadata & { mpt_issuance_id: string }).mpt_issuance_id;
    expect(mptIssuanceId).toBeDefined();

    // 2. User authorizes MPT (uses normal sequence for simplicity here)
    await authorizeMPToken(userWallet, mptIssuanceId);

    // 3. Issuer mints using Ticket 2
    const mintAmount = "5000";
    const mintTx: Payment = await client.autofill({
      TransactionType: "Payment",
      Account: issuerWallet.address,
      Sequence: 0,
      TicketSequence: ticket2,
      Destination: userWallet.address,
      Amount: {
        mpt_issuance_id: mptIssuanceId,
        value: mintAmount,
      },
    });

    await submitTransaction(client, mintTx, issuerWallet);

    const balance = await getMPTokenBalance(userWallet, mptIssuanceId);
    expect(balance).toBe(mintAmount);

    console.log("✅ Successfully utilized tickets for MPT lifecycle.");
  }, 30000);
});
