/**
 * RequireAuth Test
 *
 * Test Flow:
 * Phase 1: Setup - Create Issuer and User Accounts
 *   - Create issuer, Alice, Bob, and Charlie accounts
 *   - Fund all accounts with XRP
 *   - Configure issuer account with RequireAuth and DefaultRipple flags
 *
 * Phase 2: Trust Lines with Authorization
 *   - Alice creates trust line to issuer (succeeds but unauthorized state)
 *   - Issuer authorizes Alice's trust line
 *   - Bob creates trust line to issuer (succeeds but unauthorized state)
 *   - Issuer authorizes Bob's trust line
 *   - Charlie creates trust line to issuer (succeeds but remains unauthorized)
 *
 * Phase 3: Token Issuance and Transfer
 *   - Issuer mints USD tokens to Alice
 *   - Alice transfers tokens to Bob
 *   - Issuer fails to mint tokens to unauthorized Charlie (tecNO_AUTH)
 *   - Alice fails to transfer tokens to unauthorized Charlie (tecNO_AUTH)
 *   - Verify token balances
 *
 * Phase 4: Authorization Limitations
 *   - Clear RequireAuth flag (succeeds and flag is cleared)
 *   - Issuer successfully mints tokens to Charlie (previously unauthorized)
 *   - Alice successfully transfers tokens to Charlie (previously unauthorized)
 *   - Verify that clearing RequireAuth immediately makes unauthorized trust lines usable
 *
 * Note: RequireAuth ensures that only explicitly authorized accounts can hold
 * the issuer's tokens, providing strict control over token distribution.
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
import { AccountRootFlags } from 'xrpl/dist/npm/models/ledger';

import { getXRPLClient, initializeXRPLClient } from '../../../src/config/xrpl.config';
import { fundWallet } from '../../../src/services/fund.service';
import { CURRENCY, DOMAIN, MINT_AMOUNT, TRANSFER_AMOUNT, TRUST_AMOUNT } from '../../utils/data';

describe('RequireAuth Test', () => {
  let client: Client;

  // Wallets
  let issuerWallet: Wallet;
  let aliceWallet: Wallet;
  let bobWallet: Wallet;
  let charlieWallet: Wallet;

  beforeAll(async () => {
    console.log('🚀 Starting RequireAuth Test');

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
      charlieWallet = Wallet.generate();

      // Fund all wallets
      await fundWallet(issuerWallet, { amount: '2' });
      await fundWallet(aliceWallet, { amount: '2' });
      await fundWallet(bobWallet, { amount: '2' });
      await fundWallet(charlieWallet, { amount: '2' });

      // Verify wallet balances after funding
      const [issuerInfo, aliceInfo, bobInfo, charlieInfo] = await Promise.all([
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
        client.request({
          command: 'account_info',
          account: charlieWallet.address,
          ledger_index: 'validated',
        }),
      ]);
      // Check that all wallets have sufficient XRP balance
      expect(dropsToXrp(issuerInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(aliceInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(bobInfo.result.account_data.Balance)).toEqual(2);
      expect(dropsToXrp(charlieInfo.result.account_data.Balance)).toEqual(2);

      console.log(`✅ Issuer: ${issuerWallet.address}`);
      console.log(`✅ Alice: ${aliceWallet.address}`);
      console.log(`✅ Bob: ${bobWallet.address}`);
      console.log(`✅ Charlie: ${charlieWallet.address}`);
    }, 80000);

    it('should configure issuer account with RequireAuth and DefaultRipple', async () => {
      console.log('🏦 Configuring issuer account with RequireAuth and DefaultRipple flags...');

      // Set RequireAuth flag
      const requireAuthTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        Domain: convertStringToHex(DOMAIN),
        SetFlag: AccountSetAsfFlags.asfRequireAuth,
      });

      const signedRequireAuth = issuerWallet.sign(requireAuthTx);
      const requireAuthResult = await client.submitAndWait(signedRequireAuth.tx_blob);
      console.log(`📝 Issuer AccountSet (RequireAuth) transaction hash: ${requireAuthResult.result.hash}`);
      expect((requireAuthResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

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

      // Verify both flags are set
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfRequireAuth)).toEqual(BigInt(AccountRootFlags.lsfRequireAuth));
      expect(flags & BigInt(AccountRootFlags.lsfDefaultRipple)).toEqual(BigInt(AccountRootFlags.lsfDefaultRipple));

      console.log('✅ RequireAuth and DefaultRipple flags enabled on issuer successfully');
    }, 30000);
  });

  describe('Phase 2: Trust Lines with Authorization', () => {
    it('should create Alice trust line but in unauthorized state', async () => {
      console.log('\n==================== PHASE 2: TRUST LINES WITH AUTHORIZATION ====================');
      console.log('⚠️ Alice creating trust line (will be unauthorized due to RequireAuth)...');

      // Alice creates trust line to issuer
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

      // Verify trust line exists but is unauthorized
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
      expect(aliceLine?.authorized).toBeFalsy(); // Unauthorized trust lines have falsy authorized field

      console.log('✅ Trust line created but is unauthorized');
    }, 20000);

    it('should authorize Alice trust line and verify authorization', async () => {
      console.log('🔓 Issuer authorizing Alice trust line...');

      // Issuer authorizes Alice
      const authAliceTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: issuerWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: aliceWallet.address,
          value: '0',
        },
        Flags: TrustSetFlags.tfSetfAuth,
      });

      const signed = issuerWallet.sign(authAliceTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer TrustSet (authorize Alice) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify trust line is now authorized from both perspectives
      const [aliceAccountLines, issuerAccountLines] = await Promise.all([
        client.request({
          command: 'account_lines',
          account: aliceWallet.address,
          peer: issuerWallet.address,
        }),
        client.request({
          command: 'account_lines',
          account: issuerWallet.address,
          peer: aliceWallet.address,
        }),
      ]);

      const aliceLine = aliceAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
      );
      const issuerLine = issuerAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === aliceWallet.address
      );
      console.log('Alice Trust Line:', aliceLine);
      console.log('Issuer Trust Line:', issuerLine);
      expect(aliceLine).toBeDefined();
      expect(aliceLine?.limit).toBe(TRUST_AMOUNT);
      // Check authorized status from issuer's perspective
      expect(issuerLine?.authorized).toBeTruthy(); // ???

      console.log('✅ Alice trust line authorized and verified successfully');
    }, 30000);

    it('should create Bob trust line but in unauthorized state', async () => {
      console.log('⚠️ Bob creating trust line (will be unauthorized due to RequireAuth)...');

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

      // Verify trust line exists but is unauthorized
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
      expect(bobLine?.authorized).toBeFalsy(); // Unauthorized trust lines have falsy authorized field

      console.log('✅ Bob trust line created but is unauthorized');
    }, 20000);

    it('should authorize Bob trust line from issuer', async () => {
      console.log('🔓 Issuer authorizing Bob trust line...');

      // Issuer authorizes Bob
      const authBobTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: issuerWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: bobWallet.address,
          value: '0',
        },
        Flags: TrustSetFlags.tfSetfAuth,
      });

      const authSigned = issuerWallet.sign(authBobTx);
      const authResult = await client.submitAndWait(authSigned.tx_blob);
      console.log(`📝 Issuer TrustSet (authorize Bob) transaction hash: ${authResult.result.hash}`);
      expect((authResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify trust line is now authorized from both perspectives
      const [bobAccountLines, issuerAccountLines] = await Promise.all([
        client.request({
          command: 'account_lines',
          account: bobWallet.address,
          peer: issuerWallet.address,
        }),
        client.request({
          command: 'account_lines',
          account: issuerWallet.address,
          peer: bobWallet.address,
        }),
      ]);

      const bobLine = bobAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
      );
      const issuerLine = issuerAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === bobWallet.address
      );
      expect(bobLine).toBeDefined();
      expect(bobLine?.limit).toBe(TRUST_AMOUNT);
      // Check authorized status from issuer's perspective
      expect(issuerLine?.authorized).toBeTruthy();

      console.log('✅ Bob trust line authorized successfully');
    }, 30000);

    it('should create Charlie trust line but keep it unauthorized', async () => {
      console.log('⚠️ Charlie creating trust line (will remain unauthorized for testing)...');

      const charlieTrustTx: TrustSet = await client.autofill({
        TransactionType: 'TrustSet',
        Account: charlieWallet.address,
        LimitAmount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRUST_AMOUNT,
        },
      });

      const charlieSigned = charlieWallet.sign(charlieTrustTx);
      const charlieTrustResult = await client.submitAndWait(charlieSigned.tx_blob);
      console.log(`📝 Charlie TrustSet transaction hash: ${charlieTrustResult.result.hash}`);
      expect((charlieTrustResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify trust line exists but is unauthorized
      const charlieAccountLines = await client.request({
        command: 'account_lines',
        account: charlieWallet.address,
        peer: issuerWallet.address,
      });

      const charlieLine = charlieAccountLines.result.lines.find(
        (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
      );
      expect(charlieLine).toBeDefined();
      expect(charlieLine?.limit).toBe(TRUST_AMOUNT);
      expect(charlieLine?.authorized).toBeFalsy(); // Unauthorized trust lines have falsy authorized field

      console.log('✅ Charlie trust line created but remains unauthorized (for testing RequireAuth)');
    }, 20000);
  });

  describe('Phase 3: Token Issuance and Transfer', () => {
    it('should issue USD tokens to Alice', async () => {
      console.log('\n==================== PHASE 3: TOKEN ISSUANCE AND TRANSFER ====================');
      console.log('💰 Issuing USD tokens to Alice...');

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

    it('should allow Alice to transfer tokens to Bob', async () => {
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

    it('should fail to issue tokens to unauthorized Charlie', async () => {
      console.log('❌ Attempting to issue tokens to unauthorized Charlie (should fail)...');

      // Attempt to issue tokens to unauthorized Charlie
      const issueToCharlieTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWallet.address,
        Destination: charlieWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: MINT_AMOUNT,
        },
      });

      const charlieSigned = issuerWallet.sign(issueToCharlieTx);
      const charlieResult = await client.submitAndWait(charlieSigned.tx_blob);
      console.log(`📝 Issuer -> Charlie Payment (should fail) transaction hash: ${charlieResult.result.hash}`);
      // Should fail due to lack of authorization (returns tecPATH_DRY in practice)
      expect((charlieResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecPATH_DRY');

      console.log('✅ Payment to unauthorized Charlie correctly failed with tecPATH_DRY');
    }, 10000);

    it('should fail Alice transfer to unauthorized Charlie', async () => {
      console.log('❌ Alice attempting to transfer tokens to unauthorized Charlie (should fail)...');

      // Alice attempts to transfer tokens to unauthorized Charlie
      const transferToCharlieTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: charlieWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(transferToCharlieTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Charlie Payment (should fail) transaction hash: ${result.result.hash}`);
      // Should fail due to lack of authorization on Charlie's trust line (returns tecPATH_DRY in practice)
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tecPATH_DRY');

      console.log('✅ Transfer to unauthorized Charlie correctly failed with tecPATH_DRY');
    }, 10000);
  });

  describe('Phase 4: Authorization Limitations', () => {
    it('should successfully clear RequireAuth flag - demonstrating flag reversibility', async () => {
      console.log('\n==================== PHASE 4: AUTHORIZATION LIMITATIONS ====================');
      console.log('🔄 Attempting to clear RequireAuth flag...');

      // Attempt to clear RequireAuth flag
      const clearRequireAuthTx: AccountSet = await client.autofill({
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        ClearFlag: AccountSetAsfFlags.asfRequireAuth,
      });

      const signed = issuerWallet.sign(clearRequireAuthTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Issuer AccountSet (clear RequireAuth) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify RequireAuth flag is actually cleared (correcting the test expectation)
      const accountInfo = await client.request({
        command: 'account_info',
        account: issuerWallet.address,
        ledger_index: 'validated',
      });

      const flags = BigInt(accountInfo.result.account_data.Flags || 0);
      expect(flags & BigInt(AccountRootFlags.lsfRequireAuth)).toEqual(0n);

      console.log('✅ RequireAuth flag was successfully cleared');
    }, 20000);

    it('should allow issuing tokens to Charlie after clearing RequireAuth', async () => {
      console.log('✅ Testing token issuance to Charlie after clearing RequireAuth...');

      // Now issue tokens to Charlie (should succeed)
      const issueToCharlieTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: issuerWallet.address,
        Destination: charlieWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: MINT_AMOUNT,
        },
      });

      const charlieSigned = issuerWallet.sign(issueToCharlieTx);
      const charlieResult = await client.submitAndWait(charlieSigned.tx_blob);
      console.log(
        `📝 Issuer -> Charlie Payment (after clearing RequireAuth) transaction hash: ${charlieResult.result.hash}`
      );
      expect((charlieResult.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Charlie's balance
      const charlieAccountLines = await client.request({
        command: 'account_lines',
        account: charlieWallet.address,
        peer: issuerWallet.address,
      });

      const charlieBalance =
        charlieAccountLines.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0';
      expect(charlieBalance).toBe(MINT_AMOUNT);

      console.log(`✅ Charlie now has ${charlieBalance} ${CURRENCY}`);
    }, 20000);

    it('should allow Alice to transfer tokens to Charlie after clearing RequireAuth', async () => {
      console.log('✅ Testing Alice -> Charlie transfer after clearing RequireAuth...');

      // Get Charlie's balance before transfer
      const charlieAccountLinesBefore = await client.request({
        command: 'account_lines',
        account: charlieWallet.address,
        peer: issuerWallet.address,
      });
      const charlieBalanceBefore = BigInt(
        charlieAccountLinesBefore.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );

      // Alice transfers to Charlie (should now succeed)
      const transferToCharlieTx: Payment = await client.autofill({
        TransactionType: 'Payment',
        Account: aliceWallet.address,
        Destination: charlieWallet.address,
        Amount: {
          currency: CURRENCY,
          issuer: issuerWallet.address,
          value: TRANSFER_AMOUNT,
        },
      });

      const signed = aliceWallet.sign(transferToCharlieTx);
      const result = await client.submitAndWait(signed.tx_blob);
      console.log(`📝 Alice -> Charlie Payment (after clearing RequireAuth) transaction hash: ${result.result.hash}`);
      expect((result.result.meta as TransactionMetadata)?.TransactionResult).toBe('tesSUCCESS');

      // Verify Charlie's updated balance
      const charlieAccountLinesAfter = await client.request({
        command: 'account_lines',
        account: charlieWallet.address,
        peer: issuerWallet.address,
      });
      const charlieBalanceAfter = BigInt(
        charlieAccountLinesAfter.result.lines.find(
          (l: AccountLinesTrustline) => l.currency === CURRENCY && l.account === issuerWallet.address
        )?.balance || '0'
      );
      expect(charlieBalanceAfter).toEqual(charlieBalanceBefore + BigInt(TRANSFER_AMOUNT));
      console.log(
        `✅ Transfer successful: Charlie balance ${charlieBalanceBefore} -> ${charlieBalanceAfter} ${CURRENCY}`
      );
      console.log('ℹ️ This demonstrates that clearing RequireAuth immediately makes unauthorized trust lines usable');
    }, 30000);
  });
});
