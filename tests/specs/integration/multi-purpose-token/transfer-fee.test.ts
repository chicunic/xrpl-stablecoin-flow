import {
  authorizeMPToken,
  createMPTokenIssuance,
  getMPTokenBalance,
  mintMPToken,
  transferMPToken,
} from "@/services/multi-purpose-token.service.js";
import { connectClient, disconnectClient, setupWallets } from "@tests/utils/test.helper.js";
import type { Client, Wallet } from "xrpl";
import { MPTokenIssuanceCreateFlags } from "xrpl";

/**
 * MPToken TransferFee Test
 *
 * Tests TransferFee on MPToken:
 *   Phase 1: Setup issuance with TransferFee = 1000 (1.000%)
 *   Phase 2: Issuer → holder mint has no fee
 *   Phase 3: P2P transfer deducts fee from sender
 *   Phase 4: Holder → issuer burn has no fee
 *
 * TransferFee range: 0–50000 representing 0.000%–50.000%
 * Fee is charged on peer-to-peer transfers only (not issuer operations)
 */
describe("Multi-Purpose Token TransferFee", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  let mptIssuanceId: string;

  // 1.000% fee = 1000 in TransferFee units
  const TRANSFER_FEE = 1000;

  beforeAll(async () => {
    client = await connectClient("MPToken TransferFee Test");

    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup", () => {
    it("should create issuance with 1% TransferFee", async () => {
      console.log("\n==================== PHASE 1: SETUP ====================");

      mptIssuanceId = await createMPTokenIssuance(
        issuerWallet,
        MPTokenIssuanceCreateFlags.tfMPTCanTransfer |
          MPTokenIssuanceCreateFlags.tfMPTCanLock |
          MPTokenIssuanceCreateFlags.tfMPTCanClawback,
        { transferFee: TRANSFER_FEE },
      );

      await authorizeMPToken(aliceWallet, mptIssuanceId);
      await authorizeMPToken(bobWallet, mptIssuanceId);

      console.log(`✅ Issuance with 1% fee: ${mptIssuanceId}`);
    }, 80000);
  });

  describe("Phase 2: Issuer Mint Has No Fee", () => {
    it("should mint without fee deduction", async () => {
      console.log("\n==================== PHASE 2: MINT NO FEE ====================");

      await mintMPToken(issuerWallet, aliceWallet, mptIssuanceId, "10000");

      expect(await getMPTokenBalance(aliceWallet, mptIssuanceId)).toBe("10000");

      console.log("✅ Minted 10000 to Alice (no fee)");
    }, 30000);
  });

  describe("Phase 3: P2P Transfer With Fee", () => {
    it("should deduct 1% fee on Alice → Bob transfer", async () => {
      console.log("\n==================== PHASE 3: P2P TRANSFER WITH FEE ====================");

      const aliceBefore = BigInt(await getMPTokenBalance(aliceWallet, mptIssuanceId));
      const bobBefore = BigInt(await getMPTokenBalance(bobWallet, mptIssuanceId));

      // Transfer 1000 to Bob, Alice pays 1% fee = 10 extra
      // Alice sends 1000 + 10 = 1010, Bob receives 1000
      await transferMPToken(aliceWallet, bobWallet, mptIssuanceId, "1000", { sendMax: "1010" });

      const aliceAfter = BigInt(await getMPTokenBalance(aliceWallet, mptIssuanceId));
      const bobAfter = BigInt(await getMPTokenBalance(bobWallet, mptIssuanceId));

      // Bob receives exactly 1000
      expect(bobAfter).toBe(bobBefore + 1000n);

      // Alice loses 1000 + 1% fee (10) = 1010
      expect(aliceAfter).toBe(aliceBefore - 1010n);

      console.log(`✅ Alice: ${aliceBefore} → ${aliceAfter} (-1010), Bob: ${bobBefore} → ${bobAfter} (+1000)`);
    }, 30000);
  });

  describe("Phase 4: Burn Has No Fee", () => {
    it("should burn to issuer without fee", async () => {
      console.log("\n==================== PHASE 4: BURN NO FEE ====================");

      const bobBefore = BigInt(await getMPTokenBalance(bobWallet, mptIssuanceId));
      const burnAmount = "500";

      await transferMPToken(bobWallet, issuerWallet, mptIssuanceId, burnAmount);

      const bobAfter = BigInt(await getMPTokenBalance(bobWallet, mptIssuanceId));
      expect(bobAfter).toBe(bobBefore - BigInt(burnAmount));

      console.log(`✅ Bob burned ${burnAmount} to issuer (no fee deducted)`);
    }, 30000);
  });
});
