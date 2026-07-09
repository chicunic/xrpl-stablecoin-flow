import { CURRENCY, MINT_AMOUNT } from "@tests/utils/data.js";
import {
  connectClient,
  createTrustLine,
  disconnectClient,
  expectTxFail,
  getTokenBalance,
  setupWallets,
} from "@tests/utils/test.helper.js";
import { assignRegularKey, disableMasterKey } from "@/services/regular-key.service.js";
import { submitTransaction } from "@/services/transaction.service.js";
import type { AccountSet, Client, Payment, SetRegularKey, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";

/**
 * Account Security & Key Rotation (Regular Key)
 *
 * Demonstrates:
 * 1. Assigning a hot wallet as a Regular Key to an Issuer account.
 * 2. Disabling the Issuer's Master Key (Cold Storage isolation).
 * 3. Proving the Master Key can no longer issue tokens (tefMASTER_DISABLED).
 * 4. Successfully issuing tokens using the hot wallet (Regular Key) signing on behalf of the Issuer.
 */
describe("Trust Line Token Key Rotation & Security", () => {
  let client: Client;

  let masterIssuerWallet: Wallet;
  let hotWallet: Wallet;
  let userWallet: Wallet;

  beforeAll(async () => {
    client = await connectClient("Regular Key & Key Rotation Test");
    [masterIssuerWallet, hotWallet, userWallet] = await setupWallets(3);
  }, 90000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  it("should assign the hot wallet as the Regular Key", async () => {
    await assignRegularKey(masterIssuerWallet, hotWallet.address);
    console.log(`✅ Assigned ${hotWallet.address} as Regular Key for Issuer`);
  }, 30000);

  it("should disable the Master Key of the Issuer", async () => {
    await disableMasterKey(masterIssuerWallet);
    console.log("✅ Master Key disabled (Cold Wallet isolated)");
  }, 30000);

  it("should FAIL to mint tokens using the disabled Master Key", async () => {
    // 1. User sets up trust line first
    await createTrustLine(userWallet, masterIssuerWallet);

    // 2. Try to mint using the Master Key directly
    const tx: Payment = await client.autofill({
      TransactionType: "Payment",
      Account: masterIssuerWallet.address,
      Destination: userWallet.address,
      Amount: {
        currency: CURRENCY,
        issuer: masterIssuerWallet.address,
        value: MINT_AMOUNT,
      },
    });

    await expectTxFail("tefMASTER_DISABLED", () => submitTransaction(client, tx, masterIssuerWallet));
    console.log("✅ Master Key successfully blocked from signing (tefMASTER_DISABLED)");
  }, 30000);

  it("should SUCCESSFULLY mint tokens using the Regular Key (Hot Wallet)", async () => {
    // We construct the transaction where Account is the Issuer, but we SIGN it with the hot wallet.
    const tx: Payment = await client.autofill({
      TransactionType: "Payment",
      Account: masterIssuerWallet.address, // The action belongs to the Issuer
      Destination: userWallet.address,
      Amount: {
        currency: CURRENCY,
        issuer: masterIssuerWallet.address,
        value: MINT_AMOUNT,
      },
    });

    // Sign using the hot wallet (Regular Key)
    await submitTransaction(client, tx, hotWallet);

    const balance = await getTokenBalance(userWallet, masterIssuerWallet);
    expect(balance).toBe(MINT_AMOUNT);

    console.log(`✅ Successfully minted ${MINT_AMOUNT} ${CURRENCY} using the Hot Wallet as the Regular Key`);
  }, 30000);

  describe("Edge Cases", () => {
    let dummyWallet: Wallet;

    beforeAll(async () => {
      [dummyWallet] = await setupWallets(1);
    });

    it("should FAIL to disable Master Key if no Regular Key is assigned (Suicide Prevention)", async () => {
      await expectTxFail("tecNO_ALTERNATIVE_KEY", () => disableMasterKey(dummyWallet));
    });

    it("should FAIL to remove Regular Key if Master Key is disabled (Blackhole Prevention)", async () => {
      // For masterIssuerWallet, Master is currently disabled. We use the Hot Wallet to sign the removal tx.
      const tx: SetRegularKey = await client.autofill({
        TransactionType: "SetRegularKey",
        Account: masterIssuerWallet.address,
      });

      // XRPL prevents you from removing the regular key if you don't have a master key active
      await expectTxFail("tecNO_ALTERNATIVE_KEY", () => submitTransaction(client, tx, hotWallet));
    });

    it("should allow the Regular Key to re-enable the Master Key", async () => {
      // We must clear the asfDisableMaster flag, signed by the Regular Key (hotWallet)
      const tx: AccountSet = await client.autofill({
        TransactionType: "AccountSet",
        Account: masterIssuerWallet.address,
        ClearFlag: AccountSetAsfFlags.asfDisableMaster,
      });
      await submitTransaction(client, tx, hotWallet);
      console.log("✅ Master Key successfully re-enabled by the Regular Key");

      // Now the master key should be able to mint again
      const mintTx: Payment = await client.autofill({
        TransactionType: "Payment",
        Account: masterIssuerWallet.address,
        Destination: userWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: masterIssuerWallet.address,
          value: MINT_AMOUNT,
        },
      });
      await submitTransaction(client, mintTx, masterIssuerWallet);
      console.log("✅ Master Key successfully minted tokens after being re-enabled");
    }, 30000);
  });
});
