/**
 * DepositAuth Flag Test
 *
 * Test Flow:
 * Phase 1: Setup - Create Issuer and User Accounts
 *   - Create issuer, Alice and Bob accounts
 *   - Fund all accounts with XRP
 *   - Configure issuer account
 *
 * Phase 2: Trust Lines and Token Setup
 *   - Alice and Bob create trust lines to issuer for USD tokens
 *   - Issuer mints USD tokens to both Alice and Bob
 *
 * Phase 3: Enable DepositAuth on Bob
 *   - Bob enables DepositAuth flag (blocks all incoming payments)
 *   - Test failures: Alice -> Bob USD/XRP transfers (tecNO_PERMISSION)
 *   - Test failures: Issuer -> Bob USD mint (tecNO_PERMISSION)
 *   - Test successes: Bob -> Alice USD/XRP transfers (outgoing payments work)
 *
 * Phase 4: DepositPreauth Lifecycle
 *   - Bob preauthorizes Alice (allows Alice to send to Bob)
 *   - Test successes: Alice -> Bob USD/XRP transfers after preauthorization
 *   - Bob removes Alice's preauthorization (revokes permission)
 *   - Test failures: Alice -> Bob USD/XRP transfers after revocation (tecNO_PERMISSION)
 *
 * Phase 5: Disable DepositAuth
 *   - Bob disables DepositAuth flag (restores normal payment behavior)
 *   - Test successes: Alice -> Bob USD/XRP transfers work normally again
 */
import {
  AccountLinesTrustline,
  AccountSet,
  AccountSetAsfFlags,
  Client,
  convertStringToHex,
  DepositPreauth,
  dropsToXrp,
  Payment,
  TransactionMetadata,
  TrustSet,
  Wallet,
  xrpToDrops,
} from 'xrpl';
import { AccountRootFlags } from 'xrpl/dist/npm/models/ledger';

import { getXRPLClient, initializeXRPLClient } from '../../../src/config/xrpl.config';
import { fundWallet } from '../../../src/services/fund.service';
import { CURRENCY, DOMAIN, MINT_AMOUNT, TRANSFER_AMOUNT, TRUST_AMOUNT, XRP_TRANSFER_AMOUNT } from '../../utils/data';

