import { CURRENCY, MINT_AMOUNT, TRANSFER_AMOUNT, TRANSFER_RATE } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  disconnectClient,
  getTokenBalance,
  mintTokens,
  setupIssuerWithFlags,
  setupWallets,
} from "@tests/utils/test.helper.js";
import { setTransferRate, transferTokens } from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";

/**
 * TransferRate Test
 *
 * Tests transfer rate (fee) behavior on token transfers:
 *   Phase 1: Setup - Create Issuer, Alice, Bob with DefaultRipple
 *   Phase 2: Set TransferRate=0.5%, verify account_info returns correct value
 *   Phase 3: Mint to Alice (no fee), Alice->Bob transfer verifies 0.5% deduction
 *   Phase 4: Issuer->user no fee, user->Issuer (redeem) no fee
 *   Phase 5: Clear rate (set to 0), verify no fee restored
 */
describe("Trust Line Token TransferRate", () => {
  let client: Client;
  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("TransferRate Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup - Create Issuer, Alice, Bob", () => {
    it("should configure issuer with DefaultRipple", async () => {
      console.log("\n==================== PHASE 1: SETUP ====================");

      await setupIssuerWithFlags(issuerWallet);
    }, 120000);
  });

  describe("Phase 2: Set TransferRate and verify", () => {
    it("should set TransferRate=0.5% and verify in account_info", async () => {
      console.log("\n==================== PHASE 2: SET TRANSFER RATE ====================");

      await setTransferRate(issuerWallet, TRANSFER_RATE);

      const accountInfo = await client.request({
        command: "account_info",
        account: issuerWallet.address,
        ledger_index: "validated",
      });

      expect(accountInfo.result.account_data.TransferRate).toBe(TRANSFER_RATE);
      console.log(`✅ TransferRate set to ${TRANSFER_RATE} (0.5%)`);
    }, 20000);
  });

  describe("Phase 3: Mint and transfer with fee", () => {
    it("should create trust lines and mint tokens", async () => {
      console.log("\n==================== PHASE 3: MINT AND TRANSFER WITH FEE ====================");

      await createTrustLine(aliceWallet, issuerWallet);
      await createTrustLine(bobWallet, issuerWallet);
      await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);

      const aliceBalance = await getTokenBalance(aliceWallet, issuerWallet);
      expect(aliceBalance).toBe(MINT_AMOUNT);
      console.log(`✅ Alice minted ${MINT_AMOUNT} ${CURRENCY} (no fee on issuer->user)`);
    }, 60000);

    it("should deduct 0.5% fee on Alice->Bob transfer", async () => {
      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      // SendMax covers the transfer fee (0.5%)
      const sendMaxValue = String(Number(TRANSFER_AMOUNT) * 1.01);
      await transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet, { sendMax: sendMaxValue });

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);

      expect(bobBalanceAfter).toBe(String(Number(bobBalanceBefore) + Number(TRANSFER_AMOUNT)));

      const alicePaid = Number(aliceBalanceBefore) - Number(aliceBalanceAfter);
      const expectedFee = Number(TRANSFER_AMOUNT) * 0.005;
      const expectedTotal = Number(TRANSFER_AMOUNT) + expectedFee;
      expect(alicePaid).toBeCloseTo(expectedTotal, 6);

      console.log(`✅ Bob received: ${TRANSFER_AMOUNT} ${CURRENCY}`);
      console.log(`✅ Alice paid: ${alicePaid} ${CURRENCY} (includes 0.5% fee of ${expectedFee})`);
    }, 30000);
  });

  describe("Phase 4: Issuer operations have no fee", () => {
    it("should not charge fee on Issuer->user mint", async () => {
      console.log("\n==================== PHASE 4: ISSUER OPERATIONS NO FEE ====================");

      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);

      const additionalMint = "1000";
      await mintTokens(issuerWallet, aliceWallet, additionalMint);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      const received = Number(aliceBalanceAfter) - Number(aliceBalanceBefore);
      expect(received).toBe(Number(additionalMint));

      console.log(`✅ Issuer->Alice mint: no fee charged (received exactly ${additionalMint})`);
    }, 30000);

    it("should not charge fee on user->Issuer redemption", async () => {
      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);
      const redeemAmount = "100";

      await transferTokens(aliceWallet, issuerWallet, redeemAmount, issuerWallet);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      const spent = Number(aliceBalanceBefore) - Number(aliceBalanceAfter);
      expect(spent).toBe(Number(redeemAmount));

      console.log(`✅ User->Issuer redeem: no fee charged (Alice spent exactly ${redeemAmount})`);
    }, 30000);
  });

  describe("Phase 5: Clear TransferRate", () => {
    it("should clear TransferRate by setting to 0", async () => {
      console.log("\n==================== PHASE 5: CLEAR TRANSFER RATE ====================");

      await setTransferRate(issuerWallet, 0);

      const accountInfo = await client.request({
        command: "account_info",
        account: issuerWallet.address,
        ledger_index: "validated",
      });
      expect(accountInfo.result.account_data.TransferRate ?? 0).toBe(0);

      console.log("✅ TransferRate cleared");
    }, 20000);

    it("should transfer without fee after clearing rate", async () => {
      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);
      const amount = "100";

      await transferTokens(aliceWallet, bobWallet, amount, issuerWallet);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);

      const alicePaid = Number(aliceBalanceBefore) - Number(aliceBalanceAfter);
      const bobReceived = Number(bobBalanceAfter) - Number(bobBalanceBefore);

      expect(alicePaid).toBe(Number(amount));
      expect(bobReceived).toBe(Number(amount));

      console.log(`✅ No fee: Alice paid ${alicePaid}, Bob received ${bobReceived}`);
    }, 30000);
  });
});
