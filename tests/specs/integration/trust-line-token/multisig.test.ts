import { CURRENCY, MINT_AMOUNT } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  disconnectClient,
  expectTxFail,
  getTokenBalance,
  setupIssuerWithFlags,
  setupWallets,
} from "@tests/utils/test.helper.js";
import { currencyToHex, submitMultisigned, submitTransaction } from "@/services/transaction.service.js";
import { setSignerList } from "@/services/signer-list.service.js";
import { assignRegularKey, disableMasterKey } from "@/services/regular-key.service.js";
import type { AccountSet, Client, Payment, SignerListSet, TrustSet, Wallet } from "xrpl";
import { TrustSetFlags, Wallet as XrplWallet } from "xrpl";

/**
 * Trust Line Token Multisig Issuer Governance
 *
 * Institutional issuers control the issuing account with a signer list
 * instead of a single key:
 *   Phase 1: Install a 2-of-3 signer list
 *   Phase 2: Mint via multisigned Payment
 *   Phase 3: Insufficient quorum is rejected
 *   Phase 4: Disable master key — master fails, multisig still works (freeze)
 *   Phase 5: Removing the last signer list is rejected (no alternative key)
 *   Phase 6: Rotate the signer list via multisig (full replacement)
 *   Phase 7: An on-ledger signer participates with its regular key
 *   Phase 8: A multisig-only account as signer is dead weight (no nesting)
 */
