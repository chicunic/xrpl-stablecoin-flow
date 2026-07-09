import { CURRENCY, MINT_AMOUNT, TRANSFER_AMOUNT } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  disconnectClient,
  expectTxFail,
  getTokenBalance,
  mintTokens,
  setupIssuerWithFlags,
  setupWallets,
} from "@tests/utils/test.helper.js";
import {
  clearAccountFlag,
  setAccountFlag,
  transferTokens,
  verifyAccountFlag,
} from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

describe("Trust Line Token GlobalFreeze", () => {
  let client: Client;

  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let issuerWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("GlobalFreeze Flag Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup - Create Issuer and User Accounts", () => {
    it("should configure the issuer account", async () => {
      console.log("\n==================== PHASE 1: SETUP - CREATE ISSUER AND USER ACCOUNTS ====================");

      await setupIssuerWithFlags(issuerWallet);

      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfGlobalFreeze, false);

      console.log("✅ Issuer setup complete WITHOUT GlobalFreeze flag");
    }, 80000);
  });

  describe("Phase 2: Normal Operations (Before GlobalFreeze)", () => {
    it("should create trust lines and issue tokens to Alice and Bob", async () => {
      console.log("\n==================== PHASE 2: NORMAL OPERATIONS (BEFORE GLOBALFREEZE) ====================");

      await createTrustLine(aliceWallet, issuerWallet);
      await createTrustLine(bobWallet, issuerWallet);

      await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);
      await mintTokens(issuerWallet, bobWallet, MINT_AMOUNT);

      expect(await getTokenBalance(aliceWallet, issuerWallet)).toBe(MINT_AMOUNT);
      expect(await getTokenBalance(bobWallet, issuerWallet)).toBe(MINT_AMOUNT);

      console.log(`✅ Alice has ${MINT_AMOUNT} ${CURRENCY}`);
      console.log(`✅ Bob has ${MINT_AMOUNT} ${CURRENCY}`);
    }, 80000);
  });

  describe("Phase 3: Enable GlobalFreeze", () => {
    it("should enable GlobalFreeze flag", async () => {
      console.log("\n==================== PHASE 3: ENABLE GLOBALFREEZE ====================");

      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfGlobalFreeze);
      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfGlobalFreeze, true);

      console.log("✅ GlobalFreeze flag enabled successfully");
    }, 20000);

    it("should fail Alice -> Bob transfer with GlobalFreeze enabled", async () => {
      console.log("🙅 Testing transfer failure with GlobalFreeze enabled...");

      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await expectTxFail("tecPATH_DRY", () => transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet));

      expect(await getTokenBalance(bobWallet, issuerWallet)).toBe(bobBalanceBefore);

      console.log("✅ Transfer correctly failed with GlobalFreeze: tecPATH_DRY");
    }, 30000);

    it("should fail Bob -> Alice transfer with GlobalFreeze enabled", async () => {
      console.log("🙅 Testing reverse transfer failure with GlobalFreeze enabled...");

      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);

      await expectTxFail("tecPATH_DRY", () => transferTokens(bobWallet, aliceWallet, TRANSFER_AMOUNT, issuerWallet));

      expect(await getTokenBalance(aliceWallet, issuerWallet)).toBe(aliceBalanceBefore);

      console.log("✅ Reverse transfer correctly failed with GlobalFreeze: tecPATH_DRY");
    }, 30000);

    it("should allow issuer to mint (issue) tokens with GlobalFreeze enabled", async () => {
      console.log("💰 Testing mint operation with GlobalFreeze enabled...");

      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);

      await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      expect(BigInt(aliceBalanceAfter)).toEqual(BigInt(aliceBalanceBefore) + BigInt(MINT_AMOUNT));

      console.log("✅ Issuer can still mint tokens with GlobalFreeze enabled");
      console.log(`✅ Alice balance increased from ${aliceBalanceBefore} to ${aliceBalanceAfter}`);
    }, 30000);

    it("should allow issuer to mint tokens to Bob with GlobalFreeze enabled", async () => {
      console.log("💰 Testing mint to Bob with GlobalFreeze enabled...");

      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await mintTokens(issuerWallet, bobWallet, MINT_AMOUNT);

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(bobBalanceAfter)).toEqual(BigInt(bobBalanceBefore) + BigInt(MINT_AMOUNT));

      console.log("✅ Issuer can mint tokens to Bob with GlobalFreeze enabled");
      console.log(`✅ Bob balance increased from ${bobBalanceBefore} to ${bobBalanceAfter}`);
    }, 30000);

    it("should allow issuer to burn (redeem) tokens with GlobalFreeze enabled", async () => {
      console.log("🔥 Testing burn operation with GlobalFreeze enabled...");

      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);

      await transferTokens(aliceWallet, issuerWallet, TRANSFER_AMOUNT, issuerWallet);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      expect(BigInt(aliceBalanceAfter)).toEqual(BigInt(aliceBalanceBefore) - BigInt(TRANSFER_AMOUNT));

      console.log("✅ Burn operation successful with GlobalFreeze enabled");
      console.log(`✅ Alice balance decreased from ${aliceBalanceBefore} to ${aliceBalanceAfter}`);
    }, 30000);

    it("should allow users to burn tokens by sending to issuer with GlobalFreeze enabled", async () => {
      console.log("🔥 Testing user-initiated burn with GlobalFreeze enabled...");

      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await transferTokens(bobWallet, issuerWallet, TRANSFER_AMOUNT, issuerWallet);

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(bobBalanceAfter)).toEqual(BigInt(bobBalanceBefore) - BigInt(TRANSFER_AMOUNT));

      console.log("✅ User-initiated burn successful with GlobalFreeze enabled");
      console.log(`✅ Bob balance decreased from ${bobBalanceBefore} to ${bobBalanceAfter}`);
    }, 30000);
  });

  describe("Phase 4: Disable GlobalFreeze", () => {
    it("should disable GlobalFreeze flag", async () => {
      console.log("\n==================== PHASE 4: DISABLE GLOBALFREEZE ====================");

      await clearAccountFlag(issuerWallet, AccountSetAsfFlags.asfGlobalFreeze);
      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfGlobalFreeze, false);

      console.log("✅ GlobalFreeze flag disabled successfully");
    }, 20000);

    it("should succeed Alice -> Bob transfer after disabling GlobalFreeze", async () => {
      console.log("✅ Testing transfer success after disabling GlobalFreeze...");

      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(bobBalanceAfter)).toEqual(BigInt(bobBalanceBefore) + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Transfer successful after unfreezing: Alice -> Bob (${TRANSFER_AMOUNT} ${CURRENCY})`);
      console.log(`✅ Bob balance increased from ${bobBalanceBefore} to ${bobBalanceAfter}`);
    }, 30000);
  });
});
