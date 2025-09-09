/**
 * DepositAuth Check Test
 *
 * Test Flow:
 * Phase 1: Setup - Create Issuer and User Accounts
 *   - Create issuer, Alice, and Bob accounts
 *   - Fund all accounts with XRP
 *   - Configure issuer account without DefaultRipple flag
 *
 * Phase 2: Trust Lines and Token Setup
 *   - Alice and Bob create trust lines to issuer for USD tokens
 *   - Issuer clears NoRipple flag for Bob's trust line to allow rippling
 *   - Issuer mints USD tokens to Alice
 *
 * Phase 3: DepositAuth and Check Payment
 *   - Bob enables DepositAuth flag
 *   - Alice creates check payable to Bob for USD tokens
 *   - Bob cashes the check successfully (DepositAuth allows check cashing)
 *   - Verify token balances after check cash
 *
 * Note: DepositAuth prevents direct payments but allows the account holder
 * to receive payments through checks, providing control over when payments are accepted.
 */
import {
  AccountLinesTrustline,
  AccountSet,
  AccountSetAsfFlags,
  CheckCash,
  CheckCreate,
  Client,
  convertStringToHex,
  CreatedNode,
  dropsToXrp,
  Payment,
  TransactionMetadata,
  TrustSet,
  TrustSetFlags,
  Wallet,
} from 'xrpl';
import { AccountRootFlags } from 'xrpl/dist/npm/models/ledger';

import { getXRPLClient, initializeXRPLClient } from '../../../src/config/xrpl.config';
import { fundWallet } from '../../../src/services/fund.service';
import { CURRENCY, DOMAIN, MINT_AMOUNT, TRANSFER_AMOUNT, TRUST_AMOUNT } from '../../utils/data';

