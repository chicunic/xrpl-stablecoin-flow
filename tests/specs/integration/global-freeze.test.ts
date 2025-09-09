/**
 * GlobalFreeze Flag Test
 *
 * Test Flow:
 * Phase 1: Setup - Create Issuer and User Accounts
 *   - Create issuer, Alice and Bob accounts
 *   - Fund all accounts with XRP
 *   - Configure issuer account
 *
 * Phase 2: Normal Operations (Before GlobalFreeze)
 *   - Alice and Bob create trust lines to issuer
 *   - Issuer issues USD to Alice and Bob
 *
 * Phase 3: Enable GlobalFreeze
 *   - Issuer enables GlobalFreeze flag
 *   - Alice attempts to transfer USD to Bob (should fail)
 *   - Bob attempts to transfer USD to Alice (should fail)
 *   - Issuer can still issue/redeem tokens
 *
 * Phase 4: Disable GlobalFreeze
 *   - Issuer disables GlobalFreeze flag
 *   - Alice transfers USD to Bob (should succeed again)
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

describe('GlobalFreeze Flag Test', () => {
  let client: Client;

  // Wallets
  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let issuerWallet: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting GlobalFreeze Flag Test');

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
      console.log('👥 Creating 3 test wallets...');

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

    it('should configure issuer account', async () => {
      console.log('⚙️ Setting up issuer account...');

      const setupTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        Domain: convertStringToHex(DOMAIN),
        SetFlag: AccountSetAsfFlags.asfDefaultRipple,
        // No GlobalFreeze flag
      });

      const signed = issuerWallet.sign(setupTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DefaultRipple flag IS set and GlobalFreeze flag is NOT set initially
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDefaultRipple)).toEqual(BigInt(AccountRootFlags.lsfDefaultRipple));
      expect(flags & BigInt(AccountRootFlags.lsfGlobalFreeze)).toEqual(0n);

      console.log('✅ Issuer setup complete WITHOUT GlobalFreeze flag');
    }, 20000);
  });

  describe('Phase 2: Normal Operations (Before GlobalFreeze)', () => {
    it('should create trust lines to issuer', async () => {
      console.log('\n==================== PHASE 2: NORMAL OPERATIONS (BEFORE GLOBALFREEZE) ====================');
      console.log('🔗 Creating trust lines to issuer...');

      // Alice trusts Issuer
      const aliceTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: aliceWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRUST_AMOUNT,
        },
      });

      const aliceTrustSigned = aliceWallet.sign(aliceTrustTx);
      const aliceTrustResult = await client.submitAndWait(aliceTrustSigned.tx_blob);
      console.log(`📝 Alice TrustSet transaction hash: ${aliceTrustResult.result.hash}`);
      expect((aliceTrustResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Bob trusts Issuer
      const bobTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: bobWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRUST_AMOUNT,
        },
      });

      const bobTrustSigned = bobWallet.sign(bobTrustTx);
      const bobTrustResult = await client.submitAndWait(bobTrustSigned.tx_blob);
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

    it('should issue USD tokens to Alice and Bob', async () => {
      console.log('💰 Issuing USD tokens to Alice and Bob...');

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

      // Issue tokens to Bob
      const issueToBobTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: MINT_AMOUNT,
        },
      });

      const bobSigned = issuerWallet.sign(issueToBobTx);
      const bobResult = await client.submitAndWait(bobSigned.tx_blob);
      console.log(`📝 Issuer -> Bob Payment transaction hash: ${bobResult.result.hash}`);
      expect((bobResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify balances
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

      const aliceBalance =
        aliceAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0';
      const bobBalance =
        bobAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0';
      expect(aliceBalance).toBe(MINT_AMOUNT);
      expect(bobBalance).toBe(MINT_AMOUNT);

      console.log(`✅ Alice has ${MINT_AMOUNT} ${CURRENCY}`);
      console.log(`✅ Bob has ${MINT_AMOUNT} ${CURRENCY}`);
    }, 40000);
  });

  describe('Phase 3: Enable GlobalFreeze', () => {
    it('should enable GlobalFreeze flag', async () => {
      console.log('\n==================== PHASE 3: ENABLE GLOBALFREEZE ====================');
      console.log('🧊 Enabling GlobalFreeze flag...');

      const freezeTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        SetFlag: AccountSetAsfFlags.asfGlobalFreeze,
      });

      const signed = issuerWallet.sign(freezeTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify GlobalFreeze flag IS set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfGlobalFreeze)).toEqual(BigInt(AccountRootFlags.lsfGlobalFreeze));

      console.log('✅ GlobalFreeze flag enabled successfully');
    }, 20000);

    it('should fail Alice -> Bob transfer with GlobalFreeze enabled', async () => {
      console.log('🙅 Testing transfer failure with GlobalFreeze enabled...');

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

      // Alice attempts to send USD to Bob (should fail with GlobalFreeze)
      const failedPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(failedPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      // Should fail with tecPATH_DRY
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecPATH_DRY');

      // Verify Bob's balance unchanged
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
      expect(bobBalanceAfter).toEqual(bobBalanceBefore);

      console.log(
        `✅ Transfer correctly failed with GlobalFreeze: ${(result.result.meta as TransactionMetadata)?.TransactionResult}`
      );
    }, 30000);

    it('should fail Bob -> Alice transfer with GlobalFreeze enabled', async () => {
      console.log('🙅 Testing reverse transfer failure with GlobalFreeze enabled...');

      // Get Alice's current balance
      const aliceAccountLines = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceBalanceBefore = BigInt(
        aliceAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      // Bob attempts to send USD to Alice (should also fail with GlobalFreeze)
      const failedPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: bobWallet.address,
        Destination: aliceWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = bobWallet.sign(failedPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      // Should fail with tecPATH_DRY
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecPATH_DRY');

      // Verify Alice's balance unchanged
      const aliceAccountLinesAfter = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceBalanceAfter = BigInt(
        aliceAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(aliceBalanceAfter).toEqual(aliceBalanceBefore);

      console.log(
        `✅ Reverse transfer correctly failed with GlobalFreeze: ${(result.result.meta as TransactionMetadata)?.TransactionResult}`
      );
    }, 30000);

    it('should allow issuer to mint (issue) tokens with GlobalFreeze enabled', async () => {
      console.log('💰 Testing mint operation with GlobalFreeze enabled...');

      // Get Alice's current balance
      const aliceAccountLinesBefore = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceBalanceBefore = BigInt(
        aliceAccountLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      // Issuer mints more tokens to Alice (should succeed even with GlobalFreeze)
      const mintTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWallet.address,
        Destination: aliceWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: MINT_AMOUNT,
        },
      });

      const signed = issuerWallet.sign(mintTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice received the additional tokens
      const aliceAccountLinesAfter = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceBalanceAfter = BigInt(
        aliceAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(aliceBalanceAfter).toEqual(aliceBalanceBefore + BigInt(MINT_AMOUNT));

      console.log('✅ Issuer can still mint tokens with GlobalFreeze enabled');
      console.log(`✅ Alice balance increased from ${aliceBalanceBefore} to ${aliceBalanceAfter}`);
    }, 30000);

    it('should allow issuer to mint tokens to Bob with GlobalFreeze enabled', async () => {
      console.log('💰 Testing mint to Bob with GlobalFreeze enabled...');

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

      // Issuer mints tokens to Bob (should succeed even with GlobalFreeze)
      const mintToBobTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: MINT_AMOUNT,
        },
      });

      const signed = issuerWallet.sign(mintToBobTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob received the tokens
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
      expect(bobBalanceAfter).toEqual(bobBalanceBefore + BigInt(MINT_AMOUNT));

      console.log('✅ Issuer can mint tokens to Bob with GlobalFreeze enabled');
      console.log(`✅ Bob balance increased from ${bobBalanceBefore} to ${bobBalanceAfter}`);
    }, 30000);

    it('should allow issuer to burn (redeem) tokens with GlobalFreeze enabled', async () => {
      console.log('🔥 Testing burn operation with GlobalFreeze enabled...');

      // Get Alice's current balance
      const aliceAccountLinesBefore = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceBalanceBefore = BigInt(
        aliceAccountLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      // Issuer burns tokens from Alice (Alice sends tokens back to issuer)
      const burnTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: issuerWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(burnTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice's balance decreased (tokens were burned)
      const aliceAccountLinesAfter = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceBalanceAfter = BigInt(
        aliceAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(aliceBalanceAfter).toEqual(aliceBalanceBefore - BigInt(TRANSFER_AMOUNT));

      console.log('✅ Burn operation successful with GlobalFreeze enabled');
      console.log(`✅ Alice balance decreased from ${aliceBalanceBefore} to ${aliceBalanceAfter}`);
    }, 30000);

    it('should allow users to burn tokens by sending to issuer with GlobalFreeze enabled', async () => {
      console.log('🔥 Testing user-initiated burn with GlobalFreeze enabled...');

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

      // Bob burns tokens by sending them back to issuer (should succeed even with GlobalFreeze)
      const burnFromBobTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: bobWallet.address,
        Destination: issuerWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = bobWallet.sign(burnFromBobTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob's balance decreased (tokens were burned)
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
      expect(bobBalanceAfter).toEqual(bobBalanceBefore - BigInt(TRANSFER_AMOUNT));

      console.log('✅ User-initiated burn successful with GlobalFreeze enabled');
      console.log(`✅ Bob balance decreased from ${bobBalanceBefore} to ${bobBalanceAfter}`);
    }, 30000);
  });

  describe('Phase 4: Disable GlobalFreeze', () => {
    it('should disable GlobalFreeze flag', async () => {
      console.log('\n==================== PHASE 4: DISABLE GLOBALFREEZE ====================');
      console.log('🔓 Disabling GlobalFreeze flag...');

      const unfreezeTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        ClearFlag: AccountSetAsfFlags.asfGlobalFreeze,
      });

      const signed = issuerWallet.sign(unfreezeTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify GlobalFreeze flag is NOT set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfGlobalFreeze)).toEqual(0n);

      console.log('✅ GlobalFreeze flag disabled successfully');
    }, 20000);

    it('should succeed Alice -> Bob transfer after disabling GlobalFreeze', async () => {
      console.log('✅ Testing transfer success after disabling GlobalFreeze...');

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

      // Alice sends USD to Bob (should succeed again after unfreezing)
      const paymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(paymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob received the tokens
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
      expect(bobBalanceAfter).toEqual(bobBalanceBefore + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Transfer successful after unfreezing: Alice -> Bob (${TRANSFER_AMOUNT} ${CURRENCY})`);
      console.log(`✅ Bob balance increased from ${bobBalanceBefore} to ${bobBalanceAfter}`);
    }, 30000);
  });
});
