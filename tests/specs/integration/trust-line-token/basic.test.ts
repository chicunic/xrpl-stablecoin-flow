import { CURRENCY, MINT_AMOUNT, TRANSFER_AMOUNT, TRUST_AMOUNT } from "@tests/utils/data.js";
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
  setAccountFlag,
  setupIssuerWithDomain,
  transferTokens,
  verifyAccountFlag,
} from "@/services/trustline-token.service.js";
import type { Client, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";
import { AccountRootFlags } from "xrpl/dist/npm/models/ledger/index.js";

/**
 * Trust Line Token Basic Lifecycle
 *
 * Tests the fundamental trust line token operations:
 *   Phase 1: Setup issuer with DefaultRipple
 *   Phase 2: Create trust lines
 *   Phase 3: Mint (issuer → holder)
 *   Phase 4: Peer-to-peer transfer
 *   Phase 5: Burn (holder → issuer)
 *   Phase 6: Delete trust line (set limit to 0)
 */
describe("Trust Line Token Basic Lifecycle", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("Trust Line Token Basic Lifecycle Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup Issuer", () => {
    it("should configure issuer with DefaultRipple", async () => {
      console.log("\n==================== PHASE 1: SETUP ISSUER ====================");

      await setupIssuerWithDomain(issuerWallet);
      await setAccountFlag(issuerWallet, AccountSetAsfFlags.asfDefaultRipple);
      await verifyAccountFlag(issuerWallet.address, AccountRootFlags.lsfDefaultRipple, true);

      console.log("✅ Issuer configured with DefaultRipple");
    }, 30000);
  });

  describe("Phase 2: Create Trust Lines", () => {
    it("should create trust lines for Alice and Bob", async () => {
      console.log("\n==================== PHASE 2: CREATE TRUST LINES ====================");

      await createTrustLine(aliceWallet, issuerWallet);
      await createTrustLine(bobWallet, issuerWallet);

      const aliceLine = await findTrustLine(aliceWallet, issuerWallet);
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.limit).toBe(TRUST_AMOUNT);

      const bobLine = await findTrustLine(bobWallet, issuerWallet);
      expect(bobLine).toBeDefined();
      expect(bobLine?.limit).toBe(TRUST_AMOUNT);

      console.log(`✅ Alice and Bob trust lines created (limit: ${TRUST_AMOUNT} ${CURRENCY})`);
    }, 30000);
  });

  describe("Phase 3: Mint Tokens", () => {
    it("should mint tokens from issuer to Alice", async () => {
      console.log("\n==================== PHASE 3: MINT TOKENS ====================");

      await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);

      expect(await getTokenBalance(aliceWallet, issuerWallet)).toBe(MINT_AMOUNT);

      console.log(`✅ Minted ${MINT_AMOUNT} ${CURRENCY} to Alice`);
    }, 30000);
  });

  describe("Phase 4: Peer-to-Peer Transfer", () => {
    it("should transfer tokens from Alice to Bob", async () => {
      console.log("\n==================== PHASE 4: PEER-TO-PEER TRANSFER ====================");

      const aliceBefore = BigInt(await getTokenBalance(aliceWallet, issuerWallet));
      const bobBefore = BigInt(await getTokenBalance(bobWallet, issuerWallet));

      await transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet);

      expect(BigInt(await getTokenBalance(aliceWallet, issuerWallet))).toBe(aliceBefore - BigInt(TRANSFER_AMOUNT));
      expect(BigInt(await getTokenBalance(bobWallet, issuerWallet))).toBe(bobBefore + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Alice transferred ${TRANSFER_AMOUNT} ${CURRENCY} to Bob`);
    }, 30000);
  });

  describe("Phase 5: Burn Tokens", () => {
    it("should burn tokens by transferring back to issuer", async () => {
      console.log("\n==================== PHASE 5: BURN TOKENS ====================");

      const aliceBalance = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalance = await getTokenBalance(bobWallet, issuerWallet);

      await transferTokens(aliceWallet, issuerWallet, aliceBalance, issuerWallet);
      await transferTokens(bobWallet, issuerWallet, bobBalance, issuerWallet);

      expect(await getTokenBalance(aliceWallet, issuerWallet)).toBe("0");
      expect(await getTokenBalance(bobWallet, issuerWallet)).toBe("0");

      console.log("✅ All tokens burned");
    }, 30000);
  });

  describe("Phase 6: Delete Trust Lines", () => {
    it("should delete trust lines by setting limit to 0", async () => {
      console.log("\n==================== PHASE 6: DELETE TRUST LINES ====================");

      await createTrustLine(aliceWallet, issuerWallet, CURRENCY, "0");
      await createTrustLine(bobWallet, issuerWallet, CURRENCY, "0");

      console.log("✅ Trust lines deleted (limit set to 0)");
    }, 30000);
  });
});
