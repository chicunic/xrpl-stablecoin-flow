import { CURRENCY, MINT_AMOUNT, TRANSFER_AMOUNT } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  disconnectClient,
  findTrustLine,
  getTokenBalance,
  mintTokens,
  setupWallets,
} from "@tests/utils/test.helper.js";
import {
  cashCheck,
  clearNoRippleOnTrustLine,
  createCheck,
  setAccountFlag,
  setupIssuerWithDomain,
  verifyAccountFlag,
} from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

/**
 * DepositAuth Check Test
 *
 * Tests check payment with DepositAuth:
 *   Phase 1: Setup - Create Issuer, Alice, Bob (without DefaultRipple)
 *   Phase 2: Trust Lines and Token Setup (clear NoRipple for Bob)
 *   Phase 3: DepositAuth + Check Payment (Bob cashes check despite DepositAuth)
 */
describe("Trust Line Token DepositAuth Check Flow", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("DepositAuth Check Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup - Create Issuer and User Accounts", () => {
    it("should configure issuer account without DefaultRipple", async () => {
      console.log("\n==================== PHASE 1: SETUP - CREATE ISSUER AND USER ACCOUNTS ====================");

      await setupIssuerWithDomain(issuerWallet);

      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfDefaultRipple, false);

      console.log("✅ Issuer configured without DefaultRipple flag");
    }, 20000);
  });

  describe("Phase 2: Trust Lines and Token Setup", () => {
    it("should create trust lines to issuer", async () => {
      console.log("\n==================== PHASE 2: TRUST LINES AND TOKEN SETUP ====================");

      await createTrustLine(aliceWallet, issuerWallet);
      await createTrustLine(bobWallet, issuerWallet);

      console.log("✅ Trust lines created successfully");
    }, 40000);

    it("should issuer clear NoRipple flag for Bob trust line", async () => {
      await clearNoRippleOnTrustLine(issuerWallet, bobWallet);

      const issuerToBobLine = await findTrustLine(issuerWallet, bobWallet);
      expect(issuerToBobLine?.no_ripple).toBeFalsy();

      console.log("✅ Issuer cleared NoRipple flag for Bob trust line");
    }, 20000);

    it("should issue USD tokens to Alice", async () => {
      await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);

      const aliceBalance = await getTokenBalance(aliceWallet, issuerWallet);
      expect(aliceBalance).toBe(MINT_AMOUNT);

      console.log(`✅ Alice now has ${MINT_AMOUNT} ${CURRENCY}`);
    }, 20000);
  });

  describe("Phase 3: DepositAuth and Check Payment", () => {
    let checkId: string;

    it("should enable DepositAuth flag on Bob", async () => {
      console.log("\n==================== PHASE 3: DEPOSITAUTH AND CHECK PAYMENT ====================");

      await setAccountFlag(bobWallet, AccountSetAsfFlags.asfDepositAuth);

      await verifyAccountFlag(bobWallet.address, AccountRootFlags.lsfDepositAuth, true);

      console.log("✅ DepositAuth flag enabled on Bob successfully");
    }, 20000);

    it("should allow Alice to create a check payable to Bob", async () => {
      checkId = await createCheck(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);

      console.log(`✅ Check created successfully with ID: ${checkId}`);
    }, 10000);

    it("should allow Bob to cash the check despite DepositAuth being enabled", async () => {
      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await cashCheck(bobWallet, checkId, TRANSFER_AMOUNT, issuerWallet);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(aliceBalanceAfter)).toEqual(BigInt(aliceBalanceBefore) - BigInt(TRANSFER_AMOUNT));
      expect(BigInt(bobBalanceAfter)).toEqual(BigInt(bobBalanceBefore) + BigInt(TRANSFER_AMOUNT));

      console.log(
        `✅ Check cashed successfully despite DepositAuth: Alice ${aliceBalanceBefore} -> ${aliceBalanceAfter} ${CURRENCY}, Bob ${bobBalanceBefore} -> ${bobBalanceAfter} ${CURRENCY}`,
      );
    }, 50000);
  });
});
