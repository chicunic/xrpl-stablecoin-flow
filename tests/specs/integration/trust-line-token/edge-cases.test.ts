import { CURRENCY, MEMO_DATA, MEMO_TYPE, MINT_AMOUNT, TRANSFER_AMOUNT, TRUST_AMOUNT } from "@tests/utils/data.js";
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
import { currencyToHex, submitTransaction } from "@/services/transaction.service.js";
import { transferTokens } from "@/services/trustline-token.service.js";
import type { Client, TransactionMetadata, Wallet } from "xrpl";
import { convertStringToHex } from "xrpl";

describe("Trust Line Token Edge Cases", () => {
  let client: Client;
  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("Edge Cases Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Setup", () => {
    it("should create wallets, trust lines, and mint tokens", async () => {
      console.log("\n==================== PHASE 1: SETUP ====================");

      await setupIssuerWithFlags(issuerWallet);

      await createTrustLine(aliceWallet, issuerWallet);
      await createTrustLine(bobWallet, issuerWallet);

      await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);
      await mintTokens(issuerWallet, bobWallet, MINT_AMOUNT);
    }, 120000);
  });

  describe("Phase 2: Self-payment", () => {
    it("should reject self-payment with temREDUNDANT", async () => {
      console.log("\n==================== PHASE 2: SELF-PAYMENT ====================");

      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);

      // tem* errors are preflight failures that throw before reaching the ledger
      // Must construct inline since transferTokens cannot send to self
      const selfPayTx = await client.autofill({
        TransactionType: "Payment" as const,
        Account: aliceWallet.address,
        Destination: aliceWallet.address,
        Amount: {
          currency: currencyToHex(CURRENCY),
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(selfPayTx);
      await expect(client.submitAndWait(signed.tx_blob)).rejects.toThrow("temREDUNDANT");

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      expect(aliceBalanceAfter).toBe(aliceBalanceBefore);

      console.log("✅ Self-payment correctly rejected: temREDUNDANT");
    }, 30000);
  });

  describe("Phase 3: Zero amount", () => {
    it("should reject zero-amount payment with temBAD_AMOUNT", async () => {
      console.log("\n==================== PHASE 3: ZERO AMOUNT ====================");

      const aliceBalanceBefore = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      // tem* errors are preflight failures that throw before reaching the ledger
      // Must construct inline since transferTokens expects a valid amount
      const zeroPayTx = await client.autofill({
        TransactionType: "Payment" as const,
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: currencyToHex(CURRENCY),
          issuer: issuerWallet.address,
          value: "0",
        },
      });

      const signed = aliceWallet.sign(zeroPayTx);
      await expect(client.submitAndWait(signed.tx_blob)).rejects.toThrow("temBAD_AMOUNT");

      const aliceBalanceAfter = await getTokenBalance(aliceWallet, issuerWallet);
      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(aliceBalanceAfter).toBe(aliceBalanceBefore);
      expect(bobBalanceAfter).toBe(bobBalanceBefore);

      console.log("✅ Zero amount payment correctly rejected: temBAD_AMOUNT");
    }, 30000);
  });

  describe("Phase 4: Over-limit payment", () => {
    it("should fail payment that would exceed trust line limit", async () => {
      console.log("\n==================== PHASE 4: OVER-LIMIT PAYMENT ====================");

      const overLimitAmount = String(Number(TRUST_AMOUNT) + 1);
      const bobBalanceBefore = await getTokenBalance(bobWallet, issuerWallet);

      // Issuer tries to mint over-limit to Bob
      await expectTxFail("tecPATH_PARTIAL", () =>
        transferTokens(issuerWallet, bobWallet, overLimitAmount, issuerWallet),
      );

      const bobBalanceAfter = await getTokenBalance(bobWallet, issuerWallet);
      expect(bobBalanceAfter).toBe(bobBalanceBefore);

      console.log("✅ Over-limit payment correctly rejected: tecPATH_PARTIAL");
    }, 30000);
  });

  describe("Phase 5: Memo", () => {
    it("should submit and read a transaction with MemoType + MemoData", async () => {
      console.log("\n==================== PHASE 5: MEMO ====================");

      // Memo transactions require custom construction (no helper exists)
      const payTx = await client.autofill({
        TransactionType: "Payment" as const,
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: currencyToHex(CURRENCY),
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
        Memos: [
          {
            Memo: {
              MemoType: convertStringToHex(MEMO_TYPE),
              MemoData: convertStringToHex(MEMO_DATA),
            },
          },
        ],
      });

      const signed = aliceWallet.sign(payTx);
      const result = await client.submitAndWait(signed.tx_blob);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe("tesSUCCESS");

      const txResponse = await client.request({
        command: "tx",
        transaction: result.result.hash,
      });

      const txJson = txResponse.result.tx_json as Record<string, any>;
      const memos = txJson.Memos as { Memo: { MemoType: string; MemoData: string } }[];
      expect(memos).toBeDefined();
      expect(memos.length).toBe(1);
      expect(memos[0]?.Memo.MemoType).toBe(convertStringToHex(MEMO_TYPE));
      expect(memos[0]?.Memo.MemoData).toBe(convertStringToHex(MEMO_DATA));

      console.log(`✅ Memo attached and verified: MemoType=${MEMO_TYPE}, MemoData=${MEMO_DATA}`);
    }, 30000);
  });

  describe("Phase 6: Trust line deletion", () => {
    it("should zero out trust line when limit set to 0 and balance is 0", async () => {
      console.log("\n==================== PHASE 6: TRUST LINE DELETION ====================");

      const [carolWallet] = await setupWallets(1);

      await createTrustLine(carolWallet, issuerWallet);

      const smallAmount = "100";
      await mintTokens(issuerWallet, carolWallet, smallAmount);

      // Redeem tokens back to issuer
      await transferTokens(carolWallet, issuerWallet, smallAmount, issuerWallet);

      const balanceAfterRedeem = await getTokenBalance(carolWallet, issuerWallet);
      expect(balanceAfterRedeem).toBe("0");

      // Delete trust line by setting limit to 0
      const deleteTrustTx = await client.autofill({
        TransactionType: "TrustSet" as const,
        Account: carolWallet.address,
        LimitAmount: {
          currency: currencyToHex(CURRENCY),
          issuer: issuerWallet.address,
          value: "0",
        },
      });
      await submitTransaction(client, deleteTrustTx, carolWallet);

      // Trust line may persist due to ripple state flags (expected XRPL behavior)
      const remainingLine = await findTrustLine(carolWallet, issuerWallet);

      if (remainingLine) {
        // Trust line persists but is zeroed out
        expect(remainingLine.balance).toBe("0");
        expect(remainingLine.limit).toBe("0");
        console.log("✅ Trust line zeroed out (limit=0, balance=0, persists due to ripple state flags)");
      } else {
        // Trust line was fully deleted
        console.log("✅ Trust line fully deleted (limit=0, balance=0)");
      }
    }, 120000);
  });
});
