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
import { setupIssuerWithDomain, transferTokens, verifyAccountFlag } from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

/**
 * DefaultRipple Flag Test
 *
 * Tests DefaultRipple flag behavior:
 *   Phase 1: Setup - Create two issuers (with/without DefaultRipple), Alice, Bob
 *   Phase 2: Test Issuer WITH DefaultRipple — Alice->Bob transfer succeeds
 *   Phase 3: Test Issuer WITHOUT DefaultRipple — Alice->Bob transfer fails (tecPATH_DRY)
 */
describe("Trust Line Token DefaultRipple", () => {
  let client: Client;

  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let issuerWithDefaultRipple: Wallet;
  let issuerWithoutDefaultRipple: Wallet;

  beforeAll(async () => {
    client = await connectClient("DefaultRipple Flag Test");
    [issuerWithDefaultRipple, issuerWithoutDefaultRipple, aliceWallet, bobWallet] = await setupWallets(4);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup - Create Issuers and User Accounts", () => {
    it("should configure issuer WITH DefaultRipple flag", async () => {
      console.log("\n==================== PHASE 1: SETUP - CREATE ISSUERS AND USER ACCOUNTS ====================");

      await setupIssuerWithFlags(issuerWithDefaultRipple);

      await verifyAccountFlag(issuerWithDefaultRipple.address, AccountRootFlags.lsfDefaultRipple, true);

      console.log("✅ Issuer setup complete WITH DefaultRipple flag");
    }, 20000);

    it("should configure issuer WITHOUT DefaultRipple flag", async () => {
      await setupIssuerWithDomain(issuerWithoutDefaultRipple);

      await verifyAccountFlag(issuerWithoutDefaultRipple.address, AccountRootFlags.lsfDefaultRipple, false);

      console.log("✅ Issuer setup complete WITHOUT DefaultRipple flag");
    }, 20000);
  });

  describe("Phase 2: Test Issuer WITH DefaultRipple", () => {
    it("should create trust lines to issuer with DefaultRipple", async () => {
      console.log("\n==================== PHASE 2: TEST ISSUER WITH DEFAULTRIPPLE ====================");

      await createTrustLine(aliceWallet, issuerWithDefaultRipple);
      await createTrustLine(bobWallet, issuerWithDefaultRipple);

      // Verify ripple flags on trust lines
      const aliceLine = await findTrustLine(aliceWallet, issuerWithDefaultRipple);
      expect(aliceLine?.no_ripple).toBeFalsy();
      expect(aliceLine?.no_ripple_peer).toBeFalsy();

      const bobLine = await findTrustLine(bobWallet, issuerWithDefaultRipple);
      expect(bobLine?.no_ripple).toBeFalsy();
      expect(bobLine?.no_ripple_peer).toBeFalsy();

      console.log("✅ Trust lines created to issuer WITH DefaultRipple");
    }, 40000);

    it("should issue USD tokens to Alice and succeed Alice -> Bob transfer", async () => {
      await mintTokens(issuerWithDefaultRipple, aliceWallet, MINT_AMOUNT);

      const aliceBalance = await getTokenBalance(aliceWallet, issuerWithDefaultRipple);
      expect(aliceBalance).toBe(MINT_AMOUNT);

      await transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWithDefaultRipple);

      const bobBalance = await getTokenBalance(bobWallet, issuerWithDefaultRipple);
      expect(bobBalance).toBe(TRANSFER_AMOUNT);

      console.log(`✅ Transfer successful with DefaultRipple issuer: Alice -> Bob (${TRANSFER_AMOUNT} ${CURRENCY})`);
    }, 40000);
  });

  describe("Phase 3: Test Issuer WITHOUT DefaultRipple", () => {
    it("should create trust lines to issuer without DefaultRipple", async () => {
      console.log("\n==================== PHASE 3: TEST ISSUER WITHOUT DEFAULTRIPPLE ====================");

      await createTrustLine(aliceWallet, issuerWithoutDefaultRipple);
      await createTrustLine(bobWallet, issuerWithoutDefaultRipple);

      // Verify NoRipple flags are set on peer side (expected without DefaultRipple)
      const aliceLine = await findTrustLine(aliceWallet, issuerWithoutDefaultRipple);
      expect(aliceLine?.no_ripple).toBeFalsy();
      expect(aliceLine?.no_ripple_peer).toBeTruthy();

      const bobLine = await findTrustLine(bobWallet, issuerWithoutDefaultRipple);
      expect(bobLine?.no_ripple).toBeFalsy();
      expect(bobLine?.no_ripple_peer).toBeTruthy();

      console.log("✅ Trust lines created to issuer WITHOUT DefaultRipple");
    }, 40000);

    it("should fail Alice -> Bob transfer with non-DefaultRipple issuer", async () => {
      await mintTokens(issuerWithoutDefaultRipple, aliceWallet, MINT_AMOUNT);

      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWithoutDefaultRipple);
      expect(BigInt(bobBalanceBefore)).toEqual(0n);

      await expectTxFail("tecPATH_DRY", () =>
        transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWithoutDefaultRipple),
      );

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWithoutDefaultRipple);
      expect(bobBalanceAfter).toBe(bobBalanceBefore);

      console.log("✅ Transfer correctly failed without DefaultRipple: tecPATH_DRY");
    }, 50000);
  });
});