describe('DepositAuth Check Test', () => {
  let client: Client;

  // Wallets
  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting DepositAuth Check Test');

    await initializeXRPLClient();
    client = getXRPLClient();
  }, 30000);

  afterAll(async () => {
    if (client.isConnected()) {
      await client.disconnect();
      console.log('✅ Disconnected from XRPL');
    }
  });

  describe('Phase 1: Setup - Create Issuer and User Accounts', () => {
    it('should create and fund all wallets', async () => {
      console.log('\n==================== PHASE 1: SETUP - CREATE ISSUER AND USER ACCOUNTS ====================');
      console.log('👥 Creating issuer, Alice, and Bob wallets...');

      // Generate wallets
      issuerWallet = Wallet.generate();
      aliceWallet = Wallet.generate();
      bobWallet = Wallet.generate();

      // Fund all wallets
      await fundWallet(issuerWallet, { amount: '2' });
      await fundWallet(aliceWallet, { amount: '2' });
      await fundWallet(bobWallet, { amount: '2' });

      // Verify wallet balances after funding
      const [issuerInfo, aliceInfo, bobInfo] = await Promise.all([
        client.request({
          command: 'account_info',
          account: issuerWallet.address,
          ledger_index: 'validated',
        }),
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
      expect(dropsToXrp(issuerInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(aliceInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(bobInfo.result.account_data.Balance)).toEqual(2);

      console.log(`✅ Issuer: ${issuerWallet.address}`);
      console.log(`✅ Alice: ${aliceWallet.address}`);
      console.log(`✅ Bob: ${bobWallet.address}`);
    }, 60000);

    it('should configure issuer account without DefaultRipple', async () => {
      console.log('🏦 Configuring issuer account without DefaultRipple flag...');

      const accountSetTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        Domain: convertStringToHex(DOMAIN),
        // No DefaultRipple flag
      });

      const signed = issuerWallet.sign(accountSetTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet (without DefaultRipple) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DefaultRipple flag is NOT set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDefaultRipple)).toEqual(0n);

      console.log('✅ Issuer configured without DefaultRipple flag');
    }, 20000);
  });

  describe('Phase 2: Trust Lines and Token Setup', () => {
    it('should create trust lines to issuer', async () => {
      console.log('\n==================== PHASE 2: TRUST LINES AND TOKEN SETUP ====================');
      console.log('🤝 Creating trust lines to issuer...');

      // Alice creates trust line
      const aliceTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: aliceWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRUST_AMOUNT,
        },
      });

      const aliceSigned = aliceWallet.sign(aliceTrustTx);
      const aliceTrustResult = await client.submitAndWait(aliceSigned.tx_blob);
      console.log(`📝 Alice TrustSet transaction hash: ${aliceTrustResult.result.hash}`);
      expect((aliceTrustResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Bob creates trust line
      const bobTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: bobWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRUST_AMOUNT,
        },
      });

      const bobSigned = bobWallet.sign(bobTrustTx);
      const bobTrustResult = await client.submitAndWait(bobSigned.tx_blob);
      console.log(`📝 Bob TrustSet transaction hash: ${bobTrustResult.result.hash}`);
      expect((bobTrustResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify trust lines
      const [aliceAccountLines, bobAccountLines] = await Promise.all([
        client.request({
          command: 'account_lines',
          account: aliceWallet.address,
          peer: issuerWallet.address,
        }),
        client.request({
          command: 'account_lines',
          account: bobWallet.address,
          peer: issuerWallet.address,
        }),
      ]);

      const aliceLine = aliceAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
      );
      const bobLine = bobAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
      );
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.limit).toBe(TRUST_AMOUNT);
      expect(bobLine).toBeDefined();
      expect(bobLine?.limit).toBe(TRUST_AMOUNT);

      console.log('✅ Trust lines created successfully');
    }, 40000);

    it('should issuer clear NoRipple flag for Bob trust line', async () => {
      console.log('🔄 Issuer clearing NoRipple flag for Bob trust line...');

      // Issuer clears NoRipple flag to allow rippling with Bob
      const clearNoRippleTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: issuerWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: bobWallet.address,
          value: '0', // Issuer sets limit to 0 but clears NoRipple flag
        },
        Flags: TrustSetFlags.tfClearNoRipple, // Clear NoRipple
      });

      const signed = issuerWallet.sign(clearNoRippleTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer TrustSet (clear NoRipple for Bob) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify NoRipple flag is cleared from issuer's perspective
      const issuerAccountLines = await client.request({
        command: 'account_lines',
        account: issuerWallet.address,
        peer: bobWallet.address,
      });

      const issuerToBobLine = issuerAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === bobWallet.address
      );
      expect(issuerToBobLine?.no_ripple).toBeFalsy();

      console.log('✅ Issuer cleared NoRipple flag for Bob trust line');
    }, 20000);

    it('should issue USD tokens to Alice', async () => {
      console.log('💰 Issuing USD tokens to Alice...');

      // Issue tokens to Alice
      const issueToAliceTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWallet.address,
        Destination: aliceWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: MINT_AMOUNT,
        },
      });

      const aliceSigned = issuerWallet.sign(issueToAliceTx);
      const aliceResult = await client.submitAndWait(aliceSigned.tx_blob);
      console.log(`📝 Issuer -> Alice Payment transaction hash: ${aliceResult.result.hash}`);
      expect((aliceResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice's balance
      const aliceAccountLines = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceBalance =
        aliceAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0';
      expect(aliceBalance).toBe(MINT_AMOUNT);

      console.log(`✅ Alice now has ${MINT_AMOUNT} ${CURRENCY}`);
    }, 20000);
  });

  describe('Phase 3: DepositAuth and Check Payment', () => {
    let checkId: string;

    it('should enable DepositAuth flag on Bob', async () => {
      console.log('\n==================== PHASE 3: DEPOSITAUTH AND CHECK PAYMENT ====================');
      console.log('🚫 Enabling DepositAuth flag on Bob...');

      const depositAuthTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: bobWallet.address,
        SetFlag: AccountSetAsfFlags.asfDepositAuth,
      });

      const signed = bobWallet.sign(depositAuthTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob AccountSet (DepositAuth enabled) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DepositAuth flag is set
      const accountInfo = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDepositAuth)).toEqual(BigInt(AccountRootFlags.lsfDepositAuth));

      console.log('✅ DepositAuth flag enabled on Bob successfully');
    }, 20000);

    it('should allow Alice to create a check payable to Bob', async () => {
      console.log('📝 Alice creating a check payable to Bob...');

      const checkCreateTx: CheckCreate = await client.autofill({
        TransactionType: 'CheckCreate',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        SendMax: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(checkCreateTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice CheckCreate transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Extract check ID from transaction metadata
      const meta = result.result.meta as TransactionMetadata;
      const createdNode = meta.AffectedNodes?.find(
        node => (node as CreatedNode).CreatedNode?.LedgerEntryType === 'Check'
      );
      checkId = (createdNode as CreatedNode)?.CreatedNode?.LedgerIndex;
      expect(checkId).toBeDefined();
      console.log(`✅ Check created successfully with ID: ${checkId}`);
    }, 10000);

    it('should allow Bob to cash the check despite DepositAuth being enabled', async () => {
      console.log('💰 Bob cashing the check with DepositAuth enabled...');

      // Get balances before cashing check
      const [aliceAccountLinesBefore, bobAccountLinesBefore] = await Promise.all([
        client.request({
          command: 'account_lines',
          account: aliceWallet.address,
          peer: issuerWallet.address,
        }),
        client.request({
          command: 'account_lines',
          account: bobWallet.address,
          peer: issuerWallet.address,
        }),
      ]);

      const aliceBalanceBefore = BigInt(
        aliceAccountLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      const bobBalanceBefore = BigInt(
        bobAccountLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      // Bob cashes the check (should succeed despite DepositAuth)
      const checkCashTx: CheckCash = await client.autofill({
        TransactionType: 'CheckCash',
        Account: bobWallet.address,
        CheckID: checkId,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = bobWallet.sign(checkCashTx);
      console.log(`💸 Submitting CheckCash transaction... ${signed.tx_blob}`);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob CheckCash transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify balances after check cash
      const [aliceAccountLinesAfter, bobAccountLinesAfter] = await Promise.all([
        client.request({
          command: 'account_lines',
          account: aliceWallet.address,
          peer: issuerWallet.address,
        }),
        client.request({
          command: 'account_lines',
          account: bobWallet.address,
          peer: issuerWallet.address,
        }),
      ]);

      const aliceBalanceAfter = BigInt(
        aliceAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      const bobBalanceAfter = BigInt(
        bobAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(aliceBalanceAfter).toEqual(aliceBalanceBefore - BigInt(TRANSFER_AMOUNT));
      expect(bobBalanceAfter).toEqual(bobBalanceBefore + BigInt(TRANSFER_AMOUNT));

      console.log(
        `✅ Check cashed successfully despite DepositAuth: Alice ${aliceBalanceBefore} -> ${aliceBalanceAfter} ${CURRENCY}, Bob ${bobBalanceBefore} -> ${bobBalanceAfter} ${CURRENCY}`
      );
      console.log('ℹ️ DepositAuth allows check cashing - account holder controls when to receive payments');
    }, 50000);
  });
});
