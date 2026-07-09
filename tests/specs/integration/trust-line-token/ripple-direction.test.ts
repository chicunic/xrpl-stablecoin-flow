import { CURRENCY, MINT_AMOUNT, TRANSFER_AMOUNT } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  disconnectClient,
  expectTxFail,
  findTrustLine,
  getTokenBalance,
  mintTokens,
  setupWallets,
} from "@tests/utils/test.helper.js";
import { clearNoRippleOnTrustLine, setupIssuerWithDomain, transferTokens } from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";

/**
 * Ripple Direction Test (without DefaultRipple)
 *
 * Issuer does NOT enable asfDefaultRipple. Trust lines default to NoRipple on the issuer side.
 * Issuer selectively clears NoRipple via a reverse TrustSet (tfClearNoRipple) to enable rippling per user.
 *
 * Two trust line states:
 *   - userA: standard trust line only (user -> issuer), no_ripple_peer = true (rippling blocked)
 *   - userB: standard trust line + issuer reverse TrustSet with ClearNoRipple, no_ripple_peer = false (rippling allowed)
 *
 * Transfer matrix (4 combinations):
 *   userA (no_ripple_peer=true)  -> userA (no_ripple_peer=true)  : FAIL  (tecPATH_DRY, both sides block rippling)
 *   userA (no_ripple_peer=true)  -> userB (no_ripple_peer=false) : OK    (destination allows rippling)
 *   userB (no_ripple_peer=false) -> userA (no_ripple_peer=true)  : OK    (source allows rippling)
 *   userB (no_ripple_peer=false) -> userB (no_ripple_peer=false) : OK    (both sides allow rippling)
 */
