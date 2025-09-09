/**
 * DisallowXRP Flag Test
 *
 * Test Flow:
 * Phase 1: Setup - Create Test Accounts
 *   - Create Alice and Bob accounts
 *   - Fund all accounts with XRP
 *
 * Phase 2: Enable DisallowXRP on Bob
 *   - Bob enables DisallowXRP flag
 *   - Alice sends XRP to Bob (succeeds - DisallowXRP is advisory only, not enforced by protocol)
 *   - Bob can still send XRP to Alice (succeeds - DisallowXRP only signals preference against incoming XRP)
 *
 * Phase 3: Disable DisallowXRP
 *   - Bob disables DisallowXRP flag
 *   - All transfers continue to work normally
 *
 * Note: DisallowXRP is an advisory flag only - it signals to client applications
 * that the account prefers not to receive XRP, but the XRPL protocol does not
 * enforce this restriction to prevent accounts from becoming unusable.
 * For enforced protection, use DepositAuth instead.
 */
import {
  AccountSet,
  AccountSetAsfFlags,
  Client,
  dropsToXrp,
  Payment,
  TransactionMetadata,
  Wallet,
  xrpToDrops,
} from 'xrpl';
import { AccountRootFlags } from 'xrpl/dist/npm/models/ledger';

import { getXRPLClient, initializeXRPLClient } from '../../../src/config/xrpl.config';
import { fundWallet } from '../../../src/services/fund.service';
import { XRP_TRANSFER_AMOUNT } from '../../utils/data';

