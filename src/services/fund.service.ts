/**
 * Fund Service
 *
 * Provides functionality to transfer XRP from an environment-configured wallet
 * to specified addresses with automatic wallet management.
 */
import * as bip39 from 'bip39';
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Client, dropsToXrp, Payment, TransactionMetadata, Wallet, XrplError, xrpToDrops } from 'xrpl';

import { getXRPLClient } from '../config/xrpl.config';

const XRP_MINIMUM_DROPS = BigInt(xrpToDrops(2)); // XRP minimum reserve requirement

interface actNotFoundError extends XrplError {
  data?: {
    error?: string;
  };
}

// Ensures FUND_MNEMONIC exists in .env file, generating it if necessary
function ensureFundMnemonic(): string {
  const envMnemonic = process.env.FUND_MNEMONIC;
  if (envMnemonic && bip39.validateMnemonic(envMnemonic)) {
    return envMnemonic;
  }

  // Generate new 12-word mnemonic
  const newMnemonic = bip39.generateMnemonic();
  const wallet = Wallet.fromMnemonic(newMnemonic);
  console.log('🔑 Generated new FUND_MNEMONIC for wallet:', wallet.address);

  // Handle .env file
  const envPath = join(process.cwd(), '.env');
  let envContent = '';

  if (existsSync(envPath)) {
    // File exists - remove FUND_MNEMONIC line
    envContent = readFileSync(envPath, 'utf8');
    envContent = envContent
      .replace(/^FUND_MNEMONIC=.*$/m, '')
      .replace(/\n\n+/g, '\n')
      .trim();
  } else {
    // File doesn't exist - create empty file
    envContent = '';
  }

  // Add new FUND_MNEMONIC line
  if (envContent && !envContent.endsWith('\n')) {
    envContent += '\n';
  }
  envContent += `FUND_MNEMONIC=${newMnemonic}\n`;
  writeFileSync(envPath, envContent);
  console.log('✅ Updated .env file with new FUND_MNEMONIC');

  process.env.FUND_MNEMONIC = newMnemonic;
  return newMnemonic;
}

// Transfer XRP from environment wallet to target address
export async function fundWallet(wallet: Wallet, { amount }: { amount: string }): Promise<void> {
  // Check if amount is valid
  const amountDrops = BigInt(xrpToDrops(amount));
  if (amountDrops <= 0n || amountDrops < BigInt(xrpToDrops('1')) || amountDrops > BigInt(xrpToDrops('100'))) {
    throw new Error('Amount must be between 1 and 100 XRP');
  }

  // Ensure FUND_MNEMONIC exists, generating if necessary
  const fundMnemonic = ensureFundMnemonic();

  // Check target address balance (only fund if below required amount)
  const client: Client = getXRPLClient();
  const targetAddress = wallet.address;

  let targetBalanceDrops = 0n;
  let targetExists = true;

  try {
    const targetAccountInfo = await client.request({
      command: 'account_info',
      account: targetAddress,
      ledger_index: 'validated',
    });
    targetBalanceDrops = BigInt(targetAccountInfo.result.account_data.Balance);
    console.log(`🔍 Target address (${targetAddress}) current balance: ${dropsToXrp(targetBalanceDrops)} XRP`);
  } catch (error: unknown) {
    if ((error as actNotFoundError)?.data?.error === 'actNotFound') {
      console.log(`🔍 Target address (${targetAddress}) does not exist yet - will be created by funding`);
      targetExists = false;
    } else {
      throw error;
    }
  }

  if (targetExists && targetBalanceDrops >= amountDrops) {
    console.log(
      `✅ Target address already has sufficient balance (${dropsToXrp(targetBalanceDrops)} XRP >= ${dropsToXrp(amountDrops)} XRP). No transfer needed.`
    );
    return;
  }

  // Check fund wallet balance
  const fundWallet = Wallet.fromMnemonic(fundMnemonic);
  let currentBalanceDrops = 0n;
  let fundWalletExists = true;

  try {
    const fundAccountInfo = await client.request({
      command: 'account_info',
      account: fundWallet.address,
      ledger_index: 'validated',
    });
    currentBalanceDrops = BigInt(fundAccountInfo.result.account_data.Balance);
    console.log(`💰 Fund wallet (${fundWallet.address}) balance: ${dropsToXrp(currentBalanceDrops)} XRP`);
  } catch (error: unknown) {
    if ((error as actNotFoundError)?.data?.error === 'actNotFound') {
      console.log(`💰 Fund wallet (${fundWallet.address}) does not exist yet - will be created by faucet funding`);
      fundWalletExists = false;
    } else {
      throw error;
    }
  }

  console.log(`📤 Requested transfer: ${dropsToXrp(amountDrops)} XRP to ${targetAddress}`);

  // Check if wallet has sufficient balance (required amount + 2 XRP reserve)
  if (!fundWalletExists || currentBalanceDrops < amountDrops + XRP_MINIMUM_DROPS) {
    console.log(
      `⚠️  Insufficient balance. Need: ${dropsToXrp(amountDrops + XRP_MINIMUM_DROPS)} XRP, Have: ${dropsToXrp(currentBalanceDrops)} XRP`
    );
    console.log('🔄 Auto-funding wallet with 100 XRP from faucet...');

    // Request 100 XRP from faucet
    await client.fundWallet(fundWallet, { amount: '100' });
    console.log('✅ Successfully funded wallet with 100 XRP');

    // Verify new balance
    const updatedAccountInfo = await client.request({
      command: 'account_info',
      account: fundWallet.address,
      ledger_index: 'validated',
    });
    const updatedBalanceDrops = BigInt(updatedAccountInfo.result.account_data.Balance);
    console.log(`💰 Updated fund wallet balance: ${dropsToXrp(updatedBalanceDrops)} XRP`);

    // Check again if balance is still insufficient
    if (updatedBalanceDrops < amountDrops + XRP_MINIMUM_DROPS) {
      throw new Error(
        `Still insufficient balance after auto-funding. Need: ${dropsToXrp(amountDrops + XRP_MINIMUM_DROPS)} XRP, Have: ${dropsToXrp(updatedBalanceDrops)} XRP`
      );
    }
  }

  // Payment to target address
  const paymentTx: Payment = await client.autofill({
    TransactionType: 'Payment',
    Account: fundWallet.address,
    Destination: targetAddress,
    Amount: xrpToDrops(amount),
  });
  const signed = fundWallet.sign(paymentTx);
  const result = await client.submitAndWait(signed.tx_blob);
  const transactionResult = (result.result.meta as TransactionMetadata)?.TransactionResult;
  if (transactionResult !== 'tesSUCCESS') {
    throw new Error(`Transfer failed with result: ${transactionResult}`);
  }

  const txHash = result.result.hash;
  console.log(`✅ Successfully transferred ${amount} XRP to ${targetAddress}`);
  console.log(`📝 Fund to ${targetAddress} transaction hash: ${txHash}`);
  return;
}
