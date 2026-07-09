import { CURRENCY, MINT_AMOUNT, TRANSFER_AMOUNT } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  delay,
  disconnectClient,
  expectTxFail,
  getTokenBalance,
  mintTokens,
  setupIssuerWithFlags,
  setupWallets,
} from "@tests/utils/test.helper.js";
import { cancelEscrow, createEscrow, finishEscrow } from "@/services/escrow.service.js";
import { setAccountFlag } from "@/services/trustline-token.service.js";
import { currencyToHex } from "@/services/transaction.service.js";
import type { Client, IssuedCurrencyAmount, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";

/**
 * Trust Line Token Escrow (XLS-85 TokenEscrow)
 *
 * IOU escrows lock issued tokens on-ledger until a release time:
 *   Phase 1: Escrow fails until the issuer allows trust line locking
 *   Phase 2: Create escrow — sender balance is locked immediately
 *   Phase 3: Finish before FinishAfter is rejected
 *   Phase 4: Finish after FinishAfter delivers to the destination
 *   Phase 5: Cancel after CancelAfter returns funds to the sender
 */
describe("Trust Line Token Escrow", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  const escrowAmount = (value: string): IssuedCurrencyAmount => ({
    currency: currencyToHex(CURRENCY),
    issuer: issuerWallet.address,
    value,
  });

  beforeAll(async () => {
    client = await connectClient("Trust Line Token Escrow Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3, "3");

    await setupIssuerWithFlags(issuerWallet);
    await createTrustLine(aliceWallet, issuerWallet);
    await createTrustLine(bobWallet, issuerWallet);
    await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);
  }, 120000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Issuer Locking Permission", () => {
    it("should fail to escrow before the issuer allows trust line locking", async () => {
      console.log("\n==================== PHASE 1: ISSUER LOCKING PERMISSION ====================");

      await expectTxFail("tecNO_PERMISSION", () =>
        createEscrow(aliceWallet, bobWallet, escrowAmount(TRANSFER_AMOUNT), { finishAfterSec: 3 }),
      );

      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfAllowTrustLineLocking);

      console.log("✅ Escrow rejected until asfAllowTrustLineLocking; flag now set");
    }, 30000);
  });

  describe("Phase 2: Create Escrow", () => {
    it("should lock the escrowed amount out of the sender's balance", async () => {
      console.log("\n==================== PHASE 2: CREATE ESCROW ====================");

      const aliceBefore = BigInt(await getTokenBalance(aliceWallet, issuerWallet));
      await createEscrow(aliceWallet, bobWallet, escrowAmount(TRANSFER_AMOUNT), { finishAfterSec: 3 });

      expect(BigInt(await getTokenBalance(aliceWallet, issuerWallet))).toBe(aliceBefore - BigInt(TRANSFER_AMOUNT));
      expect(await getTokenBalance(bobWallet, issuerWallet)).toBe("0");

      console.log(`✅ ${TRANSFER_AMOUNT} ${CURRENCY} locked in escrow`);
    }, 30000);
  });

  describe("Phase 3: Early Finish", () => {
    let offerSequence: number;

    it("should reject EscrowFinish before FinishAfter", async () => {
      console.log("\n==================== PHASE 3: EARLY FINISH ====================");

      offerSequence = await createEscrow(aliceWallet, bobWallet, escrowAmount(TRANSFER_AMOUNT), {
        finishAfterSec: 30,
      });
      await expectTxFail("tecNO_PERMISSION", () => finishEscrow(bobWallet, aliceWallet.address, offerSequence));

      console.log("✅ Early finish failed: tecNO_PERMISSION");
    }, 30000);
  });

  describe("Phase 4: Finish Escrow", () => {
    it("should deliver the escrowed tokens after FinishAfter", async () => {
      console.log("\n==================== PHASE 4: FINISH ESCROW ====================");

      const bobBefore = BigInt(await getTokenBalance(bobWallet, issuerWallet));
      const offerSequence = await createEscrow(aliceWallet, bobWallet, escrowAmount(TRANSFER_AMOUNT), {
        finishAfterSec: 3,
      });

      await delay(5000);
      await finishEscrow(bobWallet, aliceWallet.address, offerSequence);

      expect(BigInt(await getTokenBalance(bobWallet, issuerWallet))).toBe(bobBefore + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Bob received ${TRANSFER_AMOUNT} ${CURRENCY} from escrow`);
    }, 60000);
  });

  describe("Phase 5: Cancel Escrow", () => {
    it("should return funds to the sender after CancelAfter", async () => {
      console.log("\n==================== PHASE 5: CANCEL ESCROW ====================");

      const aliceBefore = BigInt(await getTokenBalance(aliceWallet, issuerWallet));
      const offerSequence = await createEscrow(aliceWallet, bobWallet, escrowAmount(TRANSFER_AMOUNT), {
        finishAfterSec: 2,
        cancelAfterSec: 10,
      });

      // Cancellation is not allowed until CancelAfter has passed
      await expectTxFail("tecNO_PERMISSION", () => cancelEscrow(aliceWallet, aliceWallet.address, offerSequence));

      await delay(12000);
      await cancelEscrow(aliceWallet, aliceWallet.address, offerSequence);

      expect(BigInt(await getTokenBalance(aliceWallet, issuerWallet))).toBe(aliceBefore);

      console.log("✅ Escrow cancelled, funds returned to Alice");
    }, 60000);
  });
});
