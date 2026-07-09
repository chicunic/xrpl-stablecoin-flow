import {
  authorizeMPToken,
  clawbackMPToken,
  createMPTokenIssuance,
  getMPTokenBalance,
  mintMPToken,
  transferMPToken,
} from "@/services/multi-purpose-token.service.js";
import { connectClient, disconnectClient, setupWallets } from "@tests/utils/test.helper.js";
import type { Client, Wallet } from "xrpl";
import { MPTokenIssuanceCreateFlags } from "xrpl";

/**
 * MPToken Clawback Test
 *
 * Tests clawback operations:
 *   Phase 1: Setup issuance with tfMPTCanClawback
 *   Phase 2: Normal clawback
 *   Phase 3: Over-balance clawback (claws back entire balance)
 *   Phase 4: Issuance WITHOUT tfMPTCanClawback — clawback fails
 */
describe("Multi-Purpose Token Clawback", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  let mptIssuanceId: string;

  beforeAll(async () => {
    client = await connectClient("MPToken Clawback Test");

    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup", () => {
    it("should create wallets and issuance with clawback enabled", async () => {
      console.log("\n==================== PHASE 1: SETUP ====================");

      mptIssuanceId = await createMPTokenIssuance(
        issuerWallet,
        MPTokenIssuanceCreateFlags.tfMPTCanTransfer | MPTokenIssuanceCreateFlags.tfMPTCanClawback,
      );

      await authorizeMPToken(aliceWallet, mptIssuanceId);
      await authorizeMPToken(bobWallet, mptIssuanceId);
      await mintMPToken(issuerWallet, aliceWallet, mptIssuanceId, "10000");
      await transferMPToken(aliceWallet, bobWallet, mptIssuanceId, "3000");

      console.log(`✅ Issuance: ${mptIssuanceId}`);
      console.log(`✅ Alice: ${await getMPTokenBalance(aliceWallet, mptIssuanceId)}`);
      console.log(`✅ Bob: ${await getMPTokenBalance(bobWallet, mptIssuanceId)}`);
    }, 80000);
  });

  describe("Phase 2: Normal Clawback", () => {
    it("should clawback partial amount from Bob", async () => {
      console.log("\n==================== PHASE 2: NORMAL CLAWBACK ====================");

      const bobBefore = BigInt(await getMPTokenBalance(bobWallet, mptIssuanceId));

      await clawbackMPToken(issuerWallet, bobWallet, mptIssuanceId, "500");

      expect(BigInt(await getMPTokenBalance(bobWallet, mptIssuanceId))).toBe(bobBefore - 500n);

      console.log("✅ Clawed back 500 from Bob");
    }, 30000);
  });

  describe("Phase 3: Over-Balance Clawback", () => {
    it("should clawback entire balance when amount exceeds balance", async () => {
      console.log("\n==================== PHASE 3: OVER-BALANCE CLAWBACK ====================");

      const bobBalance = await getMPTokenBalance(bobWallet, mptIssuanceId);
      const overAmount = String(BigInt(bobBalance) + 10000n);

      await clawbackMPToken(issuerWallet, bobWallet, mptIssuanceId, overAmount);

      expect(await getMPTokenBalance(bobWallet, mptIssuanceId)).toBe("0");

      console.log("✅ Over-balance clawback clawed back entire balance");
    }, 30000);
  });

  describe("Phase 4: Clawback Without Flag", () => {
    it("should fail clawback on issuance without tfMPTCanClawback", async () => {
      console.log("\n==================== PHASE 4: CLAWBACK WITHOUT FLAG ====================");

      const noClawbackIssuanceId = await createMPTokenIssuance(
        issuerWallet,
        MPTokenIssuanceCreateFlags.tfMPTCanTransfer,
      );

      await authorizeMPToken(aliceWallet, noClawbackIssuanceId);
      await mintMPToken(issuerWallet, aliceWallet, noClawbackIssuanceId, "1000");

      const clawbackTx = await client.autofill({
        TransactionType: "Clawback",
        Account: issuerWallet.address,
        Amount: {
          mpt_issuance_id: noClawbackIssuanceId,
          value: "100",
        },
        Holder: aliceWallet.address,
      });
      const signed = issuerWallet.sign(clawbackTx);
      const result = await client.submitAndWait(signed.tx_blob);
      const txResult = (result.result.meta as { TransactionResult?: string })?.TransactionResult;
      expect(txResult).toBe("tecNO_PERMISSION");

      expect(await getMPTokenBalance(aliceWallet, noClawbackIssuanceId)).toBe("1000");

      console.log("✅ Clawback without flag correctly failed: tecNO_PERMISSION");
    }, 60000);
  });
});