describe("Trust Line Token Multisig Issuer Governance", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  // On-ledger signer accounts: Dave rotates to a regular key, Eve becomes multisig-only
  let daveWallet: Wallet;
  let eveWallet: Wallet;
  // Signer keys never need on-ledger accounts; only their signatures matter
  const signer1 = XrplWallet.generate();
  const signer2 = XrplWallet.generate();
  const signer3 = XrplWallet.generate();
  const daveRegularKey = XrplWallet.generate();
  const eveSigner = XrplWallet.generate();

  beforeAll(async () => {
    client = await connectClient("Trust Line Token Multisig Test");
    [issuerWallet, aliceWallet, daveWallet, eveWallet] = await setupWallets(4, "3");

    await setupIssuerWithFlags(issuerWallet);
    await createTrustLine(aliceWallet, issuerWallet);
  }, 120000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Install Signer List", () => {
    it("should install a 2-of-3 signer list on the issuer", async () => {
      console.log("\n==================== PHASE 1: INSTALL SIGNER LIST ====================");

      await setSignerList(
        issuerWallet,
        [
          { address: signer1.address, weight: 1 },
          { address: signer2.address, weight: 1 },
          { address: signer3.address, weight: 1 },
        ],
        2,
      );

      console.log("✅ 2-of-3 signer list installed");
    }, 30000);
  });

  describe("Phase 2: Multisigned Mint", () => {
    it("should mint tokens with two signatures", async () => {
      console.log("\n==================== PHASE 2: MULTISIGNED MINT ====================");

      const mintTx: Payment = await client.autofill(
        {
          TransactionType: "Payment",
          Account: issuerWallet.address,
          Destination: aliceWallet.address,
          Amount: {
            currency: currencyToHex(CURRENCY),
            issuer: issuerWallet.address,
            value: MINT_AMOUNT,
          },
        },
        2,
      );
      await submitMultisigned(client, mintTx, [signer1, signer2]);

      expect(await getTokenBalance(aliceWallet, issuerWallet)).toBe(MINT_AMOUNT);

      console.log(`✅ Minted ${MINT_AMOUNT} ${CURRENCY} to Alice via multisig`);
    }, 30000);
  });

  describe("Phase 3: Insufficient Quorum", () => {
    it("should reject a transaction signed by only one signer", async () => {
      console.log("\n==================== PHASE 3: INSUFFICIENT QUORUM ====================");

      const mintTx: Payment = await client.autofill(
        {
          TransactionType: "Payment",
          Account: issuerWallet.address,
          Destination: aliceWallet.address,
          Amount: {
            currency: currencyToHex(CURRENCY),
            issuer: issuerWallet.address,
            value: "1",
          },
        },
        1,
      );
      await expectTxFail("tefBAD_QUORUM", () => submitMultisigned(client, mintTx, [signer1]));

      console.log("✅ Single signature below quorum failed: tefBAD_QUORUM");
    }, 30000);
  });

  describe("Phase 4: Disable Master Key", () => {
    it("should disable the master key while the signer list exists", async () => {
      console.log("\n==================== PHASE 4: DISABLE MASTER KEY ====================");

      await disableMasterKey(issuerWallet);

      console.log("✅ Master key disabled");
    }, 30000);

    it("should reject master-key-signed transactions afterwards", async () => {
      const tx: AccountSet = await client.autofill({
        TransactionType: "AccountSet",
        Account: issuerWallet.address,
      });
      await expectTxFail("tefMASTER_DISABLED", () => submitTransaction(client, tx, issuerWallet));

      console.log("✅ Master-signed transaction failed: tefMASTER_DISABLED");
    }, 30000);

    it("should still freeze a trust line via multisig", async () => {
      const freezeTx: TrustSet = await client.autofill(
        {
          TransactionType: "TrustSet",
          Account: issuerWallet.address,
          LimitAmount: {
            currency: currencyToHex(CURRENCY),
            issuer: aliceWallet.address,
            value: "0",
          },
          Flags: TrustSetFlags.tfSetFreeze,
        },
        2,
      );
      await submitMultisigned(client, freezeTx, [signer2, signer3]);

      console.log("✅ Trust line frozen via multisig with master disabled");
    }, 30000);
  });

  describe("Phase 5: Signer List Removal Guard", () => {
    it("should refuse to remove the signer list when it is the only key", async () => {
      console.log("\n==================== PHASE 5: SIGNER LIST REMOVAL GUARD ====================");

      const removeTx: SignerListSet = await client.autofill(
        {
          TransactionType: "SignerListSet",
          Account: issuerWallet.address,
          SignerQuorum: 0,
        },
        2,
      );
      await expectTxFail("tecNO_ALTERNATIVE_KEY", () => submitMultisigned(client, removeTx, [signer1, signer2]));

      console.log("✅ Removing the last signer list failed: tecNO_ALTERNATIVE_KEY");
    }, 30000);
  });

  describe("Phase 6: Signer Rotation", () => {
    it("should replace a signer via multisigned SignerListSet", async () => {
      console.log("\n==================== PHASE 6: SIGNER ROTATION ====================");

      // Full replacement authorized by a quorum of the OLD list: signer3 out, Dave in
      const rotateTx: SignerListSet = await client.autofill(
        {
          TransactionType: "SignerListSet",
          Account: issuerWallet.address,
          SignerQuorum: 2,
          SignerEntries: [
            { SignerEntry: { Account: signer1.address, SignerWeight: 1 } },
            { SignerEntry: { Account: signer2.address, SignerWeight: 1 } },
            { SignerEntry: { Account: daveWallet.address, SignerWeight: 1 } },
          ],
        },
        2,
      );
      await submitMultisigned(client, rotateTx, [signer1, signer2]);

      console.log("✅ Signer list rotated: signer3 replaced by Dave");
    }, 30000);

    it("should reject contributions from the removed signer", async () => {
      const unfreezeTx: TrustSet = await client.autofill(
        {
          TransactionType: "TrustSet",
          Account: issuerWallet.address,
          LimitAmount: {
            currency: currencyToHex(CURRENCY),
            issuer: aliceWallet.address,
            value: "0",
          },
          Flags: TrustSetFlags.tfClearFreeze,
        },
        2,
      );
      await expectTxFail("tefBAD_SIGNATURE", () => submitMultisigned(client, unfreezeTx, [signer1, signer3]));

      console.log("✅ Removed signer3 rejected: tefBAD_SIGNATURE");
    }, 30000);

    it("should accept the new on-ledger signer", async () => {
      const unfreezeTx: TrustSet = await client.autofill(
        {
          TransactionType: "TrustSet",
          Account: issuerWallet.address,
          LimitAmount: {
            currency: currencyToHex(CURRENCY),
            issuer: aliceWallet.address,
            value: "0",
          },
          Flags: TrustSetFlags.tfClearFreeze,
        },
        2,
      );
      await submitMultisigned(client, unfreezeTx, [signer1, daveWallet]);

      console.log("✅ Alice's trust line unfrozen via multisig with new signer Dave");
    }, 30000);
  });

  describe("Phase 7: Signer With Regular Key", () => {
    it("should let a signer participate with its regular key after disabling its master", async () => {
      console.log("\n==================== PHASE 7: SIGNER WITH REGULAR KEY ====================");

      await assignRegularKey(daveWallet, daveRegularKey.address);
      await disableMasterKey(daveWallet);

      const balanceBefore = BigInt(await getTokenBalance(aliceWallet, issuerWallet));
      const mintTx: Payment = await client.autofill(
        {
          TransactionType: "Payment",
          Account: issuerWallet.address,
          Destination: aliceWallet.address,
          Amount: {
            currency: currencyToHex(CURRENCY),
            issuer: issuerWallet.address,
            value: "100",
          },
        },
        2,
      );
      await submitMultisigned(client, mintTx, [signer2, { wallet: daveRegularKey, account: daveWallet.address }]);

      expect(BigInt(await getTokenBalance(aliceWallet, issuerWallet))).toBe(balanceBefore + 100n);

      console.log("✅ Dave signed the multisig mint with his regular key");
    }, 30000);

    it("should reject the signer's disabled master key", async () => {
      const mintTx: Payment = await client.autofill(
        {
          TransactionType: "Payment",
          Account: issuerWallet.address,
          Destination: aliceWallet.address,
          Amount: {
            currency: currencyToHex(CURRENCY),
            issuer: issuerWallet.address,
            value: "1",
          },
        },
        2,
      );
      await expectTxFail("tefMASTER_DISABLED", () => submitMultisigned(client, mintTx, [signer2, daveWallet]));

      console.log("✅ Dave's disabled master key rejected: tefMASTER_DISABLED");
    }, 30000);
  });

  describe("Phase 8: Multisig Account As Signer", () => {
    it("should register a multisig-only account as a signer (dead weight)", async () => {
      console.log("\n==================== PHASE 8: MULTISIG ACCOUNT AS SIGNER ====================");

      // Eve becomes multisig-only: own signer list, master disabled, no regular key
      await setSignerList(eveWallet, [{ address: eveSigner.address, weight: 1 }], 1);
      await disableMasterKey(eveWallet);

      // SignerListSet does not validate signer capability — registration succeeds
      const rotateTx: SignerListSet = await client.autofill(
        {
          TransactionType: "SignerListSet",
          Account: issuerWallet.address,
          SignerQuorum: 2,
          SignerEntries: [
            { SignerEntry: { Account: signer1.address, SignerWeight: 1 } },
            { SignerEntry: { Account: signer2.address, SignerWeight: 1 } },
            { SignerEntry: { Account: eveWallet.address, SignerWeight: 1 } },
          ],
        },
        2,
      );
      await submitMultisigned(client, rotateTx, [signer1, signer2]);

      console.log("✅ Multisig-only Eve registered as signer (dead weight)");
    }, 30000);

    it("should reject the dead-weight signer's disabled master key", async () => {
      const mintTx: Payment = await client.autofill(
        {
          TransactionType: "Payment",
          Account: issuerWallet.address,
          Destination: aliceWallet.address,
          Amount: {
            currency: currencyToHex(CURRENCY),
            issuer: issuerWallet.address,
            value: "1",
          },
        },
        2,
      );
      await expectTxFail("tefMASTER_DISABLED", () => submitMultisigned(client, mintTx, [signer2, eveWallet]));

      console.log("✅ Eve's disabled master key rejected: tefMASTER_DISABLED");
    }, 30000);

    it("should reject nested multisig — Eve's own signer cannot sign for Eve", async () => {
      const mintTx: Payment = await client.autofill(
        {
          TransactionType: "Payment",
          Account: issuerWallet.address,
          Destination: aliceWallet.address,
          Amount: {
            currency: currencyToHex(CURRENCY),
            issuer: issuerWallet.address,
            value: "1",
          },
        },
        2,
      );
      await expectTxFail("tefBAD_SIGNATURE", () =>
        submitMultisigned(client, mintTx, [signer2, { wallet: eveSigner, account: eveWallet.address }]),
      );

      console.log("✅ Nested multisig rejected: tefBAD_SIGNATURE");
    }, 30000);
  });
});