describe("Trust Line Token Ripple Direction", () => {
  let client: Client;

  let issuerWallet: Wallet;
  // no_ripple_peer = true (standard trust line, rippling blocked)
  let userA1: Wallet;
  let userA2: Wallet;
  // no_ripple_peer = false (issuer cleared NoRipple, rippling allowed)
  let userB1: Wallet;
  let userB2: Wallet;

  beforeAll(async () => {
    client = await connectClient("Ripple Direction Test (without DefaultRipple)");
    [issuerWallet, userA1, userA2, userB1, userB2] = await setupWallets(5);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup Issuer WITHOUT DefaultRipple", () => {
    it("should configure issuer WITHOUT DefaultRipple", async () => {
      console.log("\n==================== PHASE 1: SETUP ====================");

      await setupIssuerWithDomain(issuerWallet);

      console.log("✅ Issuer configured WITHOUT DefaultRipple");
    }, 20000);
  });

  describe("Phase 2: Create Trust Lines", () => {
    it("should create userA1 trust line (no_ripple_peer=true)", async () => {
      console.log("\n==================== PHASE 2: TRUST LINES ====================");

      await createTrustLine(userA1, issuerWallet);

      const line = await findTrustLine(userA1, issuerWallet);
      expect(line).toBeDefined();
      expect(line?.no_ripple).toBeFalsy();
      expect(line?.no_ripple_peer).toBeTruthy();

      console.log("✅ userA1 trust line created (no_ripple_peer=true)");
    }, 20000);

    it("should create userA2 trust line (no_ripple_peer=true)", async () => {
      await createTrustLine(userA2, issuerWallet);

      const line = await findTrustLine(userA2, issuerWallet);
      expect(line).toBeDefined();
      expect(line?.no_ripple).toBeFalsy();
      expect(line?.no_ripple_peer).toBeTruthy();

      console.log("✅ userA2 trust line created (no_ripple_peer=true)");
    }, 20000);

    it("should create userB1 trust line and clear NoRipple (no_ripple_peer=false)", async () => {
      await createTrustLine(userB1, issuerWallet);
      await clearNoRippleOnTrustLine(issuerWallet, userB1);

      const line = await findTrustLine(userB1, issuerWallet);
      expect(line).toBeDefined();
      expect(line?.no_ripple).toBeFalsy();
      expect(line?.no_ripple_peer).toBeFalsy();

      console.log("✅ userB1 trust line created + issuer ClearNoRipple (no_ripple_peer=false)");
    }, 30000);

    it("should create userB2 trust line and clear NoRipple (no_ripple_peer=false)", async () => {
      await createTrustLine(userB2, issuerWallet);
      await clearNoRippleOnTrustLine(issuerWallet, userB2);

      const line = await findTrustLine(userB2, issuerWallet);
      expect(line).toBeDefined();
      expect(line?.no_ripple).toBeFalsy();
      expect(line?.no_ripple_peer).toBeFalsy();

      console.log("✅ userB2 trust line created + issuer ClearNoRipple (no_ripple_peer=false)");
    }, 30000);
  });

  describe("Phase 3: Mint Tokens", () => {
    it("should mint tokens to all users", async () => {
      console.log("\n==================== PHASE 3: MINT TOKENS ====================");

      await mintTokens(issuerWallet, userA1, MINT_AMOUNT);
      await mintTokens(issuerWallet, userA2, MINT_AMOUNT);
      await mintTokens(issuerWallet, userB1, MINT_AMOUNT);
      await mintTokens(issuerWallet, userB2, MINT_AMOUNT);

      expect(await getTokenBalance(userA1, issuerWallet)).toBe(MINT_AMOUNT);
      expect(await getTokenBalance(userA2, issuerWallet)).toBe(MINT_AMOUNT);
      expect(await getTokenBalance(userB1, issuerWallet)).toBe(MINT_AMOUNT);
      expect(await getTokenBalance(userB2, issuerWallet)).toBe(MINT_AMOUNT);

      console.log(`✅ All users minted ${MINT_AMOUNT} ${CURRENCY}`);
    }, 60000);
  });

  describe("Phase 4: Transfer Direction Combinations", () => {
    it("should FAIL: userA1 (no_ripple_peer=true) -> userA2 (no_ripple_peer=true)", async () => {
      console.log("\n==================== PHASE 4: TRANSFER COMBINATIONS ====================");

      const a1Before = await getTokenBalance(userA1, issuerWallet);
      const a2Before = await getTokenBalance(userA2, issuerWallet);

      await expectTxFail("tecPATH_DRY", () => transferTokens(userA1, userA2, TRANSFER_AMOUNT, issuerWallet));

      expect(await getTokenBalance(userA1, issuerWallet)).toBe(a1Before);
      expect(await getTokenBalance(userA2, issuerWallet)).toBe(a2Before);

      console.log("✅ Transfer correctly failed: tecPATH_DRY (both sides block rippling)");
    }, 30000);

    it("should OK: userA1 (no_ripple_peer=true) -> userB1 (no_ripple_peer=false)", async () => {
      const a1Before = BigInt(await getTokenBalance(userA1, issuerWallet));
      const b1Before = BigInt(await getTokenBalance(userB1, issuerWallet));

      await transferTokens(userA1, userB1, TRANSFER_AMOUNT, issuerWallet);

      expect(BigInt(await getTokenBalance(userA1, issuerWallet))).toBe(a1Before - BigInt(TRANSFER_AMOUNT));
      expect(BigInt(await getTokenBalance(userB1, issuerWallet))).toBe(b1Before + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Transfer succeeded: userA1 -> userB1 (${TRANSFER_AMOUNT} ${CURRENCY})`);
    }, 30000);

    it("should OK: userB1 (no_ripple_peer=false) -> userA2 (no_ripple_peer=true)", async () => {
      const b1Before = BigInt(await getTokenBalance(userB1, issuerWallet));
      const a2Before = BigInt(await getTokenBalance(userA2, issuerWallet));

      await transferTokens(userB1, userA2, TRANSFER_AMOUNT, issuerWallet);

      expect(BigInt(await getTokenBalance(userB1, issuerWallet))).toBe(b1Before - BigInt(TRANSFER_AMOUNT));
      expect(BigInt(await getTokenBalance(userA2, issuerWallet))).toBe(a2Before + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Transfer succeeded: userB1 -> userA2 (${TRANSFER_AMOUNT} ${CURRENCY})`);
    }, 30000);

    it("should OK: userB1 (no_ripple_peer=false) -> userB2 (no_ripple_peer=false)", async () => {
      const b1Before = BigInt(await getTokenBalance(userB1, issuerWallet));
      const b2Before = BigInt(await getTokenBalance(userB2, issuerWallet));

      await transferTokens(userB1, userB2, TRANSFER_AMOUNT, issuerWallet);

      expect(BigInt(await getTokenBalance(userB1, issuerWallet))).toBe(b1Before - BigInt(TRANSFER_AMOUNT));
      expect(BigInt(await getTokenBalance(userB2, issuerWallet))).toBe(b2Before + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Transfer succeeded: userB1 -> userB2 (${TRANSFER_AMOUNT} ${CURRENCY})`);
    }, 30000);
  });
});