describe('DepositAuth Flag Test', () => {
  let client: Client;

  // Wallets
  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let issuerWallet: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting DepositAuth Flag Test');

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

    it('should configure issuer account with DefaultRipple', async () => {
      console.log('⚙️ Setting up issuer account with DefaultRipple...');

      const setupTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        Domain: convertStringToHex(DOMAIN),
        SetFlag: AccountSetAsfFlags.asfDefaultRipple,
      });

      const signed = issuerWallet.sign(setupTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet (DefaultRipple) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DefaultRipple flag IS set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDefaultRipple)).toEqual(BigInt(AccountRootFlags.lsfDefaultRipple));

      console.log('✅ Issuer setup complete WITH DefaultRipple flag');
    }, 20000);
  });

  describe('Phase 2: Trust Lines and Token Setup', () => {
    it('should create trust lines to issuer', async () => {
      console.log('\n==================== PHASE 2: TRUST LINES AND TOKEN SETUP ====================');
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

      console.log(`✅ Alice now has ${MINT_AMOUNT} ${CURRENCY}`);
      console.log(`✅ Bob now has ${MINT_AMOUNT} ${CURRENCY}`);
    }, 40000);
  });

  describe('Phase 3: Enable DepositAuth on Bob', () => {
    it('should enable DepositAuth flag on Bob', async () => {
      console.log('\n==================== PHASE 3: ENABLE DEPOSITAUTH ON BOB ====================');
      console.log('🔐 Enabling DepositAuth flag on Bob...');

      const depositAuthTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: bobWallet.address,
        SetFlag: AccountSetAsfFlags.asfDepositAuth,
      });

      const signed = bobWallet.sign(depositAuthTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob AccountSet (DepositAuth enabled) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DepositAuth flag IS set
      const accountInfo = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDepositAuth)).toEqual(BigInt(AccountRootFlags.lsfDepositAuth));

      console.log('✅ DepositAuth flag enabled on Bob successfully');
    }, 20000);

    it('should fail Alice -> Bob USD transfer with DepositAuth enabled', async () => {
      console.log('🙅 Testing Alice -> Bob USD transfer failure with DepositAuth enabled...');

      // Get Bob's current USD balance
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

      // Alice attempts to send USD to Bob (should fail with DepositAuth)
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
      console.log(`📝 Alice -> Bob USD Payment (FAILED - DepositAuth) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecNO_PERMISSION');

      // Verify Bob's USD balance unchanged
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

      console.log(`✅ Alice -> Bob USD transfer correctly failed with DepositAuth`);
    }, 30000);

    it('should fail Alice -> Bob XRP transfer with DepositAuth enabled', async () => {
      console.log('🙅 Testing Alice -> Bob XRP transfer failure with DepositAuth enabled...');

      // Get Bob's current XRP balance
      const bobInfoBefore = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobXrpBalanceBefore = BigInt(bobInfoBefore.result.account_data.Balance);

      // Alice attempts to send XRP to Bob (should fail with DepositAuth)
      const failedXRPPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: xrpToDrops(XRP_TRANSFER_AMOUNT),
      });

      const signed = aliceWallet.sign(failedXRPPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob XRP Payment (FAILED - DepositAuth) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecNO_PERMISSION');

      // Verify Bob's XRP balance unchanged
      const bobInfoAfter = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobXrpBalanceAfter = BigInt(bobInfoAfter.result.account_data.Balance);
      expect(bobXrpBalanceAfter).toEqual(bobXrpBalanceBefore);

      console.log(`✅ Alice -> Bob XRP transfer correctly failed with DepositAuth`);
    }, 30000);

    it('should fail Issuer -> Bob USD mint with DepositAuth enabled', async () => {
      console.log('🙅 Testing Issuer -> Bob USD mint failure with DepositAuth enabled...');

      // Get Bob's current USD balance
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

      // Issuer attempts to mint USD to Bob (should fail with DepositAuth)
      const issuerMintTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: MINT_AMOUNT,
        },
      });

      const signed = issuerWallet.sign(issuerMintTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer -> Bob USD Mint (FAILED - DepositAuth) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecNO_PERMISSION');

      // Verify Bob's USD balance unchanged
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

      console.log(`✅ Issuer -> Bob USD mint correctly failed with DepositAuth`);
    }, 30000);

    it('should succeed Bob -> Alice USD transfer with DepositAuth enabled', async () => {
      console.log('✅ Testing Bob -> Alice USD transfer success with DepositAuth enabled...');

      // Get Alice's current USD balance
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

      // Bob sends USD to Alice (should succeed, DepositAuth only affects incoming payments)
      const bobPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: bobWallet.address,
        Destination: aliceWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = bobWallet.sign(bobPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob -> Alice USD Payment (SUCCESS) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice received the USD tokens
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
      expect(aliceBalanceAfter).toEqual(aliceBalanceBefore + BigInt(TRANSFER_AMOUNT));

      console.log(`✅ Bob -> Alice USD transfer successful (${TRANSFER_AMOUNT} ${CURRENCY})`);
      console.log(`✅ Alice USD balance increased from ${aliceBalanceBefore} to ${aliceBalanceAfter}`);
    }, 30000);

    it('should succeed Bob -> Alice XRP transfer with DepositAuth enabled', async () => {
      console.log('✅ Testing Bob -> Alice XRP transfer success with DepositAuth enabled...');

      // Get Alice's current XRP balance
      const aliceInfoBefore = await client.request({
        command: 'account_info',
        account: aliceWallet.address,
        ledger_index: 'validated',
      });
      const aliceXrpBalanceBefore = BigInt(aliceInfoBefore.result.account_data.Balance);

      // Bob sends XRP to Alice (should succeed, DepositAuth only affects incoming payments)
      const bobXRPPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: bobWallet.address,
        Destination: aliceWallet.address,
        Amount: xrpToDrops(XRP_TRANSFER_AMOUNT),
      });

      const signed = bobWallet.sign(bobXRPPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob -> Alice XRP Payment (SUCCESS) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice received the XRP
      const aliceInfoAfter = await client.request({
        command: 'account_info',
        account: aliceWallet.address,
        ledger_index: 'validated',
      });
      const aliceXrpBalanceAfter = BigInt(aliceInfoAfter.result.account_data.Balance);
      expect(aliceXrpBalanceAfter).toEqual(aliceXrpBalanceBefore + BigInt(xrpToDrops(XRP_TRANSFER_AMOUNT)));

      console.log(`✅ Bob -> Alice XRP transfer successful (${XRP_TRANSFER_AMOUNT} XRP)`);
      console.log(
        `✅ Alice XRP balance: ${dropsToXrp(aliceXrpBalanceBefore)} XRP -> ${dropsToXrp(aliceXrpBalanceAfter)} XRP`
      );
    }, 30000);
  });

  describe('Phase 4: DepositPreauth', () => {
    it('should preauthorize Alice to send to Bob', async () => {
      console.log('\n==================== PHASE 4: DEPOSITPREAUTH ====================');
      console.log('🔓 Bob preauthorizing Alice...');

      const preauthAliceTx: DepositPreauth = await client.autofill({
        TransactionType: 'DepositPreauth',
        Account: bobWallet.address,
        Authorize: aliceWallet.address,
      });

      const signedAlice = bobWallet.sign(preauthAliceTx);
      const resultAlice = await client.submitAndWait(signedAlice.tx_blob);
      console.log(`📝 Bob DepositPreauth for Alice transaction hash: ${resultAlice.result.hash}`);
      expect((resultAlice.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      console.log('✅ Bob has preauthorized Alice to send deposits');
    }, 10000);

    it('should succeed Alice -> Bob USD transfer after preauthorization', async () => {
      console.log('✅ Testing Alice -> Bob USD transfer after preauthorization...');

      // Get Bob's current USD balance
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

      // Alice sends USD to Bob (should succeed after preauthorization)
      const alicePaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(alicePaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob USD Payment (after preauthorization) transaction hash: ${result.result.hash}`);
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

      console.log(`✅ Alice -> Bob USD transfer successful after preauthorization (${TRANSFER_AMOUNT} ${CURRENCY})`);
      console.log(`✅ Bob USD balance increased from ${bobBalanceBefore} to ${bobBalanceAfter}`);
    }, 30000);

    it('should succeed Alice -> Bob XRP transfer after preauthorization', async () => {
      console.log('✅ Testing Alice -> Bob XRP transfer after preauthorization...');

      // Get Bob's current XRP balance
      const bobInfoBefore = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobXrpBalanceBefore = BigInt(bobInfoBefore.result.account_data.Balance);

      // Alice sends XRP to Bob (should succeed after preauthorization)
      const aliceXRPPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: xrpToDrops(XRP_TRANSFER_AMOUNT),
      });

      const signed = aliceWallet.sign(aliceXRPPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob XRP Payment (after preauthorization) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob received the XRP
      const bobInfoAfter = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobXrpBalanceAfter = BigInt(bobInfoAfter.result.account_data.Balance);
      expect(bobXrpBalanceAfter).toEqual(bobXrpBalanceBefore + BigInt(xrpToDrops(XRP_TRANSFER_AMOUNT)));

      console.log(`✅ Alice -> Bob XRP transfer successful after preauthorization (${XRP_TRANSFER_AMOUNT} XRP)`);
      console.log(
        `✅ Bob XRP balance: ${dropsToXrp(bobXrpBalanceBefore)} XRP -> ${dropsToXrp(bobXrpBalanceAfter)} XRP`
      );
    }, 30000);

    it('should unauthorize Alice (remove preauthorization)', async () => {
      console.log('🔒 Bob removing preauthorization for Alice...');

      const unauthorizeTx: DepositPreauth = await client.autofill({
        TransactionType: 'DepositPreauth',
        Account: bobWallet.address,
        Unauthorize: aliceWallet.address,
      });

      const signed = bobWallet.sign(unauthorizeTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob DepositPreauth Unauthorize Alice transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      console.log('✅ Bob has removed preauthorization for Alice');
    }, 10000);

    it('should fail Alice -> Bob USD transfer after removing preauthorization', async () => {
      console.log('🙅 Testing Alice -> Bob USD transfer failure after removing preauthorization...');

      // Get Bob's current USD balance
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

      // Alice attempts to send USD to Bob (should fail after removing preauthorization)
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
      console.log(`📝 Alice -> Bob USD Payment (FAILED - no preauth) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecNO_PERMISSION');

      // Verify Bob's USD balance unchanged
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

      console.log(`✅ Alice -> Bob USD transfer correctly failed after removing preauthorization`);
    }, 30000);

    it('should fail Alice -> Bob XRP transfer after removing preauthorization', async () => {
      console.log('🙅 Testing Alice -> Bob XRP transfer failure after removing preauthorization...');

      // Get Bob's current XRP balance
      const bobInfoBefore = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobXrpBalanceBefore = BigInt(bobInfoBefore.result.account_data.Balance);

      // Alice attempts to send XRP to Bob (should fail after removing preauthorization)
      const failedXRPPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: xrpToDrops(XRP_TRANSFER_AMOUNT),
      });

      const signed = aliceWallet.sign(failedXRPPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob XRP Payment (FAILED - no preauth) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecNO_PERMISSION');

      // Verify Bob's XRP balance unchanged
      const bobInfoAfter = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobXrpBalanceAfter = BigInt(bobInfoAfter.result.account_data.Balance);
      expect(bobXrpBalanceAfter).toEqual(bobXrpBalanceBefore);

      console.log(`✅ Alice -> Bob XRP transfer correctly failed after removing preauthorization`);
    }, 30000);
  });

  describe('Phase 5: Disable DepositAuth', () => {
    it('should disable DepositAuth flag on Bob', async () => {
      console.log('\n==================== PHASE 5: DISABLE DEPOSITAUTH ====================');
      console.log('🔓 Disabling DepositAuth flag on Bob...');

      const clearDepositAuthTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: bobWallet.address,
        ClearFlag: AccountSetAsfFlags.asfDepositAuth,
      });

      const signed = bobWallet.sign(clearDepositAuthTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob AccountSet (DepositAuth disabled) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify DepositAuth flag is NOT set
      const accountInfo = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfDepositAuth)).toEqual(0n);

      console.log('✅ DepositAuth flag disabled on Bob successfully');
    }, 20000);

    it('should succeed Alice -> Bob transfer after disabling DepositAuth', async () => {
      console.log('✅ Testing Alice -> Bob transfer after disabling DepositAuth...');

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

      // Alice sends USD to Bob (should succeed after disabling DepositAuth)
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
      console.log(`📝 Alice -> Bob Payment (after disabling DepositAuth) transaction hash: ${result.result.hash}`);
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

      console.log(`✅ Transfer successful after disabling DepositAuth: Alice -> Bob (${TRANSFER_AMOUNT} ${CURRENCY})`);
      console.log(`✅ Bob balance increased from ${bobBalanceBefore} to ${bobBalanceAfter}`);
    }, 30000);

    it('should succeed Alice -> Bob XRP transfer after disabling DepositAuth', async () => {
      console.log('✅ Testing Alice -> Bob XRP transfer after disabling DepositAuth...');

      // Get Bob's current XRP balance
      const bobInfoBefore = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobXrpBalanceBefore = BigInt(bobInfoBefore.result.account_data.Balance);

      // Alice sends XRP to Bob (should succeed after disabling DepositAuth)
      const xrpPaymentTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: bobWallet.address,
        Amount: xrpToDrops(XRP_TRANSFER_AMOUNT),
      });

      const signed = aliceWallet.sign(xrpPaymentTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Bob XRP Payment (after disabling DepositAuth) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Bob received the XRP
      const bobInfoAfter = await client.request({
        command: 'account_info',
        account: bobWallet.address,
        ledger_index: 'validated',
      });
      const bobXrpBalanceAfter = BigInt(bobInfoAfter.result.account_data.Balance);
      expect(bobXrpBalanceAfter).toEqual(bobXrpBalanceBefore + BigInt(xrpToDrops(XRP_TRANSFER_AMOUNT)));

      console.log(`✅ Alice -> Bob XRP transfer successful after disabling DepositAuth (${XRP_TRANSFER_AMOUNT} XRP)`);
      console.log(
        `✅ Bob XRP balance: ${dropsToXrp(bobXrpBalanceBefore)} XRP -> ${dropsToXrp(bobXrpBalanceAfter)} XRP`
      );
    }, 30000);
  });
});
