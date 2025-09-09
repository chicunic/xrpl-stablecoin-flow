/**
 * Check Test
 *
 * Test Flow:
 * Phase 1: Setup - Create Issuer and User Accounts
 *   - Create issuer, Alice, and Bob accounts
 *   - Fund all accounts with XRP
 *   - Configure issuer account with DefaultRipple flag
 *
 * Phase 2: Trust Lines and Token Setup
 *   - Alice and Bob create trust lines to issuer for USD tokens
 *   - Issuer mints USD tokens to Alice
 *
 * Phase 3: Check Creation and Cash
 *   - Alice creates a check payable to Bob for USD tokens
 *   - Bob cashes the check to receive the tokens
 *   - Verify token balances after check cash
 *
 * Phase 4: Check Cancellation Testing
 *   - Alice creates two checks payable to Bob
 *   - Alice cancels the first check, Bob cannot cash it
 *   - Bob cancels the second check, Bob cannot cash it
 *
 * Note: Checks allow asynchronous payments - the sender creates a check
 * that the receiver can cash at their convenience, providing more control
 * over when payments are received.
 */
import {
  AccountLinesTrustline,
  AccountSet,
  AccountSetAsfFlags,
  CheckCancel,
  CheckCash,
  CheckCreate,
  Client,
  convertStringToHex,
  CreatedNode,
  dropsToXrp,
  Payment,
  TransactionMetadata,
  TrustSet,
  Wallet,
} from 'xrpl';
import { AccountRootFlags } from 'xrpl/dist/npm/models/ledger';

import { getXRPLClient, initializeXRPLClient } from '../../../src/config/xrpl.config';
import { fundWallet } from '../../../src/services/fund.service';
import { CURRENCY, DOMAIN, MINT_AMOUNT, TRANSFER_AMOUNT, TRUST_AMOUNT } from '../../utils/data';

describe('Check Test', () => {
  let client: Client;

  // Wallets
  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting Check Test');

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

    it('should configure issuer account with DefaultRipple', async () => {
      console.log('🏦 Configuring issuer account with DefaultRipple flag...');

      const defaultRippleTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        Domain: convertStringToHex(DOMAIN),
        SetFlag: AccountSetAsfFlags.asfDefaultRipple,
      });

      const signed = issuerWallet.sign(defaultRippleTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet (DefaultRipple) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DefaultRipple flag is set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDefaultRipple)).toEqual(BigInt(AccountRootFlags.lsfDefaultRipple));

      console.log('✅ DefaultRipple flag enabled on issuer successfully');
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

  describe('Phase 3: Check Creation and Cash', () => {
    let checkId: string;

    it('should allow Alice to create a check payable to Bob', async () => {
      console.log('\n==================== PHASE 3: CHECK CREATION AND CASH ====================');
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

    it('should allow Bob to cash the check and receive tokens', async () => {
      console.log('💰 Bob cashing the check to receive tokens...');

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

      // Bob cashes the check
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
        `✅ Check cashed successfully: Alice ${aliceBalanceBefore} -> ${aliceBalanceAfter} ${CURRENCY}, Bob ${bobBalanceBefore} -> ${bobBalanceAfter} ${CURRENCY}`
      );
    }, 50000);
  });

  describe('Phase 4: Check Cancellation Testing', () => {
    let firstCheckId: string;
    let secondCheckId: string;

    it('should create two checks for cancellation testing', async () => {
      console.log('\n==================== PHASE 4: CHECK CANCELLATION TESTING ====================');
      console.log('📝 Alice creating two checks payable to Bob...');

      // Create first check
      const firstCheckCreateTx: CheckCreate = await client.autofill({
        TransactionType: 'CheckCreate',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        SendMax: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const firstSigned = aliceWallet.sign(firstCheckCreateTx);
      const firstResult = await client.submitAndWait(firstSigned.tx_blob);
      console.log(`📝 Alice CheckCreate (first) transaction hash: ${firstResult.result.hash}`);
      expect((firstResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Extract first check ID
      const firstMeta = firstResult.result.meta as TransactionMetadata;
      const firstCreatedNode = firstMeta.AffectedNodes?.find(
        node => (node as CreatedNode).CreatedNode?.LedgerEntryType === 'Check'
      );
      firstCheckId = (firstCreatedNode as CreatedNode)?.CreatedNode?.LedgerIndex;
      expect(firstCheckId).toBeDefined();

      // Create second check
      const secondCheckCreateTx: CheckCreate = await client.autofill({
        TransactionType: 'CheckCreate',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        SendMax: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const secondSigned = aliceWallet.sign(secondCheckCreateTx);
      const secondResult = await client.submitAndWait(secondSigned.tx_blob);
      console.log(`📝 Alice CheckCreate (second) transaction hash: ${secondResult.result.hash}`);
      expect((secondResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Extract second check ID
      const secondMeta = secondResult.result.meta as TransactionMetadata;
      const secondCreatedNode = secondMeta.AffectedNodes?.find(
        node => (node as CreatedNode).CreatedNode?.LedgerEntryType === 'Check'
      );
      secondCheckId = (secondCreatedNode as CreatedNode)?.CreatedNode?.LedgerIndex;
      expect(secondCheckId).toBeDefined();

      console.log(`✅ Two checks created successfully with IDs: ${firstCheckId}, ${secondCheckId}`);
    }, 20000);

    it('should allow Alice to cancel first check', async () => {
      console.log('❌ Alice canceling the first check...');

      const checkCancelTx: CheckCancel = await client.autofill({
        TransactionType: 'CheckCancel',
        Account: aliceWallet.address,
        CheckID: firstCheckId,
      });

      const signed = aliceWallet.sign(checkCancelTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice CheckCancel (first check) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      console.log('✅ First check canceled by Alice successfully');
    }, 10000);

    it('should fail when Bob tries to cash the first canceled check', async () => {
      console.log('❌ Bob attempting to cash the canceled first check (should fail)...');

      const checkCashTx: CheckCash = await client.autofill({
        TransactionType: 'CheckCash',
        Account: bobWallet.address,
        CheckID: firstCheckId,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = bobWallet.sign(checkCashTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob CheckCash (canceled check) transaction hash: ${result.result.hash}`);
      // Should fail because check was canceled
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecNO_ENTRY');

      console.log('✅ Bob correctly failed to cash canceled check');
    }, 10000);

    it('should allow Bob to cancel second check', async () => {
      console.log('❌ Bob canceling the second check...');

      const checkCancelTx: CheckCancel = await client.autofill({
        TransactionType: 'CheckCancel',
        Account: bobWallet.address,
        CheckID: secondCheckId,
      });

      const signed = bobWallet.sign(checkCancelTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob CheckCancel (second check) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      console.log('✅ Second check canceled by Bob successfully');
    }, 10000);

    it('should fail when Bob tries to cash the second canceled check', async () => {
      console.log('❌ Bob attempting to cash the canceled second check (should fail)...');

      const checkCashTx: CheckCash = await client.autofill({
        TransactionType: 'CheckCash',
        Account: bobWallet.address,
        CheckID: secondCheckId,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = bobWallet.sign(checkCashTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob CheckCash (canceled check) transaction hash: ${result.result.hash}`);
      // Should fail because check was canceled
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecNO_ENTRY');

      console.log('✅ Bob correctly failed to cash canceled check');
    }, 10000);
  });
});
