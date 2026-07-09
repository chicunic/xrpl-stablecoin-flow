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
  preauthorizeSender,
  setAccountFlag,
  transferTokens,
  verifyAccountFlag,
} from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

/**
 * Issuer DepositAuth Burn Block Test
 *
 * Tests that DepositAuth on issuer (bank) blocks burn (user -> issuer payment):
 *   Phase 1: Setup - Create Issuer and User with DefaultRipple
 *   Phase 2: Trust Lines and Token Setup
 *   Phase 3: Enable DepositAuth on Issuer — user burn blocked
 *   Phase 4: Preauthorize user — burn succeeds
 */
describe("Trust Line Token Issuer DepositAuth (Burn Block)", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let userWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("Issuer DepositAuth Burn Block Test");
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

  describe("Phase 3: Enable DepositAuth on Issuer — Burn Blocked", () => {
    it("should enable DepositAuth flag on issuer", async () => {
      console.log("\n==================== PHASE 3: ENABLE DEPOSITAUTH ON ISSUER ====================");

      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfDepositAuth);

      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfDepositAuth, true);

      console.log("✅ DepositAuth flag enabled on issuer successfully");
    }, 20000);

    it("should fail user -> issuer burn with DepositAuth enabled on issuer", async () => {
      const userBalanceBefore = await getTokenBalance(userWallet, issuerWallet);

      await expectTxFail("tecNO_PERMISSION", () =>
        transferTokens(userWallet, issuerWallet, TRANSFER_AMOUNT, issuerWallet),
      );

      expect(await getTokenBalance(userWallet, issuerWallet)).toBe(userBalanceBefore);

      console.log("✅ User -> Issuer burn correctly failed with DepositAuth on issuer");
    }, 30000);
  });

  describe("Phase 4: Preauthorize User — Burn Succeeds", () => {
    it("should preauthorize user to send to issuer", async () => {
      console.log("\n==================== PHASE 4: PREAUTHORIZE USER — BURN SUCCEEDS ====================");

      await preauthorizeSender(issuerWallet, userWallet);

      console.log("✅ Issuer has preauthorized user to send deposits");
    }, 10000);

    it("should succeed user -> issuer burn after preauthorization", async () => {
      const userBalanceBefore = await getTokenBalance(userWallet, issuerWallet);

      await transferTokens(userWallet, issuerWallet, TRANSFER_AMOUNT, issuerWallet);

      const userBalanceAfter = await getTokenBalance(userWallet, issuerWallet);
      expect(BigInt(userBalanceAfter)).toEqual(BigInt(userBalanceBefore) - BigInt(TRANSFER_AMOUNT));

      console.log(
        `✅ Burn successful after preauthorization: User ${userBalanceBefore} -> ${userBalanceAfter} ${CURRENCY}`,
      );
    }, 30000);
  });
});