describe('DisallowXRP Flag Test', () => {
  let client: Client;

  // Wallets
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting DisallowXRP Flag Test');

    await initializeXRPLClient();
    client = getXRPLClient();
  }, 30000);

  afterAll(async () => {
    if (client.isConnected()) {
      await client.disconnect();
      console.log('✅ Disconnected from XRPL');
    }
  });

  describe('Phase 1: Setup - Create Test Accounts', () => {
    it('should create and fund all wallets', async () => {
      console.log('\n==================== PHASE 1: SETUP - CREATE TEST ACCOUNTS ====================');
      console.log('👥 Creating 2 test wallets...');

      // Generate wallets
      aliceWallet = Wallet.generate();
      bobWallet = Wallet.generate();

      // Fund all wallets
      await fundWallet(aliceWallet, { amount: '2' });
      await fundWallet(bobWallet, { amount: '2' });

      // Verify wallet balances after funding
      const [aliceInfo, bobInfo] = await Promise.all([
        client.request({
          command: 'account_info',
          account: aliceWallet.address,
          ledger_index: 'validated',
        }),
        client.request({
          command: 'account_info',
          account: bobWallet.address,
          ledger_index: 'validated',
        }),
      ]);
      // Check that all wallets have sufficient XRP balance
      expect(dropsToXrp(aliceInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(bobInfo.result.account_data.Balance)).toEqual(2);

      console.log(`✅ Alice: ${aliceWallet.address}`);
      console.log(`✅ Bob: ${bobWallet.address}`);
    }, 40000);
  });

  describe('Phase 2: Enable DisallowXRP on Bob', () => {
    it('should enable DisallowXRP flag on Bob', async () => {
      console.log('\n==================== PHASE 2: ENABLE DISALLOWXRP ON BOB ====================');
      console.log('🚫 Enabling DisallowXRP flag on Bob...');

      const disallowXRPTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: bobWallet.address,
        SetFlag: AccountSetAsfFlags.asfDisallowXRP,
      });

      const signed = bobWallet.sign(disallowXRPTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob AccountSet (DisallowXRP enabled) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DisallowXRP flag IS set
      const accountInfo = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDisallowXRP)).toEqual(BigInt(AccountRootFlags.lsfDisallowXRP));

      console.log('✅ DisallowXRP flag enabled on Bob successfully');
    }, 20000);

    it('should succeed Alice -> Bob XRP transfer with DisallowXRP enabled (advisory only)', async () => {
      console.log('ℹ️ Testing Alice -> Bob XRP transfer with DisallowXRP enabled (advisory flag)...');

      // Get Bob's current XRP balance
      const bobInfoBefore = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobBalanceBeforeDrops = BigInt(bobInfoBefore.result.account_data.Balance);

      // Alice sends XRP to Bob (succeeds despite DisallowXRP advisory flag)
      const paymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: xrpToDrops(XRP_TRANSFER_AMOUNT),
      });

      const signed = aliceWallet.sign(paymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob XRP Payment (SUCCEEDS despite DisallowXRP) transaction hash: ${result.result.hash}`);
      // DisallowXRP is NOT enforced by XRPL protocol - it's advisory only
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob received XRP (DisallowXRP doesn't prevent this)
      const bobInfoAfter = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobBalanceAfterDrops = BigInt(bobInfoAfter.result.account_data.Balance);
      expect(bobBalanceAfterDrops).toEqual(bobBalanceBeforeDrops + BigInt(xrpToDrops(XRP_TRANSFER_AMOUNT)));

      console.log(
        `ℹ️ DisallowXRP flag is advisory only - XRPL protocol allows XRP transfers to prevent accounts becoming unusable`
      );
      console.log(`✅ XRP transfer succeeded: Alice -> Bob (${XRP_TRANSFER_AMOUNT} XRP)`);
      console.log(
        `✅ Bob balance: ${dropsToXrp(bobBalanceBeforeDrops)} XRP -> ${dropsToXrp(bobBalanceAfterDrops)} XRP`
      );
    }, 30000);

    it('should allow Bob to send XRP to others with DisallowXRP enabled', async () => {
      console.log('💸 Testing Bob -> Alice XRP transfer with Bob having DisallowXRP...');

      // Get Alice's initial XRP balance
      const aliceInfoBefore = await client.request({
        command: 'account_info',
        account: aliceWallet.address,
        ledger_index: 'validated',
      });
      const aliceBalanceBeforeDrops = BigInt(aliceInfoBefore.result.account_data.Balance);

      // Bob sends XRP to Alice (should succeed, DisallowXRP only affects incoming)
      const bobPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: bobWallet.address,
        Destination: aliceWallet.address,
        Amount: xrpToDrops(XRP_TRANSFER_AMOUNT),
      });

      const signed = bobWallet.sign(bobPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob -> Alice XRP Payment (with DisallowXRP enabled) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice received XRP
      const aliceInfoAfter = await client.request({
        command: 'account_info',
        account: aliceWallet.address,
        ledger_index: 'validated',
      });
      const aliceBalanceAfterDrops = BigInt(aliceInfoAfter.result.account_data.Balance);
      expect(aliceBalanceAfterDrops).toEqual(aliceBalanceBeforeDrops + BigInt(xrpToDrops(XRP_TRANSFER_AMOUNT)));

      console.log('✅ Bob can still send XRP to others with DisallowXRP enabled');
      console.log(
        `✅ Alice balance: ${dropsToXrp(aliceBalanceBeforeDrops)} XRP -> ${dropsToXrp(aliceBalanceAfterDrops)} XRP`
      );
    }, 30000);
  });

  describe('Phase 3: Disable DisallowXRP', () => {
    it('should disable DisallowXRP flag on Bob', async () => {
      console.log('\n==================== PHASE 3: DISABLE DISALLOWXRP ====================');
      console.log('🔓 Disabling DisallowXRP flag on Bob...');

      const clearDisallowXRPTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: bobWallet.address,
        ClearFlag: AccountSetAsfFlags.asfDisallowXRP,
      });

      const signed = bobWallet.sign(clearDisallowXRPTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob AccountSet (DisallowXRP disabled) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DisallowXRP flag is NOT set
      const accountInfo = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDisallowXRP)).toEqual(0n);

      console.log('✅ DisallowXRP flag disabled on Bob successfully');
    }, 20000);

    it('should succeed Alice -> Bob XRP transfer after disabling DisallowXRP', async () => {
      console.log('✅ Testing Alice -> Bob XRP transfer after disabling DisallowXRP...');

      // Get Bob's initial XRP balance
      const bobInfoBefore = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobBalanceBefore = BigInt(bobInfoBefore.result.account_data.Balance);

      // Alice sends XRP to Bob (should succeed after disabling DisallowXRP)
      const paymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: xrpToDrops(XRP_TRANSFER_AMOUNT),
      });

      const signed = aliceWallet.sign(paymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob XRP Payment (after disabling DisallowXRP) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob received XRP
      const bobInfoAfter = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobBalanceAfter = BigInt(bobInfoAfter.result.account_data.Balance);
      expect(bobBalanceAfter).toEqual(bobBalanceBefore + BigInt(xrpToDrops(XRP_TRANSFER_AMOUNT)));

      console.log(`✅ XRP transfer successful after disabling DisallowXRP: Alice -> Bob (${XRP_TRANSFER_AMOUNT} XRP)`);
      console.log(`✅ Bob balance: ${dropsToXrp(bobBalanceBefore)} XRP -> ${dropsToXrp(bobBalanceAfter)} XRP`);
    }, 30000);
  });
});
