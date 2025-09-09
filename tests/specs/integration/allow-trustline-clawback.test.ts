/**
 * AllowTrustLineClawback Flag Test
 *
 * Test Flow:
 * Phase 1: Setup - Create Issuer and User Accounts
 *   - Create issuer, Alice, and Bob accounts
 *   - Fund all accounts with XRP
 *   - Configure issuer account with AllowTrustLineClawback flag
 *
 * Phase 2: Trust Lines and Token Setup
 *   - Alice and Bob create trust lines to issuer for USD tokens
 *   - Issuer mints USD tokens to Alice
 *
 * Phase 3: Test Clawback Operations
 *   - Alice transfers tokens to Bob
 *   - Issuer clawbacks tokens from Alice (should succeed)
 *   - Test clawback when account has insufficient balance
 *
 * Phase 4: Test Clawback Permanence
 *   - Verify that AllowTrustLineClawback flag cannot be disabled
 *
 * Note: AllowTrustLineClawback allows token issuers to claw back tokens they have issued,
 * but only if this flag was set before the trust lines were established.
 * IMPORTANT: Once set, this flag cannot be reverted.
 */
import {
  AccountLinesTrustline,
  AccountSet,
  AccountSetAsfFlags,
  Clawback,
  Client,
  convertStringToHex,
  dropsToXrp,
  Payment,
  TransactionMetadata,
  TrustSet,
  Wallet,
} from 'xrpl';
import { AccountRootFlags } from 'xrpl/dist/npm/models/ledger';

import { getXRPLClient, initializeXRPLClient } from '../../../src/config/xrpl.config';
import { fundWallet } from '../../../src/services/fund.service';
import { CLAWBACK_AMOUNT, CURRENCY, DOMAIN, MINT_AMOUNT, TRANSFER_AMOUNT, TRUST_AMOUNT } from '../../utils/data';

describe('AllowTrustLineClawback Flag Test', () => {
  let client: Client;

  // Wallets
  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting AllowTrustLineClawback Flag Test');

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

    it('should configure issuer account with AllowTrustLineClawback', async () => {
      console.log('🏦 Configuring issuer account with AllowTrustLineClawback flag...');

      // Set AllowTrustLineClawback flag
      const clawbackTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        Domain: convertStringToHex(DOMAIN),
        SetFlag: AccountSetAsfFlags.asfAllowTrustLineClawback,
      });

      const signed = issuerWallet.sign(clawbackTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet (AllowTrustLineClawback) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Set DefaultRipple flag
      const defaultRippleTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        SetFlag: AccountSetAsfFlags.asfDefaultRipple,
      });

      const signedDefaultRipple = issuerWallet.sign(defaultRippleTx);
      const defaultRippleResult = await client.submitAndWait(signedDefaultRipple.tx_blob);
      console.log(`📝 Issuer AccountSet (DefaultRipple) transaction hash: ${defaultRippleResult.result.hash}`);
      expect((defaultRippleResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify both AllowTrustLineClawback and DefaultRipple flags are set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfAllowTrustLineClawback)).toEqual(
        BigInt(AccountRootFlags.lsfAllowTrustLineClawback)
      );
      expect(flags & BigInt(AccountRootFlags.lsfDefaultRipple)).toEqual(BigInt(AccountRootFlags.lsfDefaultRipple));

      console.log('✅ AllowTrustLineClawback and DefaultRipple flags enabled on issuer successfully');
    }, 30000);
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

  describe('Phase 3: Test Clawback Operations', () => {
    it('should allow Alice to transfer tokens to Bob', async () => {
      console.log('\n==================== PHASE 3: TEST CLAWBACK OPERATIONS ====================');
      console.log('💸 Alice transferring tokens to Bob...');

      const transferTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(transferTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob Payment transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify balances after transfer
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

      const aliceBalance = BigInt(
        aliceAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      const bobBalance = BigInt(
        bobAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(aliceBalance).toEqual(BigInt(MINT_AMOUNT) - BigInt(TRANSFER_AMOUNT));
      expect(bobBalance).toEqual(BigInt(TRANSFER_AMOUNT));

      console.log(
        `✅ Transfer successful: Alice now has ${aliceBalance} ${CURRENCY}, Bob has ${bobBalance} ${CURRENCY}`
      );
    }, 30000);

    it('should succeed issuer clawback from Bob', async () => {
      console.log('🔄 Testing issuer clawback from Bob...');

      // Get Bob's balance before clawback
      const bobAccountLinesBefore = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWallet.address,
      });

      const bobBalanceBefore = BigInt(
        bobAccountLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      // Issuer claws back tokens from Bob
      const clawbackTx: Clawback = await client.autofill({
        TransactionType: 'Clawback',
        Account: issuerWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: bobWallet.address, // The token holder's account ID (not the token issuer)
          value: CLAWBACK_AMOUNT,
        },
      });

      const signed = issuerWallet.sign(clawbackTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer Clawback from Bob transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob's balance after clawback
      const bobAccountLinesAfter = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWallet.address,
      });

      const bobBalanceAfter = BigInt(
        bobAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(bobBalanceAfter).toEqual(bobBalanceBefore - BigInt(CLAWBACK_AMOUNT));

      console.log(`✅ Clawback successful: Bob balance ${bobBalanceBefore} -> ${bobBalanceAfter} ${CURRENCY}`);
    }, 30000);

    it('should clawback entire balance when amount exceeds current balance', async () => {
      console.log('💰 Testing clawback of more than available balance (claws back entire balance)...');

      // Get Bob's current balance
      const bobAccountLinesBefore = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWallet.address,
      });

      const bobBalanceBefore = BigInt(
        bobAccountLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      // Try to clawback more than Bob has
      const excessiveClawbackTx: Clawback = await client.autofill({
        TransactionType: 'Clawback',
        Account: issuerWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: bobWallet.address, // The token holder's account ID (not the token issuer)
          value: MINT_AMOUNT, // More than Bob should have
        },
      });

      const signed = issuerWallet.sign(excessiveClawbackTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Excessive Clawback transaction hash: ${result.result.hash}`);
      // Transaction succeeds but claws back entire balance instead of failing
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob's entire balance was clawed back
      const bobAccountLinesAfter = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWallet.address,
      });

      const bobBalanceAfter = BigInt(
        bobAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(bobBalanceAfter).toEqual(0n);

      console.log(`✅ Entire balance clawed back: Bob ${bobBalanceBefore} -> ${bobBalanceAfter} ${CURRENCY}`);
    }, 30000);
  });

  describe('Phase 4: Test Clawback Permanence', () => {
    it('should succeed clear AllowTrustLineClawback transaction but flag remains set (permanent)', async () => {
      console.log('\n==================== PHASE 4: TEST CLAWBACK PERMANENCE ====================');
      console.log('🔄 Attempting to clear AllowTrustLineClawback flag (transaction succeeds but flag remains)...');

      const clearClawbackTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        ClearFlag: AccountSetAsfFlags.asfAllowTrustLineClawback,
      });

      const signed = issuerWallet.sign(clearClawbackTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet (clear AllowTrustLineClawback) transaction hash: ${result.result.hash}`);
      // Transaction succeeds but does nothing - AllowTrustLineClawback cannot be cleared once set
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify AllowTrustLineClawback flag is STILL set (transaction succeeded but flag remains)
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfAllowTrustLineClawback)).toEqual(
        BigInt(AccountRootFlags.lsfAllowTrustLineClawback)
      );

      console.log(
        '✅ Clear transaction succeeded but did nothing - AllowTrustLineClawback flag remains enabled (permanent)'
      );
    }, 20000);
  });
});
