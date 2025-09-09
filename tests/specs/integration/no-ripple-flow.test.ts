/**
 * XRPL No Ripple Flow Test
 *
 * This test demonstrates NoRipple flag functionality on XRPL trust lines.
 * NoRipple prevents a trust line from being used in payment paths (rippling),
 * forcing direct transfers only. This is useful for controlling token flow paths.
 *
 * Test Flow:
 * Phase 1: Create and Fund Accounts
 *   - Create issuer, Alice, and Bob accounts
 *   - Fund all accounts with XRP
 *   - Configure issuer WITHOUT DefaultRipple (so NoRipple is set by default)
 *
 * Phase 2: Setup Trust Lines and NoRipple Configuration
 *   - Alice creates trust line to issuer (NoRipple set by default)
 *   - Bob creates trust line to issuer (NoRipple set by default)
 *   - Issuer clears NoRipple flag on Bob's trust line to allow rippling
 *
 * Phase 3: Token Minting and Transfer Flow
 *   - Issuer mints USD tokens to Alice
 *   - Alice transfers USD to Bob (direct transfer works)
 *   - Bob transfers USD back to Issuer (burn tokens)
 *
 * Note: Without DefaultRipple, trust lines have NoRipple set by default,
 * requiring explicit clearing to enable rippling through that trust line.
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
  TrustSetFlags,
  Wallet,
} from 'xrpl';

import { getXRPLClient, initializeXRPLClient } from '../../../src/config/xrpl.config';
import { fundWallet } from '../../../src/services/fund.service';
import { CURRENCY, DOMAIN, TRANSFER_AMOUNT, TRUST_AMOUNT } from '../../utils/data';

describe('XRPL No Ripple Flow Test', () => {
  let client: Client;

  // Wallets
  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting XRPL No Ripple Flow Test');

    await initializeXRPLClient();
    client = getXRPLClient();
  }, 30000);

  afterAll(async () => {
    if (client.isConnected()) {
      await client.disconnect();
      console.log('✅ Disconnected from XRPL');
    }
  });

  describe('Phase 1: Create and Fund Accounts', () => {
    it('should create and fund all wallets', async () => {
      console.log('\n==================== PHASE 1: CREATE AND FUND ACCOUNTS ====================');
      console.log('👥 Creating 3 test wallets...');

      // Generate wallets
      issuerWallet = Wallet.generate();
      aliceWallet = Wallet.generate();
      bobWallet = Wallet.generate();

      // Fund all wallets
      await fundWallet(issuerWallet, { amount: '2' });
      await fundWallet(aliceWallet, { amount: '2' });
      await fundWallet(bobWallet, { amount: '2' });

      // Verify wallet balances
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

    it('should configure issuer WITHOUT DefaultRipple', async () => {
      console.log('⚙️ Setting up issuer account WITHOUT DefaultRipple...');

      // Configure issuer WITHOUT DefaultRipple flag
      // Set flag AllowTrustLineClawback
      const clawbackTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        Domain: convertStringToHex(DOMAIN),
        SetFlag: AccountSetAsfFlags.asfAllowTrustLineClawback, // ✅ Allows clawback of issued tokens
      });

      const clawbackSigned = issuerWallet.sign(clawbackTx);
      const clawbackResult = await client.submitAndWait(clawbackSigned.tx_blob);
      expect((clawbackResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');
      console.log(`✅ Flag AllowTrustLineClawback set: ${clawbackResult.result.hash}`);

      // Set flag DisallowXRP
      const disallowXRPTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        SetFlag: AccountSetAsfFlags.asfDisallowXRP, // ✅ XRP should not be sent to this account
      });

      const disallowXRPSigned = issuerWallet.sign(disallowXRPTx);
      const disallowXRPResult = await client.submitAndWait(disallowXRPSigned.tx_blob);
      expect((disallowXRPResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');
      console.log(`✅ Flag DisallowXRP set: ${disallowXRPResult.result.hash}`);

      console.log('✅ Issuer configured WITHOUT DefaultRipple flag');
    }, 20000);
  });

  describe('Phase 2: Setup Trust Lines', () => {
    it('should create Alice trust line to Issuer', async () => {
      console.log('\n==================== PHASE 2: SETUP TRUST LINES ====================');
      console.log('🔗 Alice creating trust line to Issuer...');

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

      const signed = aliceWallet.sign(aliceTrustTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Issuer TrustSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify trust line
      const aliceAccountLines = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceLine = aliceAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
      );
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.limit).toBe(TRUST_AMOUNT);
      expect(aliceLine?.balance).toBe('0');
      expect(aliceLine?.no_ripple).toBeFalsy();
      expect(aliceLine?.no_ripple_peer).toBeTruthy(); // Without DefaultRipple, NoRipple is set by default

      console.log(`✅ Alice trusts Issuer for ${TRUST_AMOUNT} ${CURRENCY}`);
    }, 20000);

    it('should create Bob trust line to Issuer', async () => {
      console.log('🔗 Bob creating trust line to Issuer...');

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

      const signed = bobWallet.sign(bobTrustTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Bob -> Issuer TrustSet transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify trust line
      const bobAccountLines = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWallet.address,
      });

      const bobLine = bobAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
      );
      expect(bobLine).toBeDefined();
      expect(bobLine?.limit).toBe(TRUST_AMOUNT);
      expect(bobLine?.balance).toBe('0');
      expect(bobLine?.no_ripple).toBeFalsy();
      expect(bobLine?.no_ripple_peer).toBeTruthy(); // Without DefaultRipple, NoRipple is set by default

      console.log(`✅ Bob trusts Issuer for ${TRUST_AMOUNT} ${CURRENCY}`);
    }, 20000);

    it('should clear NoRipple flag on Bob trust line from Issuer side', async () => {
      console.log('🔒 Issuer clearing NoRipple flag on Bob trust line...');

      // Issuer clears NoRipple flag on Bob's trust line
      const issuerTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: issuerWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: bobWallet.address,
          value: '0', // Issuer doesn't need to trust Bob for any amount
        },
        Flags: TrustSetFlags.tfClearNoRipple, // Clear NoRipple
      });

      const signed = issuerWallet.sign(issuerTrustTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer -> Bob TrustSet (clearing NoRipple) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify NoRipple flag is set
      const issuerAccountLines = await client.request({
        command: 'account_lines',
        account: issuerWallet.address,
        peer: bobWallet.address,
      });

      const issuerLine = issuerAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === bobWallet.address
      );
      expect(issuerLine).toBeDefined();
      expect(issuerLine?.no_ripple).toBeFalsy(); // NoRipple flag should be cleared from issuer's perspective
      expect(issuerLine?.no_ripple_peer).toBeFalsy(); // From Bob's perspective, NoRipple is still set

      console.log(`✅ NoRipple flag cleared on Issuer -> Bob trust line`);
    }, 20000);
  });

  describe('Phase 3: Token Minting and Transfer', () => {
    it('should mint USD tokens from Issuer to Alice', async () => {
      console.log('\n==================== PHASE 3: TOKEN MINTING AND TRANSFER ====================');
      console.log('💰 Minting USD tokens from Issuer to Alice...');

      const mintTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWallet.address,
        Destination: aliceWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = issuerWallet.sign(mintTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Mint transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Alice has tokens
      const aliceLines = await client.request({
        command: 'account_lines',
        account: aliceWallet.address,
        peer: issuerWallet.address,
      });

      const aliceBalance =
        aliceLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0';
      expect(aliceBalance).toBe(TRANSFER_AMOUNT);

      console.log(`✅ Alice now has ${TRANSFER_AMOUNT} ${CURRENCY}`);
    }, 20000);

    it('should transfer USD from Alice to Bob', async () => {
      console.log('💸 Transferring USD from Alice to Bob...');

      // Check balances before transfer
      const [aliceLinesBefore, bobLinesBefore] = await Promise.all([
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
        aliceLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      const bobBalanceBefore = BigInt(
        bobLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      console.log(
        `💰 Before Transfer - Alice: ${aliceBalanceBefore} ${CURRENCY}, Bob: ${bobBalanceBefore} ${CURRENCY}`
      );

      // Execute transfer
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
      console.log(`📝 Transfer transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Check balances after transfer
      const [aliceLinesAfter, bobLinesAfter] = await Promise.all([
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
        aliceLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      const bobBalanceAfter = BigInt(
        bobLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      // Verify transfer amounts
      expect(aliceBalanceAfter).toEqual(aliceBalanceBefore - BigInt(TRANSFER_AMOUNT));
      expect(bobBalanceAfter).toEqual(bobBalanceBefore + BigInt(TRANSFER_AMOUNT));

      console.log(`💰 After Transfer - Alice: ${aliceBalanceAfter} ${CURRENCY}, Bob: ${bobBalanceAfter} ${CURRENCY}`);
      console.log(`✅ Alice transferred ${TRANSFER_AMOUNT} ${CURRENCY} to Bob`);
    }, 50000);

    it('should burn tokens by transferring from Bob back to Issuer', async () => {
      console.log('🔥 Burning tokens by transferring from Bob to Issuer...');

      // Check Bob's balance before burn
      const bobLinesBefore = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWallet.address,
      });

      const bobBalanceBefore = BigInt(
        bobLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      console.log(`💰 Before Burn - Bob has: ${bobBalanceBefore} ${CURRENCY}`);

      // Execute burn (transfer back to issuer)
      const burnTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: bobWallet.address,
        Destination: issuerWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = bobWallet.sign(burnTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Burn transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Check Bob's balance after burn
      const bobLinesAfter = await client.request({
        command: 'account_lines',
        account: bobWallet.address,
        peer: issuerWallet.address,
      });

      const bobBalanceAfter = BigInt(
        bobLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(bobBalanceAfter).toEqual(bobBalanceBefore - BigInt(TRANSFER_AMOUNT));

      console.log(`💰 After Burn - Bob has: ${bobBalanceAfter} ${CURRENCY}`);
      console.log(`✅ Bob burned ${TRANSFER_AMOUNT} ${CURRENCY} by sending back to Issuer`);
      console.log(`🏁 Test flow completed successfully!`);
    }, 30000);
  });
});
