/**
 * DefaultRipple Flag Test
 *
 * Test Flow:
 * Phase 1: Setup - Create Issuers and User Accounts
 *   - Create issuer, Alice and Bob accounts
 *   - Fund all accounts with XRP
 *   - Config issuer account with DefaultRipple flag enabled
 *   - Config another issuer account without DefaultRipple flag
 *
 * Phase 2: Test Issuer WITH DefaultRipple
 *   - Alice and Bob create trust lines to default ripple issuer
 *   - Issuer issues USD to Alice
 *   - Alice transfers USD to Bob (should succeed)
 *
 * Phase 3: Test Issuer WITHOUT DefaultRipple
 *   - Alice and Bob create trust lines to non-default ripple issuer
 *   - Issuer issues USD to Alice
 *   - Alice transfers USD to Bob (should fail)
 */
import {
  AccountLinesTrustline,
  AccountSet,
  AccountSetAsfFlags,
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
import { CURRENCY, DOMAIN, MINT_AMOUNT, TRANSFER_AMOUNT, TRUST_AMOUNT } from '../../utils/data';

describe('DefaultRipple Flag Test', () => {
  let client: Client;

  // Wallets
  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let issuerWithDefaultRipple: Wallet;
  let issuerWithoutDefaultRipple: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting DefaultRipple Flag Test');

    await initializeXRPLClient();
    client = getXRPLClient();
  }, 30000);

  afterAll(async () => {
    if (client.isConnected()) {
      await client.disconnect();
      console.log('✅ Disconnected from XRPL');
    }
  });

  describe('Phase 1: Setup - Create Issuers and User Accounts', () => {
    it('should create and fund all wallets', async () => {
      console.log('\n==================== PHASE 1: SETUP - CREATE ISSUERS AND USER ACCOUNTS ====================');
      console.log('👥 Creating 4 test wallets...');

      // Generate wallets
      issuerWithDefaultRipple = Wallet.generate();
      issuerWithoutDefaultRipple = Wallet.generate();
      aliceWallet = Wallet.generate();
      bobWallet = Wallet.generate();

      // Fund all wallets
      await fundWallet(issuerWithDefaultRipple, { amount: '2' });
      await fundWallet(issuerWithoutDefaultRipple, { amount: '2' });
      await fundWallet(aliceWallet, { amount: '2' });
      await fundWallet(bobWallet, { amount: '2' });

      // Verify wallet balances after funding
      const [issuerWithDefaultRippleInfo, issuerWithoutDefaultRippleInfo, aliceInfo, bobInfo] = await Promise.all([
        client.request({
          command: 'account_info',
          account: issuerWithDefaultRipple.address,
          ledger_index: 'validated',
        }),
        client.request({
          command: 'account_info',
          account: issuerWithoutDefaultRipple.address,
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
      expect(dropsToXrp(issuerWithDefaultRippleInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(issuerWithoutDefaultRippleInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(aliceInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(bobInfo.result.account_data.Balance)).toEqual(2);

      console.log(`✅ Issuer with DefaultRipple: ${issuerWithDefaultRipple.address}`);
      console.log(`✅ Issuer without DefaultRipple: ${issuerWithoutDefaultRipple.address}`);
      console.log(`✅ Alice: ${aliceWallet.address}`);
      console.log(`✅ Bob: ${bobWallet.address}`);
    }, 80000);

    it('should configure issuer WITH DefaultRipple flag', async () => {
      console.log('⚙️ Setting up issuer account WITH DefaultRipple...');

      const setupTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWithDefaultRipple.address,
        Domain: convertStringToHex(DOMAIN),
        SetFlag: AccountSetAsfFlags.asfDefaultRipple,
      });

      const signed = issuerWithDefaultRipple.sign(setupTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer WITH DefaultRipple AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DefaultRipple flag IS set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWithDefaultRipple.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDefaultRipple)).toEqual(BigInt(AccountRootFlags.lsfDefaultRipple));

      console.log('✅ Issuer setup complete WITH DefaultRipple flag');
    }, 20000);

    it('should configure issuer WITHOUT DefaultRipple flag', async () => {
      console.log('⚙️ Setting up issuer account WITHOUT DefaultRipple...');

      const setupTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWithoutDefaultRipple.address,
        Domain: convertStringToHex(DOMAIN),
        // No DefaultRipple flag
      });

      const signed = issuerWithoutDefaultRipple.sign(setupTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer WITHOUT DefaultRipple AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DefaultRipple flag is NOT set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWithoutDefaultRipple.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDefaultRipple)).toEqual(0n);

      console.log('✅ Issuer setup complete WITHOUT DefaultRipple flag');
    }, 20000);
  });

  describe('Phase 2: Test Issuer WITH DefaultRipple', () => {
    it('should create trust lines to issuer with DefaultRipple', async () => {
      console.log('\n==================== PHASE 2: TEST ISSUER WITH DEFAULTRIPPLE ====================');
      console.log('🔗 Creating trust lines to issuer WITH DefaultRipple...');

      // Alice trusts Issuer with DefaultRipple
      const aliceTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: aliceWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWithDefaultRipple.address,
          value: TRUST_AMOUNT,
        },
      });

      const aliceTrustSigned = aliceWallet.sign(aliceTrustTx);
      const aliceTrustResult = await client.submitAndWait(aliceTrustSigned.tx_blob);
      console.log(`📝 Alice TrustSet to DefaultRipple issuer transaction hash: ${aliceTrustResult.result.hash}`);
      expect((aliceTrustResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Bob trusts Issuer with DefaultRipple
      const bobTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: bobWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWithDefaultRipple.address,
          value: TRUST_AMOUNT,
        },
      });

      const bobTrustSigned = bobWallet.sign(bobTrustTx);
      const bobTrustResult = await client.submitAndWait(bobTrustSigned.tx_blob);
      console.log(`📝 Bob TrustSet to DefaultRipple issuer transaction hash: ${bobTrustResult.result.hash}`);
      expect((bobTrustResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice's and Bob's trust lines and no_ripple_peer flags
      const [aliceAccountLines, bobAccountLines] = await Promise.all([
        client.request({
          command: 'account_lines',
          account: aliceWallet.address,
          peer: issuerWithDefaultRipple.address,
        }),
        client.request({
          command: 'account_lines',
          account: bobWallet.address,
          peer: issuerWithDefaultRipple.address,
        }),
      ]);

      const aliceLine = aliceAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithDefaultRipple.address
      );
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.limit).toBe(TRUST_AMOUNT);
      expect(aliceLine?.balance).toBe('0');
      expect(aliceLine?.no_ripple).toBeFalsy();
      expect(aliceLine?.no_ripple_peer).toBeFalsy();

      const bobLine = bobAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithDefaultRipple.address
      );
      expect(bobLine).toBeDefined();
      expect(bobLine?.limit).toBe(TRUST_AMOUNT);
      expect(bobLine?.balance).toBe('0');
      expect(bobLine?.no_ripple).toBeFalsy();
      expect(bobLine?.no_ripple_peer).toBeFalsy();

      console.log('✅ Trust lines created to issuer WITH DefaultRipple');
    }, 40000);

    it('should issue USD tokens to Alice from DefaultRipple issuer', async () => {
      console.log('💰 Issuing USD tokens to Alice from DefaultRipple issuer...');

      const issueTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWithDefaultRipple.address,
        Destination: aliceWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWithDefaultRipple.address,
          value: MINT_AMOUNT,
        },
      });

      const signed = issuerWithDefaultRipple.sign(issueTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 DefaultRipple Issuer -> Alice Payment transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice has tokens
      const aliceAccountLines = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWithDefaultRipple.address,
      });

      const aliceBalance =
        aliceAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithDefaultRipple.address
        )?.balance || '0';
      expect(aliceBalance).toBe(MINT_AMOUNT);

      console.log(`✅ Alice now has ${MINT_AMOUNT} ${CURRENCY} from DefaultRipple issuer`);
    }, 20000);

    it('should succeed Alice -> Bob transfer with DefaultRipple issuer', async () => {
      console.log('✅ Testing transfer success with DefaultRipple issuer...');

      // Alice sends USD to Bob (should succeed with DefaultRipple)
      const paymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWithDefaultRipple.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(paymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob Payment (DefaultRipple) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob received the tokens
      const bobAccountLines = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWithDefaultRipple.address,
      });

      const bobBalance =
        bobAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithDefaultRipple.address
        )?.balance || '0';
      expect(bobBalance).toBe(TRANSFER_AMOUNT);

      console.log(`✅ Transfer successful with DefaultRipple issuer: Alice -> Bob (${TRANSFER_AMOUNT} ${CURRENCY})`);
      console.log(`✅ Bob balance: ${bobBalance} ${CURRENCY}`);
    }, 20000);
  });

  describe('Phase 3: Test Issuer WITHOUT DefaultRipple', () => {
    it('should create trust lines to issuer without DefaultRipple', async () => {
      console.log('\n==================== PHASE 3: TEST ISSUER WITHOUT DEFAULTRIPPLE ====================');
      console.log('🔗 Creating trust lines to issuer WITHOUT DefaultRipple...');

      // Alice trusts Issuer without DefaultRipple
      const aliceTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: aliceWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWithoutDefaultRipple.address,
          value: TRUST_AMOUNT,
        },
      });

      const aliceTrustSigned = aliceWallet.sign(aliceTrustTx);
      const aliceTrustResult = await client.submitAndWait(aliceTrustSigned.tx_blob);
      console.log(`📝 Alice TrustSet to non-DefaultRipple issuer transaction hash: ${aliceTrustResult.result.hash}`);
      expect((aliceTrustResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Bob trusts Issuer without DefaultRipple
      const bobTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: bobWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWithoutDefaultRipple.address,
          value: TRUST_AMOUNT,
        },
      });

      const bobTrustSigned = bobWallet.sign(bobTrustTx);
      const bobTrustResult = await client.submitAndWait(bobTrustSigned.tx_blob);
      console.log(`📝 Bob TrustSet to non-DefaultRipple issuer transaction hash: ${bobTrustResult.result.hash}`);
      expect((bobTrustResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice's and Bob's trust lines and no_ripple_peer flags
      const [aliceAccountLines, bobAccountLines] = await Promise.all([
        client.request({
          command: 'account_lines',
          account: aliceWallet.address,
          peer: issuerWithoutDefaultRipple.address,
        }),
        client.request({
          command: 'account_lines',
          account: bobWallet.address,
          peer: issuerWithoutDefaultRipple.address,
        }),
      ]);

      const aliceLine = aliceAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithoutDefaultRipple.address
      );
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.limit).toBe(TRUST_AMOUNT);
      expect(aliceLine?.balance).toBe('0');
      expect(aliceLine?.no_ripple).toBeFalsy();
      expect(aliceLine?.no_ripple_peer).toBeTruthy();

      const bobLine = bobAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithoutDefaultRipple.address
      );
      expect(bobLine).toBeDefined();
      expect(bobLine?.limit).toBe(TRUST_AMOUNT);
      expect(bobLine?.balance).toBe('0');
      expect(bobLine?.no_ripple).toBeFalsy();
      expect(bobLine?.no_ripple_peer).toBeTruthy();

      console.log('✅ Trust lines created to issuer WITHOUT DefaultRipple');
    }, 40000);

    it('should issue USD tokens to Alice from non-DefaultRipple issuer', async () => {
      console.log('💰 Issuing USD tokens to Alice from non-DefaultRipple issuer...');

      const issueTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWithoutDefaultRipple.address,
        Destination: aliceWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWithoutDefaultRipple.address,
          value: MINT_AMOUNT,
        },
      });

      const signed = issuerWithoutDefaultRipple.sign(issueTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Non-DefaultRipple Issuer -> Alice Payment transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice has tokens
      const aliceAccountLines = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWithoutDefaultRipple.address,
      });

      const aliceBalance =
        aliceAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithoutDefaultRipple.address
        )?.balance || '0';
      expect(aliceBalance).toBe(MINT_AMOUNT);

      console.log(`✅ Alice now has ${MINT_AMOUNT} ${CURRENCY} from non-DefaultRipple issuer`);
    }, 20000);

    it('should fail Alice -> Bob transfer with non-DefaultRipple issuer', async () => {
      console.log('🙅 Testing transfer failure with non-DefaultRipple issuer...');

      // Get Bob's current balance (should be 0)
      const bobAccountLinesBefore = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWithoutDefaultRipple.address,
      });

      const bobBalanceBefore = BigInt(
        bobAccountLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithoutDefaultRipple.address
        )?.balance || '0'
      );
      expect(bobBalanceBefore).toEqual(0n);

      // Alice attempts to send USD to Bob (should fail without DefaultRipple)
      const failedPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWithoutDefaultRipple.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(failedPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob Payment (FAILED - no DefaultRipple) transaction hash: ${result.result.hash}`);
      // Should fail with tecPATH_DRY (no path found)
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecPATH_DRY');

      // Verify Bob's balance unchanged
      const bobAccountLinesAfter = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWithoutDefaultRipple.address,
      });

      const bobBalanceAfter = BigInt(
        bobAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWithoutDefaultRipple.address
        )?.balance || '0'
      );
      expect(bobBalanceAfter).toEqual(bobBalanceBefore);

      console.log(
        `✅ Transfer correctly failed without DefaultRipple: ${(result.result.meta as TransactionMetadata)?.TransactionResult}`
      );
    }, 30000);
  });
});
