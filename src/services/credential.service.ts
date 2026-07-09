import type { CredentialAccept, CredentialCreate, CredentialDelete, DepositPreauth, Wallet } from "xrpl";
import { convertStringToHex } from "xrpl";

import { getXRPLClient } from "@/config/xrpl.config.js";
import { submitTransaction } from "./transaction.service.js";

/** Issues a credential (e.g. KYC attestation) to a subject account (XLS-70). */
export async function createCredential(issuer: Wallet, subject: string, credentialType: string): Promise<void> {
  const client = getXRPLClient();
  const tx: CredentialCreate = await client.autofill({
    TransactionType: "CredentialCreate",
    Account: issuer.address,
    Subject: subject,
    CredentialType: convertStringToHex(credentialType),
  });
  await submitTransaction(client, tx, issuer);
}

/** Subject accepts a credential issued to it, making the credential valid. */
export async function acceptCredential(subject: Wallet, issuer: string, credentialType: string): Promise<void> {
  const client = getXRPLClient();
  const tx: CredentialAccept = await client.autofill({
    TransactionType: "CredentialAccept",
    Account: subject.address,
    Issuer: issuer,
    CredentialType: convertStringToHex(credentialType),
  });
  await submitTransaction(client, tx, subject);
}

export async function deleteCredential(
  account: Wallet,
  issuer: string,
  subject: string,
  credentialType: string,
): Promise<void> {
  const client = getXRPLClient();
  const tx: CredentialDelete = await client.autofill({
    TransactionType: "CredentialDelete",
    Account: account.address,
    Issuer: issuer,
    Subject: subject,
    CredentialType: convertStringToHex(credentialType),
  });
  await submitTransaction(client, tx, account);
}

/** Preauthorizes deposits from any sender holding a matching credential (DepositPreauth + XLS-70). */
export async function preauthorizeCredential(receiver: Wallet, issuer: string, credentialType: string): Promise<void> {
  const client = getXRPLClient();
  const tx: DepositPreauth = await client.autofill({
    TransactionType: "DepositPreauth",
    Account: receiver.address,
    AuthorizeCredentials: [{ Credential: { Issuer: issuer, CredentialType: convertStringToHex(credentialType) } }],
  });
  await submitTransaction(client, tx, receiver);
}

/** Looks up the ledger object ID of a credential, for use in Payment.CredentialIDs. */
export async function getCredentialId(subject: string, issuer: string, credentialType: string): Promise<string> {
  const client = getXRPLClient();
  const response = await client.request({
    command: "ledger_entry",
    // rippled expects snake_case credential_type; the SDK type wrongly declares credentialType
    credential: { subject, issuer, credential_type: convertStringToHex(credentialType) } as unknown as {
      subject: string;
      issuer: string;
      credentialType: string;
    },
    ledger_index: "validated",
  });
  return response.result.index;
}
