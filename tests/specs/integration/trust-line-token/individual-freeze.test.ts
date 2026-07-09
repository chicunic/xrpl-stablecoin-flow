import { CURRENCY, MINT_AMOUNT, TRANSFER_AMOUNT } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  disconnectClient,
  expectTxFail,
  findTrustLine,
  getTokenBalance,
  mintTokens,
  setupIssuerWithFlags,
  setupWallets,
} from "@tests/utils/test.helper.js";
import { currencyToHex, submitTransaction } from "@/services/transaction.service.js";
import {
  freezeTrustLine,
  setAccountFlag,
  transferTokens,
  unfreezeTrustLine,
  verifyAccountFlag,
} from "@/services/trustline-token.service.js";
import type { Client, TransactionMetadata, Wallet } from "xrpl";
import { AccountSetAsfFlags, TrustSetFlags } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

describe("Trust Line Token IndividualFreeze", () => {
  let client: Client;
  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("Individual Freeze Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup", () => {
    it("should create wallets, trust lines, and mint tokens", async () => {
      console.log("\n==================== PHASE 1: SETUP ====================");

      await setupIssuerWithFlags(issuerWallet);

      await createTrustLine(aliceWallet, issuerWallet);
      await createTrustLine(bobWallet, issuerWallet);

      await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);
      await mintTokens(issuerWallet, bobWallet, MINT_AMOUNT);

      const aliceBalance = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalance = await getTokenBalance(bobWallet, issuerWallet);
      expect(aliceBalance).toBe(MINT_AMOUNT);
      expect(bobBalance).toBe(MINT_AMOUNT);
    }, 120000);
  });

  describe("Phase 2: Freeze Alice trust line", () => {
    it("should freeze Alice trust line via TrustSet + tfSetFreeze", async () => {
      console.log("\n==================== PHASE 2: FREEZE ALICE TRUST LINE ====================");

      await freezeTrustLine(issuerWallet, aliceWallet);

      const aliceLine = await findTrustLine(aliceWallet, issuerWallet);
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.freeze_peer).toBe(true);

      console.log("✅ Alice trust line frozen successfully");
    }, 30000);
  });

  describe("Phase 3: Verify freeze effects", () => {
    it("should fail Alice→Bob transfer while frozen", async () => {
      console.log("\n==================== PHASE 3: VERIFY FREEZE EFFECTS ====================");
      console.log("🙅 Testing Alice→Bob transfer while frozen...");

      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await expectTxFail("tecPATH_DRY", () => transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet));

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(bobBalanceAfter).toBe(bobBalanceBefore);

      console.log("✅ Alice→Bob transfer correctly failed (frozen)");
    }, 30000);

    it("should allow Bob→Alice transfer while Alice is frozen (freeze only blocks outgoing)", async () => {
      console.log("💸 Testing Bob→Alice transfer while Alice is frozen...");

      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);

      await transferTokens(bobWallet, aliceWallet, TRANSFER_AMOUNT, issuerWallet);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      expect(Number(aliceBalanceAfter) - Number(aliceBalanceBefore)).toBe(Number(TRANSFER_AMOUNT));

      console.log(`✅ Bob→Alice transfer succeeded (freeze only blocks outgoing): +${TRANSFER_AMOUNT} ${CURRENCY}`);
    }, 30000);

    it("should allow Bob→Bob2 style transfer (Bob is NOT frozen)", async () => {
      console.log("✅ Testing Bob is unaffected (not frozen)...");

      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);
      const redeemAmount = "100";

      await transferTokens(bobWallet, issuerWallet, redeemAmount, issuerWallet);

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(Number(bobBalanceBefore) - Number(bobBalanceAfter)).toBe(Number(redeemAmount));

      console.log(`✅ Bob can still redeem to issuer (not frozen): -${redeemAmount} ${CURRENCY}`);
    }, 30000);

    it("should allow Issuer to mint to frozen Alice", async () => {
      console.log("💰 Testing Issuer can still mint to frozen Alice...");

      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);
      const mintAmount = "500";

      await mintTokens(issuerWallet, aliceWallet, mintAmount);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      expect(Number(aliceBalanceAfter) - Number(aliceBalanceBefore)).toBe(Number(mintAmount));

      console.log(`✅ Issuer minted ${mintAmount} ${CURRENCY} to frozen Alice`);
    }, 30000);
  });

  describe("Phase 4: Unfreeze Alice", () => {
    it("should unfreeze Alice trust line via tfClearFreeze", async () => {
      console.log("\n==================== PHASE 4: UNFREEZE ALICE ====================");

      await unfreezeTrustLine(issuerWallet, aliceWallet);

      const aliceLine = await findTrustLine(aliceWallet, issuerWallet);
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.freeze_peer).toBeFalsy();

      console.log("✅ Alice trust line unfrozen");
    }, 30000);

    it("should succeed Alice→Bob transfer after unfreeze", async () => {
      console.log("💸 Testing Alice→Bob transfer after unfreeze...");

      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(Number(bobBalanceAfter) - Number(bobBalanceBefore)).toBe(Number(TRANSFER_AMOUNT));

      console.log(`✅ Alice→Bob transfer restored: +${TRANSFER_AMOUNT} ${CURRENCY}`);
    }, 30000);
  });

  describe("Phase 5: asfNoFreeze (permanent)", () => {
    it("should set asfNoFreeze flag", async () => {
      console.log("\n==================== PHASE 5: asfNoFreeze (PERMANENT) ====================");

      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfNoFreeze);
      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfNoFreeze, true);

      console.log("✅ asfNoFreeze flag set (permanent)");
    }, 20000);

    it("should fail to freeze any trust line after asfNoFreeze", async () => {
      console.log("🙅 Attempting to freeze Bob trust line after asfNoFreeze...");

      // freezeTrustLine expects tesSUCCESS; must construct inline for expected failure
      const freezeAttemptTx = await client.autofill({
        TransactionType: "TrustSet" as const,
        Account: issuerWallet.address,
        LimitAmount: {
          currency: currencyToHex(CURRENCY),
          issuer: bobWallet.address,
          value: "0",
        },
        Flags: TrustSetFlags.tfSetFreeze,
      });
      await expectTxFail("tecNO_PERMISSION", () => submitTransaction(client, freezeAttemptTx, issuerWallet));

      console.log("✅ Freeze attempt correctly rejected after asfNoFreeze");
    }, 30000);

    it("should not be able to clear asfNoFreeze (permanent)", async () => {
      console.log("🔒 Verifying asfNoFreeze cannot be cleared...");

      const clearNoFreezeTx = await client.autofill({
        TransactionType: "AccountSet" as const,
        Account: issuerWallet.address,
        ClearFlag: AccountSetAsfFlags.asfNoFreeze,
      });

      const signed = issuerWallet.sign(clearNoFreezeTx);
      const result = await client.submitAndWait(signed.tx_blob);
      const txResult = (result.result.meta as TransactionMetadata)?.TransactionResult;
      // Flag stays set either way
      expect(["tesSUCCESS", "tecNO_PERMISSION"]).toContain(txResult);

      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfNoFreeze, true);

      console.log("✅ asfNoFreeze flag remains set (permanent, cannot be cleared)");
    }, 20000);
  });
});
