import { CURRENCY, TRANSFER_AMOUNT } from "@tests/utils/data.js";
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
  clearNoRippleOnTrustLine,
  setAccountFlag,
  setupIssuerWithDomain,
  transferTokens,
} from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";

/**
 * XRPL No Ripple Flow Test
 *
 * Tests the NoRipple flag behavior when DefaultRipple is NOT set:
 *   Phase 1: Create and Fund Accounts, configure issuer WITHOUT DefaultRipple
 *   Phase 2: Setup Trust Lines (NoRipple set by default), clear NoRipple on Bob
 *   Phase 3: Token Minting and Transfer Flow
 */
describe("Trust Line Token NoRipple Flow", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("XRPL No Ripple Flow Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Create and Fund Accounts", () => {
    it("should configure issuer WITHOUT DefaultRipple", async () => {
      console.log("\n==================== PHASE 1: CREATE AND FUND ACCOUNTS ====================");

      await setupIssuerWithDomain(issuerWallet);
      console.log("✅ Flag Domain set");

      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfAllowTrustLineClawback);
      console.log("✅ Flag AllowTrustLineClawback set");

      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfDisallowXRP);
      console.log("✅ Flag DisallowXRP set");

      console.log("✅ Issuer configured WITHOUT DefaultRipple flag");
    }, 20000);
  });

  describe("Phase 2: Setup Trust Lines", () => {
    it("should create Alice trust line to Issuer", async () => {
      console.log("\n==================== PHASE 2: SETUP TRUST LINES ====================");

      await createTrustLine(aliceWallet, issuerWallet);

      const aliceLine = await findTrustLine(aliceWallet, issuerWallet);
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.balance).toBe("0");
      expect(aliceLine?.no_ripple).toBeFalsy();
      expect(aliceLine?.no_ripple_peer).toBeTruthy(); // Without DefaultRipple, NoRipple is set by default

      console.log(`✅ Alice trusts Issuer for ${CURRENCY}`);
    }, 20000);

    it("should create Bob trust line to Issuer", async () => {
      await createTrustLine(bobWallet, issuerWallet);

      const bobLine = await findTrustLine(bobWallet, issuerWallet);
      expect(bobLine).toBeDefined();
      expect(bobLine?.balance).toBe("0");
      expect(bobLine?.no_ripple).toBeFalsy();
      expect(bobLine?.no_ripple_peer).toBeTruthy(); // Without DefaultRipple, NoRipple is set by default

      console.log(`✅ Bob trusts Issuer for ${CURRENCY}`);
    }, 20000);

    it("should clear NoRipple flag on Bob trust line from Issuer side", async () => {
      await clearNoRippleOnTrustLine(issuerWallet, bobWallet);

      // Verify from Bob's perspective
      const bobLine = await findTrustLine(bobWallet, issuerWallet);
      expect(bobLine).toBeDefined();
      expect(bobLine?.no_ripple).toBeFalsy();
      expect(bobLine?.no_ripple_peer).toBeFalsy();

      console.log("✅ NoRipple flag cleared on Issuer -> Bob trust line");
    }, 20000);
  });

  describe("Phase 3: Token Minting and Transfer", () => {
    it("should mint USD tokens from Issuer to Alice", async () => {
      console.log("\n==================== PHASE 3: TOKEN MINTING AND TRANSFER ====================");

      await mintTokens(issuerWallet, aliceWallet, TRANSFER_AMOUNT);

      const aliceBalance = await getTokenBalance(aliceWallet, issuerWallet);
      expect(aliceBalance).toBe(TRANSFER_AMOUNT);

      console.log(`✅ Alice now has ${TRANSFER_AMOUNT} ${CURRENCY}`);
    }, 20000);

    it("should transfer USD from Alice to Bob", async () => {
      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(aliceBalanceAfter)).toEqual(BigInt(aliceBalanceBefore) - BigInt(TRANSFER_AMOUNT));
      expect(BigInt(bobBalanceAfter)).toEqual(BigInt(bobBalanceBefore) + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Alice transferred ${TRANSFER_AMOUNT} ${CURRENCY} to Bob`);
    }, 50000);

    it("should burn tokens by transferring from Bob back to Issuer", async () => {
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      await transferTokens(bobWallet, issuerWallet, TRANSFER_AMOUNT, issuerWallet);

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(BigInt(bobBalanceAfter)).toEqual(BigInt(bobBalanceBefore) - BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Bob burned ${TRANSFER_AMOUNT} ${CURRENCY} by sending back to Issuer`);
    }, 30000);
  });
});
