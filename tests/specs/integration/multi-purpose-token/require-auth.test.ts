import {
  authorizeMPToken,
  createMPTokenIssuance,
  getMPTokenBalance,
  issuerAuthorizeMPToken,
  mintMPToken,
  transferMPToken,
} from "@/services/multi-purpose-token.service.js";
import { connectClient, disconnectClient, expectTxFail, setupWallets } from "@tests/utils/test.helper.js";
import type { Client, Wallet } from "xrpl";
import { MPTokenIssuanceCreateFlags } from "xrpl";

/**
 * MPToken RequireAuth Test
 *
 * Tests tfMPTRequireAuth flag behavior:
 *   Phase 1: Setup issuance with tfMPTRequireAuth
 *   Phase 2: Holder opt-in without issuer approval — mint fails
 *   Phase 3: Issuer approves holder — mint succeeds
 *   Phase 4: Unapproved holder cannot receive P2P transfer
 */
describe("Multi-Purpose Token RequireAuth", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let charlieWallet: Wallet;

  let mptIssuanceId: string;

  beforeAll(async () => {
    client = await connectClient("MPToken RequireAuth Test");

    [issuerWallet, aliceWallet, bobWallet, charlieWallet] = await setupWallets(4);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup", () => {
    it("should create wallets and issuance with RequireAuth", async () => {
      console.log("\n==================== PHASE 1: SETUP ====================");

      mptIssuanceId = await createMPTokenIssuance(
        issuerWallet,
        MPTokenIssuanceCreateFlags.tfMPTCanTransfer | MPTokenIssuanceCreateFlags.tfMPTRequireAuth,
      );

      console.log(`✅ Issuance with RequireAuth: ${mptIssuanceId}`);
    }, 80000);
  });

  describe("Phase 2: Holder Opt-in Without Issuer Approval", () => {
    it("should allow holder to opt-in (create MPToken entry)", async () => {
      console.log("\n==================== PHASE 2: OPT-IN WITHOUT APPROVAL ====================");

      await authorizeMPToken(aliceWallet, mptIssuanceId);

      console.log("✅ Alice opted-in (not yet approved by issuer)");
    }, 20000);

    it("should fail mint to unapproved holder", async () => {
      await expectTxFail("tecNO_AUTH", () => transferMPToken(issuerWallet, aliceWallet, mptIssuanceId, "1000"));

      console.log("✅ Mint to unapproved Alice failed: tecNO_AUTH");
    }, 20000);
  });

  describe("Phase 3: Issuer Approves Holder", () => {
    it("should approve Alice and succeed mint", async () => {
      console.log("\n==================== PHASE 3: ISSUER APPROVES ====================");

      await issuerAuthorizeMPToken(issuerWallet, aliceWallet, mptIssuanceId);
      await mintMPToken(issuerWallet, aliceWallet, mptIssuanceId, "5000");

      expect(await getMPTokenBalance(aliceWallet, mptIssuanceId)).toBe("5000");

      console.log("✅ Alice approved and minted 5000");
    }, 30000);

    it("should approve Bob, mint, and transfer Alice → Bob", async () => {
      await authorizeMPToken(bobWallet, mptIssuanceId);
      await issuerAuthorizeMPToken(issuerWallet, bobWallet, mptIssuanceId);

      await transferMPToken(aliceWallet, bobWallet, mptIssuanceId, "1000");

      expect(BigInt(await getMPTokenBalance(aliceWallet, mptIssuanceId))).toBe(4000n);
      expect(BigInt(await getMPTokenBalance(bobWallet, mptIssuanceId))).toBe(1000n);

      console.log("✅ Bob approved, Alice → Bob transfer succeeded");
    }, 40000);
  });

  describe("Phase 4: Unapproved Holder Cannot Receive P2P", () => {
    it("should fail transfer to unapproved Charlie", async () => {
      console.log("\n==================== PHASE 4: UNAPPROVED P2P ====================");

      // Charlie opts-in but issuer does not approve
      await authorizeMPToken(charlieWallet, mptIssuanceId);

      await expectTxFail("tecNO_AUTH", () => transferMPToken(aliceWallet, charlieWallet, mptIssuanceId, "100"));

      expect(await getMPTokenBalance(charlieWallet, mptIssuanceId)).toBe("0");

      console.log("✅ Transfer to unapproved Charlie failed: tecNO_AUTH");
    }, 30000);
  });
});
