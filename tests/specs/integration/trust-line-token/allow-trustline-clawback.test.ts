import { CLAWBACK_AMOUNT, CURRENCY, MINT_AMOUNT, TRANSFER_AMOUNT } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  disconnectClient,
  getTokenBalance,
  mintTokens,
  setupWallets,
} from "@tests/utils/test.helper.js";
import {
  clawbackTokens,
  clearAccountFlag,
  setAccountFlag,
  setupIssuerWithDomain,
  transferTokens,
  verifyAccountFlag,
} from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

/**
 * AllowTrustLineClawback Flag Test
 *
 * Tests clawback operations:
 *   Phase 1: Setup - Create Issuer and User Accounts, set AllowTrustLineClawback
 *   Phase 2: Trust Lines and Token Setup
 *   Phase 3: Test Clawback Operations (clawback from Bob, excessive clawback)
 *   Phase 4: Test Clawback Permanence (cannot clear AllowTrustLineClawback)
 */
describe("Trust Line Token Clawback", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("AllowTrustLineClawback Flag Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup - Create Issuer and User Accounts", () => {
    it("should configure issuer account with AllowTrustLineClawback", async () => {
      console.log("\n==================== PHASE 1: SETUP - CREATE ISSUER AND USER ACCOUNTS ====================");

      await setupIssuerWithDomain(issuerWallet);
      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfAllowTrustLineClawback);
      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfDefaultRipple);

      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfAllowTrustLineClawback, true);
      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfDefaultRipple, true);

      console.log("✅ AllowTrustLineClawback and DefaultRipple flags enabled on issuer successfully");
    }, 30000);
  });

  describe("Phase 2: Trust Lines and Token Setup", () => {
    it("should create trust lines and issue tokens to Alice", async () => {
      console.log("\n==================== PHASE 2: TRUST LINES AND TOKEN SETUP ====================");

      await createTrustLine(aliceWallet, issuerWallet);
      await createTrustLine(bobWallet, issuerWallet);

      await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);

      const aliceBalance = await getTokenBalance(aliceWallet, issuerWallet);
      expect(aliceBalance).toBe(MINT_AMOUNT);

      console.log("✅ Trust lines created and tokens issued successfully");
      console.log(`✅ Alice now has ${MINT_AMOUNT} ${CURRENCY}`);
    }, 60000);
  });

  describe("Phase 3: Test Clawback Operations", () => {
    it("should allow Alice to transfer tokens to Bob", async () => {
      console.log("\n==================== PHASE 3: TEST CLAWBACK OPERATIONS ====================");

      await transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);

      const aliceBalance = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalance = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(aliceBalance)).toEqual(BigInt(MINT_AMOUNT) - BigInt(TRANSFER_AMOUNT));
      expect(BigInt(bobBalance)).toEqual(BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Transfer successful: Alice has ${aliceBalance} ${CURRENCY}, Bob has ${bobBalance} ${CURRENCY}`);
    }, 30000);

    it("should succeed issuer clawback from Bob", async () => {
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await clawbackTokens(issuerWallet, bobWallet, CLAWBACK_AMOUNT);

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(bobBalanceAfter)).toEqual(BigInt(bobBalanceBefore) - BigInt(CLAWBACK_AMOUNT));

      console.log(`✅ Clawback successful: Bob balance ${bobBalanceBefore} -> ${bobBalanceAfter} ${CURRENCY}`);
    }, 30000);

    it("should clawback entire balance when amount exceeds current balance", async () => {
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      // More than Bob should have — transaction succeeds but claws back entire balance
      await clawbackTokens(issuerWallet, bobWallet, MINT_AMOUNT);

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(bobBalanceAfter)).toEqual(0n);

      console.log(`✅ Entire balance clawed back: Bob ${bobBalanceBefore} -> ${bobBalanceAfter} ${CURRENCY}`);
    }, 30000);
  });

  describe("Phase 4: Test Clawback Permanence", () => {
    it("should succeed clear AllowTrustLineClawback transaction but flag remains set (permanent)", async () => {
      console.log("\n==================== PHASE 4: TEST CLAWBACK PERMANENCE ====================");

      // Transaction succeeds but does nothing - AllowTrustLineClawback cannot be cleared once set
      await clearAccountFlag(issuerWallet, AccountSetAsfFlags.asfAllowTrustLineClawback);

      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfAllowTrustLineClawback, true);

      console.log(
        "✅ Clear transaction succeeded but did nothing - AllowTrustLineClawback flag remains enabled (permanent)",
      );
    }, 20000);
  });
});
