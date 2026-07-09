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
import { cancelCheck, cashCheck, createCheck } from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";

/**
 * Check Test
 *
 * Tests check operations:
 *   Phase 1: Setup - Create Issuer, Alice, Bob with DefaultRipple
 *   Phase 2: Trust Lines and Token Setup
 *   Phase 3: Check Creation and Cash (Alice creates check, Bob cashes it)
 *   Phase 4: Check Cancellation Testing (sender and receiver cancel checks)
 */
describe("Trust Line Token Check", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("Check Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup - Create Issuer and User Accounts", () => {
    it("should configure the issuer account", async () => {
      console.log("\n==================== PHASE 1: SETUP - CREATE ISSUER AND USER ACCOUNTS ====================");

      await setupIssuerWithFlags(issuerWallet);
    }, 60000);
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

  describe("Phase 3: Check Creation and Cash", () => {
    let checkId: string;

    it("should allow Alice to create a check payable to Bob", async () => {
      console.log("\n==================== PHASE 3: CHECK CREATION AND CASH ====================");

      checkId = await createCheck(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);

      console.log(`✅ Check created successfully with ID: ${checkId}`);
    }, 10000);

    it("should allow Bob to cash the check and receive tokens", async () => {
      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await cashCheck(bobWallet, checkId, TRANSFER_AMOUNT, issuerWallet);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(aliceBalanceAfter)).toEqual(BigInt(aliceBalanceBefore) - BigInt(TRANSFER_AMOUNT));
      expect(BigInt(bobBalanceAfter)).toEqual(BigInt(bobBalanceBefore) + BigInt(TRANSFER_AMOUNT));

      console.log(
        `✅ Check cashed successfully: Alice ${aliceBalanceBefore} -> ${aliceBalanceAfter} ${CURRENCY}, Bob ${bobBalanceBefore} -> ${bobBalanceAfter} ${CURRENCY}`,
      );
    }, 50000);
  });

  describe("Phase 4: Check Cancellation Testing", () => {
    let firstCheckId: string;
    let secondCheckId: string;

    it("should create two checks for cancellation testing", async () => {
      console.log("\n==================== PHASE 4: CHECK CANCELLATION TESTING ====================");

      firstCheckId = await createCheck(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);
      secondCheckId = await createCheck(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);

      console.log(`✅ Two checks created successfully with IDs: ${firstCheckId}, ${secondCheckId}`);
    }, 20000);

    it("should allow Alice to cancel first check", async () => {
      await cancelCheck(aliceWallet, firstCheckId);

      console.log("✅ First check canceled by Alice successfully");
    }, 10000);

    it("should fail when Bob tries to cash the first canceled check", async () => {
      await expectTxFail("tecNO_ENTRY", () => cashCheck(bobWallet, firstCheckId, TRANSFER_AMOUNT, issuerWallet));

      console.log("✅ Bob correctly failed to cash canceled check");
    }, 10000);

    it("should allow Bob to cancel second check", async () => {
      await cancelCheck(bobWallet, secondCheckId);

      console.log("✅ Second check canceled by Bob successfully");
    }, 10000);

    it("should fail when Bob tries to cash the second canceled check", async () => {
      await expectTxFail("tecNO_ENTRY", () => cashCheck(bobWallet, secondCheckId, TRANSFER_AMOUNT, issuerWallet));

      console.log("✅ Bob correctly failed to cash canceled check");
    }, 10000);
  });
});
