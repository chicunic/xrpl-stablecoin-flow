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
import { currencyToHex } from "@/services/transaction.service.js";
import { transferTokens } from "@/services/trustline-token.service.js";
import type { AccountLinesTrustline, Client, Wallet } from "xrpl";

describe("Trust Line Token Multi-Issuer", () => {
  let client: Client;
  let issuerAWallet: Wallet;
  let issuerBWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("Multi-Issuer Test");
    [issuerAWallet, issuerBWallet, aliceWallet, bobWallet] = await setupWallets(4);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup - Two issuers, both issuing USD", () => {
    it("should create and configure all wallets", async () => {
      console.log("\n==================== PHASE 1: SETUP ====================");

      await setupIssuerWithFlags(issuerAWallet);
      await setupIssuerWithFlags(issuerBWallet);
    }, 120000);
  });

  describe("Phase 2: Trust lines to both issuers and receive tokens", () => {
    it("should create trust lines from Alice to both issuers", async () => {
      console.log("\n==================== PHASE 2: TRUST LINES TO BOTH ISSUERS ====================");

      await createTrustLine(aliceWallet, issuerAWallet);
      await createTrustLine(aliceWallet, issuerBWallet);

      await createTrustLine(bobWallet, issuerAWallet);
      await createTrustLine(bobWallet, issuerBWallet);

      const aliceAccountLines = await client.request({
        command: "account_lines",
        account: aliceWallet.address,
      });

      const aliceUsdLines = aliceAccountLines.result.lines.filter(
        (l: AccountLinesTrustline) => l.currency === currencyToHex(CURRENCY),
      );
      expect(aliceUsdLines.length).toBe(2);

      console.log("✅ Alice has trust lines to both IssuerA and IssuerB for USD");
    }, 60000);

    it("should receive USD from both issuers", async () => {
      console.log("💰 Minting USD from both issuers...");

      await mintTokens(issuerAWallet, aliceWallet, MINT_AMOUNT);
      await mintTokens(issuerBWallet, aliceWallet, MINT_AMOUNT);

      const aliceBalanceA = await getTokenBalance(aliceWallet, issuerAWallet);
      const aliceBalanceB = await getTokenBalance(aliceWallet, issuerBWallet);

      expect(aliceBalanceA).toBe(MINT_AMOUNT);
      expect(aliceBalanceB).toBe(MINT_AMOUNT);

      console.log(`✅ Alice has ${aliceBalanceA} USD from IssuerA`);
      console.log(`✅ Alice has ${aliceBalanceB} USD from IssuerB`);
    }, 30000);
  });

  describe("Phase 3: Two issuers USD are distinct assets", () => {
    it("should transfer IssuerA USD without affecting IssuerB USD", async () => {
      console.log("\n==================== PHASE 3: DISTINCT ASSETS ====================");

      const aliceBalanceABefore = await getTokenBalance(aliceWallet, issuerAWallet);
      const aliceBalanceBBefore = await getTokenBalance(aliceWallet, issuerBWallet);
      const bobBalanceABefore = await getTokenBalance(bobWallet, issuerAWallet);

      await transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerAWallet);

      const aliceBalanceAAfter = await getTokenBalance(aliceWallet, issuerAWallet);
      const aliceBalanceBAfter = await getTokenBalance(aliceWallet, issuerBWallet);
      const bobBalanceAAfter = await getTokenBalance(bobWallet, issuerAWallet);

      expect(Number(aliceBalanceABefore) - Number(aliceBalanceAAfter)).toBe(Number(TRANSFER_AMOUNT));
      expect(Number(bobBalanceAAfter) - Number(bobBalanceABefore)).toBe(Number(TRANSFER_AMOUNT));
      // IssuerB USD unchanged
      expect(aliceBalanceBAfter).toBe(aliceBalanceBBefore);

      console.log("✅ IssuerA USD transferred without affecting IssuerB USD");
    }, 30000);

    it("should not be able to pay IssuerA USD using IssuerB USD balance", async () => {
      console.log("🙅 Testing cross-issuer payment rejection...");

      const aliceBalanceA = await getTokenBalance(aliceWallet, issuerAWallet);
      const overAmount = String(Number(aliceBalanceA) + 1000);

      await expectTxFail("tecPATH_PARTIAL", () => transferTokens(aliceWallet, bobWallet, overAmount, issuerAWallet));

      console.log("✅ Cross-issuer payment correctly rejected: tecPATH_PARTIAL");
    }, 30000);
  });

  describe("Phase 4: Rippling behavior with multi-issuer", () => {
    it("should demonstrate rippling through Alice between two issuers", async () => {
      console.log("\n==================== PHASE 4: RIPPLING BEHAVIOR ====================");

      await mintTokens(issuerBWallet, bobWallet, MINT_AMOUNT);

      const bobBalanceBBefore = await getTokenBalance(bobWallet, issuerBWallet);

      await transferTokens(bobWallet, aliceWallet, TRANSFER_AMOUNT, issuerBWallet);

      const bobBalanceBAfter = await getTokenBalance(bobWallet, issuerBWallet);
      const aliceBalanceB = await getTokenBalance(aliceWallet, issuerBWallet);

      expect(Number(bobBalanceBBefore) - Number(bobBalanceBAfter)).toBe(Number(TRANSFER_AMOUNT));

      console.log(`✅ Bob→Alice IssuerB USD transfer: ${TRANSFER_AMOUNT}`);
      console.log(`✅ Alice IssuerB balance: ${aliceBalanceB}`);

      const aliceLines = await client.request({
        command: "account_lines",
        account: aliceWallet.address,
      });

      const usdLines = aliceLines.result.lines.filter(
        (l: AccountLinesTrustline) => l.currency === currencyToHex(CURRENCY),
      );

      expect(usdLines.length).toBe(2);

      const issuerALine = usdLines.find((l) => l.account === issuerAWallet.address);
      const issuerBLine = usdLines.find((l) => l.account === issuerBWallet.address);

      expect(issuerALine).toBeDefined();
      expect(issuerBLine).toBeDefined();
      expect(issuerALine?.balance).not.toBe(issuerBLine?.balance);

      console.log(`✅ Alice IssuerA USD: ${issuerALine?.balance}`);
      console.log(`✅ Alice IssuerB USD: ${issuerBLine?.balance}`);
      console.log("✅ Multi-issuer same currency: balances tracked independently");
    }, 60000);
  });
});
