import { type AccountSet, AccountSetAsfFlags, type SetRegularKey, type Wallet } from "xrpl";
import { getXRPLClient } from "@/config/xrpl.config.js";
import { submitTransaction } from "./transaction.service.js";

/**
 * Assigns a Regular Key to an XRPL account.
 * The regular key can be used to sign future transactions on behalf of the account.
 */
export async function assignRegularKey(wallet: Wallet, regularKeyAddress: string): Promise<void> {
  const client = getXRPLClient();
  const tx: SetRegularKey = await client.autofill({
    TransactionType: "SetRegularKey",
    Account: wallet.address,
    RegularKey: regularKeyAddress,
  });
  await submitTransaction(client, tx, wallet);
}

/**
 * Disables the Master Key of an XRPL account.
 * WARNING: A regular key MUST be assigned before doing this, otherwise
 * the account will be permanently locked out!
 */
export async function disableMasterKey(wallet: Wallet): Promise<void> {
  const client = getXRPLClient();
  const tx: AccountSet = await client.autofill({
    TransactionType: "AccountSet",
    Account: wallet.address,
    SetFlag: AccountSetAsfFlags.asfDisableMaster,
  });
  await submitTransaction(client, tx, wallet);
}
