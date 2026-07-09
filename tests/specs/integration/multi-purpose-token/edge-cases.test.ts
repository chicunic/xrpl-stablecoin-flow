import {
  DEFAULT_MPT_FLAGS,
  authorizeMPToken,
  createMPTokenIssuance,
  destroyMPTokenIssuance,
  getMPTokenBalance,
  mintMPToken,
} from "@/services/multi-purpose-token.service.js";
import { connectClient, disconnectClient, expectTxFail, setupWallets } from "@tests/utils/test.helper.js";
import { submitTransaction } from "@/services/transaction.service.js";
import type { Client, Payment, Wallet } from "xrpl";
import { MPTokenIssuanceCreateFlags } from "xrpl";

/**
 * MPToken Edge Cases
 *
 * Tests boundary conditions and special scenarios:
 *   Phase 1: Mint exceeding MaximumAmount
 *   Phase 2: Transfer without tfMPTCanTransfer flag
 *   Phase 3: Destroy with outstanding balance
 *   Phase 4: Double authorization (idempotent)
 *   Phase 5: Mint to non-opted-in account
 */
describe("Multi-Purpose Token Edge Cases", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("MPToken Edge Cases Test");

    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3, "3");
  }, 60000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Mint Exceeding MaximumAmount", () => {
    it("should fail mint that exceeds MaximumAmount", async () => {
      console.log("\n==================== PHASE 1: EXCEED MAX AMOUNT ====================");

      const mptId = await createMPTokenIssuance(issuerWallet, DEFAULT_MPT_FLAGS, {
        maxAmount: "1000",
      });

      await authorizeMPToken(aliceWallet, mptId);
      await mintMPToken(issuerWallet, aliceWallet, mptId, "1000");

      // Try to mint 1 more — exceeds MaximumAmount
      const mintTx: Payment = await client.autofill({
        TransactionType: "Payment",
        Account: issuerWallet.address,
        Destination: aliceWallet.address,
        Amount: {
          mpt_issuance_id: mptId,
          value: "1",
        },
      });
      await expectTxFail("tecPATH_PARTIAL", () => submitTransaction(client, mintTx, issuerWallet));

      expect(await getMPTokenBalance(aliceWallet, mptId)).toBe("1000");

      console.log("✅ Mint exceeding MaximumAmount failed: tecPATH_PARTIAL");
    }, 60000);
  });

  describe("Phase 2: Transfer Without tfMPTCanTransfer", () => {
    it("should fail peer transfer when tfMPTCanTransfer is not set", async () => {
      console.log("\n==================== PHASE 2: NO TRANSFER FLAG ====================");

      // Create issuance WITHOUT tfMPTCanTransfer
      const noTransferId = await createMPTokenIssuance(issuerWallet, MPTokenIssuanceCreateFlags.tfMPTCanClawback);

      await authorizeMPToken(aliceWallet, noTransferId);
      await authorizeMPToken(bobWallet, noTransferId);
      await mintMPToken(issuerWallet, aliceWallet, noTransferId, "1000");

      // P2P transfer should fail
      const transferTx: Payment = await client.autofill({
        TransactionType: "Payment",
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          mpt_issuance_id: noTransferId,
          value: "100",
        },
      });
      await expectTxFail("tecNO_AUTH", () => submitTransaction(client, transferTx, aliceWallet));

      expect(await getMPTokenBalance(bobWallet, noTransferId)).toBe("0");

      console.log("✅ P2P transfer without tfMPTCanTransfer failed: tecNO_AUTH");
    }, 60000);
  });

  describe("Phase 3: Destroy With Outstanding Balance", () => {
    it("should fail to destroy issuance with tokens still held", async () => {
      console.log("\n==================== PHASE 3: DESTROY WITH BALANCE ====================");

      const mptId = await createMPTokenIssuance(issuerWallet);

      await authorizeMPToken(aliceWallet, mptId);
      await mintMPToken(issuerWallet, aliceWallet, mptId, "500");

      await expectTxFail("tecHAS_OBLIGATIONS", () => destroyMPTokenIssuance(issuerWallet, mptId));

      console.log("✅ Destroy with outstanding balance failed: tecHAS_OBLIGATIONS");
    }, 60000);
  });

  describe("Phase 4: Double Authorization", () => {
    it("should handle double opt-in gracefully", async () => {
      console.log("\n==================== PHASE 4: DOUBLE AUTHORIZATION ====================");

      const mptId = await createMPTokenIssuance(issuerWallet);

      await authorizeMPToken(aliceWallet, mptId);

      // Second authorization should fail (already authorized)
      const authTx = await client.autofill({
        TransactionType: "MPTokenAuthorize",
        Account: aliceWallet.address,
        MPTokenIssuanceID: mptId,
      });
      await expectTxFail("tecDUPLICATE", () => submitTransaction(client, authTx, aliceWallet));

      console.log("✅ Double authorization correctly failed: tecDUPLICATE");
    }, 40000);
  });

  describe("Phase 5: Mint to Non-Opted-In Account", () => {
    it("should fail mint to account that never authorized", async () => {
      console.log("\n==================== PHASE 5: MINT TO NON-OPTED-IN ====================");

      const mptId = await createMPTokenIssuance(issuerWallet);

      // Bob never authorizes — mint should fail
      const mintTx: Payment = await client.autofill({
        TransactionType: "Payment",
        Account: issuerWallet.address,
        Destination: bobWallet.address,
        Amount: {
          mpt_issuance_id: mptId,
          value: "100",
        },
      });
      await expectTxFail("tecNO_AUTH", () => submitTransaction(client, mintTx, issuerWallet));

      console.log("✅ Mint to non-opted-in account failed: tecNO_AUTH");
    }, 40000);
  });
});
