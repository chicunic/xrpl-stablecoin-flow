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
  acceptCredential,
  createCredential,
  getCredentialId,
  preauthorizeCredential,
} from "@/services/credential.service.js";
import { setAccountFlag, transferTokens } from "@/services/trustline-token.service.js";
import { currencyToHex, submitTransaction } from "@/services/transaction.service.js";
import type { Client, Payment, Wallet } from "xrpl";
import { AccountSetAsfFlags } from "xrpl";

const KYC_CREDENTIAL = "KYC";

/**
 * Trust Line Token Credential-Based Deposit Auth (XLS-70)
 *
 * A stablecoin compliance flow: the receiver only accepts deposits from
 * senders holding a valid KYC credential issued by the token issuer.
 *   Phase 1: DepositAuth blocks unauthorized senders
 *   Phase 2: Receiver preauthorizes the issuer's KYC credential type
 *   Phase 3: Unaccepted credential does not grant access
 *   Phase 4: Accepted credential unlocks payments via CredentialIDs
 *   Phase 5: Payments without CredentialIDs are still blocked
 */
describe("Trust Line Token Credential Deposit Auth", () => {
  let client: Client;

  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let credentialId: string;

  const payBobWithCredentials = async (credentialIds: string[]): Promise<void> => {
    const tx: Payment = await client.autofill({
      TransactionType: "Payment",
      Account: aliceWallet.address,
      Destination: bobWallet.address,
      Amount: {
        currency: currencyToHex(CURRENCY),
        issuer: issuerWallet.address,
        value: TRANSFER_AMOUNT,
      },
      CredentialIDs: credentialIds,
    });
    await submitTransaction(client, tx, aliceWallet);
  };

  beforeAll(async () => {
    client = await connectClient("Trust Line Token Credential Deposit Auth Test");
    [issuerWallet, aliceWallet, bobWallet] = await setupWallets(3, "3");

    await setupIssuerWithFlags(issuerWallet);
    await createTrustLine(aliceWallet, issuerWallet);
    await createTrustLine(bobWallet, issuerWallet);
    await mintTokens(issuerWallet, aliceWallet, MINT_AMOUNT);
  }, 120000);

  afterAll(async () => {
    await disconnectClient(client);
  });

  describe("Phase 1: Enable DepositAuth", () => {
    it("should block token payments to the protected receiver", async () => {
      console.log("\n==================== PHASE 1: ENABLE DEPOSIT AUTH ====================");

      await setAccountFlag(bobWallet, AccountSetAsfFlags.asfDepositAuth);

      await expectTxFail("tecNO_PERMISSION", () =>
        transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet),
      );

      console.log("✅ Payment to DepositAuth-protected Bob failed: tecNO_PERMISSION");
    }, 30000);
  });

  describe("Phase 2: Preauthorize Credential Type", () => {
    it("should preauthorize senders holding the issuer's KYC credential", async () => {
      console.log("\n==================== PHASE 2: PREAUTHORIZE CREDENTIAL TYPE ====================");

      await preauthorizeCredential(bobWallet, issuerWallet.address, KYC_CREDENTIAL);

      console.log("✅ Bob preauthorized the issuer's KYC credential type");
    }, 30000);
  });

  describe("Phase 3: Unaccepted Credential", () => {
    it("should reject payments referencing a credential the subject has not accepted", async () => {
      console.log("\n==================== PHASE 3: UNACCEPTED CREDENTIAL ====================");

      await createCredential(issuerWallet, aliceWallet.address, KYC_CREDENTIAL);
      credentialId = await getCredentialId(aliceWallet.address, issuerWallet.address, KYC_CREDENTIAL);

      await expectTxFail("tecBAD_CREDENTIALS", () => payBobWithCredentials([credentialId]));

      console.log("✅ Payment with unaccepted credential failed: tecBAD_CREDENTIALS");
    }, 30000);
  });

  describe("Phase 4: Accepted Credential", () => {
    it("should allow payments once the credential is accepted", async () => {
      console.log("\n==================== PHASE 4: ACCEPTED CREDENTIAL ====================");

      await acceptCredential(aliceWallet, issuerWallet.address, KYC_CREDENTIAL);

      const bobBefore = BigInt(await getTokenBalance(bobWallet, issuerWallet));
      await payBobWithCredentials([credentialId]);
      expect(BigInt(await getTokenBalance(bobWallet, issuerWallet))).toBe(bobBefore + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ KYC-verified Alice paid Bob ${TRANSFER_AMOUNT} ${CURRENCY}`);
    }, 30000);
  });

  describe("Phase 5: Missing CredentialIDs", () => {
    it("should still block payments that do not reference the credential", async () => {
      console.log("\n==================== PHASE 5: MISSING CREDENTIAL IDS ====================");

      await expectTxFail("tecNO_PERMISSION", () =>
        transferTokens(aliceWallet, bobWallet, TRANSFER_AMOUNT, issuerWallet),
      );

      console.log("✅ Payment without CredentialIDs failed: tecNO_PERMISSION");
    }, 30000);
  });
});
