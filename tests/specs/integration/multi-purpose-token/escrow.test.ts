import { connectClient, delay, disconnectClient, expectTxFail, setupWallets } from "@tests/utils/test.helper.js";
import {
  authorizeMPToken,
  createMPTokenIssuance,
  getMPTokenBalance,
  mintMPToken,
} from "@/services/multi-purpose-token.service.js";
import { cancelEscrow, createEscrow, finishEscrow } from "@/services/escrow.service.js";
import type { Client, MPTAmount, Wallet } from "xrpl";
import { MPTokenIssuanceCreateFlags } from "xrpl";

const ESCROW_FLAGS =
  MPTokenIssuanceCreateFlags.tfMPTCanTransfer |
  MPTokenIssuanceCreateFlags.tfMPTCanEscrow |
  MPTokenIssuanceCreateFlags.tfMPTCanLock;

/**
 * MPToken Escrow (XLS-85 TokenEscrow)
 *
 * MPT escrows require the issuance to allow escrow via tfMPTCanEscrow:
 *   Phase 1: Escrow fails without tfMPTCanEscrow
 *   Phase 2: Create escrow — sender balance is locked immediately
 *   Phase 3: Finish after FinishAfter delivers to the destination
 *   Phase 4: Cancel after CancelAfter returns funds to the sender
 */
describe("Multi-Purpose Token Escrow", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let mptIssuanceId: string;

  const escrowAmount = (value: string): MPTAmount => ({
    mpt_issuance_id: mptIssuanceId,
    value,
  });

  beforeAll(async () => {
    client = await connectClient("MPToken Escrow Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3, "3");

    mptIssuanceId = await createMPTokenIssuance(issuerWallet, ESCROW_FLAGS);
    await authorizeMPToken(aliceWallet, mptIssuanceId);
    await authorizeMPToken(bobWallet, mptIssuanceId);
    await mintMPToken(issuerWallet, aliceWallet, mptIssuanceId, "1000");
  }, 120000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Escrow Permission Flag", () => {
    it("should fail to escrow an MPT issued without tfMPTCanEscrow", async () => {
      console.log("\n==================== PHASE 1: ESCROW PERMISSION FLAG ====================");

      const noEscrowId = await createMPTokenIssuance(issuerWallet, MPTokenIssuanceCreateFlags.tfMPTCanTransfer);
      await authorizeMPToken(aliceWallet, noEscrowId);
      await mintMPToken(issuerWallet, aliceWallet, noEscrowId, "100");

      await expectTxFail("tecNO_PERMISSION", () =>
        createEscrow(aliceWallet, bobWallet, { mpt_issuance_id: noEscrowId, value: "100" }, { finishAfterSec: 3 }),
      );

      console.log("✅ Escrow without tfMPTCanEscrow failed: tecNO_PERMISSION");
    }, 60000);
  });

  describe("Phase 2: Create Escrow", () => {
    it("should lock the escrowed amount out of the sender's balance", async () => {
      console.log("\n==================== PHASE 2: CREATE ESCROW ====================");

      await createEscrow(aliceWallet, bobWallet, escrowAmount("300"), { finishAfterSec: 3 });

      expect(await getMPTokenBalance(aliceWallet, mptIssuanceId)).toBe("700");
      expect(await getMPTokenBalance(bobWallet, mptIssuanceId)).toBe("0");

      console.log("✅ 300 MPT locked in escrow");
    }, 30000);
  });

  describe("Phase 3: Finish Escrow", () => {
    it("should deliver the escrowed tokens after FinishAfter", async () => {
      console.log("\n==================== PHASE 3: FINISH ESCROW ====================");

      const offerSequence = await createEscrow(aliceWallet, bobWallet, escrowAmount("200"), { finishAfterSec: 6 });

      // Early finish is rejected until FinishAfter passes
      await expectTxFail("tecNO_PERMISSION", () => finishEscrow(bobWallet, aliceWallet.address, offerSequence));

      await delay(8000);
      await finishEscrow(bobWallet, aliceWallet.address, offerSequence);

      expect(await getMPTokenBalance(bobWallet, mptIssuanceId)).toBe("200");

      console.log("✅ Bob received 200 MPT from escrow");
    }, 60000);
  });

  describe("Phase 4: Cancel Escrow", () => {
    it("should return funds to the sender after CancelAfter", async () => {
      console.log("\n==================== PHASE 4: CANCEL ESCROW ====================");

      const aliceBefore = BigInt(await getMPTokenBalance(aliceWallet, mptIssuanceId));
      const offerSequence = await createEscrow(aliceWallet, bobWallet, escrowAmount("100"), {
        finishAfterSec: 2,
        cancelAfterSec: 10,
      });

      await delay(12000);
      await cancelEscrow(aliceWallet, aliceWallet.address, offerSequence);

      expect(BigInt(await getMPTokenBalance(aliceWallet, mptIssuanceId))).toBe(aliceBefore);

      console.log("✅ Escrow cancelled, funds returned to Alice");
    }, 60000);
  });
});
