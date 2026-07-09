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
  cashCheck,
  createCheck,
  setAccountFlag,
  transferTokens,
  verifyAccountFlag,
} from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

/**
 * Check Burn via Issuer Test
 *
 * Tests using Check (CheckCreate/CheckCash) to burn tokens back to issuer, bypassing DepositAuth:
 *   Phase 1: Setup - Create Issuer and User with DefaultRipple
 *   Phase 2: Trust Lines and Token Setup
 *   Phase 3: Enable DepositAuth on Issuer — direct burn blocked
 *   Phase 4: Check-to-Issuer Burn — user creates check, issuer cashes to burn
 */
describe("Trust Line Token Check Burn via Issuer", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let userWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("Check Burn via Issuer Test");
    [issuerWallet, userWallet] = await setupWallets(2);
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
    it("should create trust line and issue tokens to user", async () => {
      console.log("\n==================== PHASE 2: TRUST LINES AND TOKEN SETUP ====================");

      await createTrustLine(userWallet, issuerWallet);
      await mintTokens(issuerWallet, userWallet, MINT_AMOUNT);

      expect(await getTokenBalance(userWallet, issuerWallet)).toBe(MINT_AMOUNT);

      console.log(`✅ User now has ${MINT_AMOUNT} ${CURRENCY}`);
    }, 60000);
  });

  describe("Phase 3: Enable DepositAuth on Issuer — Direct Burn Blocked", () => {
    it("should enable DepositAuth flag on issuer", async () => {
      console.log("\n==================== PHASE 3: ENABLE DEPOSITAUTH ON ISSUER ====================");

      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfDepositAuth);

      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfDepositAuth, true);

      console.log("✅ DepositAuth flag enabled on issuer successfully");
    }, 20000);

    it("should fail direct user -> issuer burn with DepositAuth", async () => {
      const userBalanceBefore = await getTokenBalance(userWallet, issuerWallet);

      await expectTxFail("tecNO_PERMISSION", () =>
        transferTokens(userWallet, issuerWallet, TRANSFER_AMOUNT, issuerWallet),
      );

      expect(await getTokenBalance(userWallet, issuerWallet)).toBe(userBalanceBefore);

      console.log("✅ Direct burn correctly blocked by DepositAuth on issuer");
    }, 30000);
  });

  describe("Phase 4: Check-to-Issuer Burn (Bypass DepositAuth)", () => {
    let checkId: string;

    it("should allow user to create a check payable to issuer", async () => {
      console.log("\n==================== PHASE 4: CHECK-TO-ISSUER BURN ====================");

      checkId = await createCheck(userWallet, issuerWallet, TRANSFER_AMOUNT, issuerWallet);

      console.log(`✅ Check created successfully with ID: ${checkId}`);
    }, 10000);

    it("should allow issuer to cash the check (burn) despite DepositAuth", async () => {
      const userBalanceBefore = await getTokenBalance(userWallet, issuerWallet);

      await cashCheck(issuerWallet, checkId, TRANSFER_AMOUNT, issuerWallet);

      const userBalanceAfter = await getTokenBalance(userWallet, issuerWallet);
      expect(BigInt(userBalanceAfter)).toEqual(BigInt(userBalanceBefore) - BigInt(TRANSFER_AMOUNT));

      console.log(
        `✅ Check-to-issuer burn successful despite DepositAuth: User ${userBalanceBefore} -> ${userBalanceAfter} ${CURRENCY}`,
      );
    }, 50000);
  });
});
