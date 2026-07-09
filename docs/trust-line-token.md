# Trust Line Token

Trust Line Token is a fungible token mechanism on XRPL based on [Trust Lines](https://xrpl.org/docs/concepts/tokens/fungible-tokens/trust-line-tokens). Holders must establish a Trust Line with the Issuer before receiving tokens.

## Test Suites

### Basic Lifecycle (`basic.test.ts`)

Tests the full lifecycle: configure Issuer (DefaultRipple) → create Trust Line → Mint → Transfer → Burn → delete Trust Line.

```bash
pnpm test trust-line-token/basic
```

### AllowTrustLineClawback (`allow-trustline-clawback.test.ts`)

Tests [Clawback](https://xrpl.org/docs/references/protocol/transactions/types/clawback) functionality.

| Operation                         | Condition                      | Expected                                             |
| --------------------------------- | ------------------------------ | ---------------------------------------------------- |
| Issuer clawback from Bob          | AllowTrustLineClawback enabled | Success                                              |
| Issuer clawback exceeding balance | Clawback amount > balance      | Success (claws back entire balance)                  |
| Clear AllowTrustLineClawback      | Flag already set               | Transaction succeeds but flag remains (irreversible) |

```bash
pnpm test allow-trustline-clawback
```

### Check (`check.test.ts`)

Tests [XRPL Check](https://xrpl.org/docs/concepts/payment-types/checks) functionality.

| Operation                 | Condition              | Expected              |
| ------------------------- | ---------------------- | --------------------- |
| Bob cashes Alice's check  | Check is valid         | Success               |
| Alice cancels check       | Sender cancels         | Success               |
| Bob cancels check         | Receiver cancels       | Success               |
| Bob cashes canceled check | Check already canceled | Failure (tecNO_ENTRY) |

```bash
pnpm test trust-line-token/check
```

### Check Burn via Issuer (`check-burn-via-issuer.test.ts`)

Tests using a [Check](https://xrpl.org/docs/concepts/payment-types/checks) to burn tokens back to the issuer, bypassing [DepositAuth](https://xrpl.org/docs/concepts/accounts/depositauth) on the issuer.

| Operation                         | Condition             | Expected                             |
| --------------------------------- | --------------------- | ------------------------------------ |
| User → Issuer direct burn         | Issuer DepositAuth on | Failure (tecNO_PERMISSION)           |
| User creates check to issuer      | Issuer DepositAuth on | Success                              |
| Issuer cashes user's check (burn) | Issuer DepositAuth on | Success (Check bypasses DepositAuth) |

```bash
pnpm test trust-line-token/check-burn-via-issuer
```

### Credential Deposit Auth (`credential-deposit-auth.test.ts`)

Tests a stablecoin compliance flow using [Credentials (XLS-70)](https://xrpl.org/docs/references/protocol/transactions/types/credentialcreate): a DepositAuth-protected receiver only accepts payments from senders holding a valid KYC credential issued by the token issuer.

| Operation                          | Condition                         | Expected                     |
| ---------------------------------- | --------------------------------- | ---------------------------- |
| Alice → Bob transfer               | Bob DepositAuth on, no credential | Failure (tecNO_PERMISSION)   |
| Payment with unaccepted credential | Credential issued, not accepted   | Failure (tecBAD_CREDENTIALS) |
| Payment with accepted credential   | CredentialIDs referenced          | Success                      |
| Payment without CredentialIDs      | Credential accepted but not sent  | Failure (tecNO_PERMISSION)   |

```bash
pnpm test credential-deposit-auth
```

### Deep Freeze (`deep-freeze.test.ts`)

Tests [Deep Freeze (XLS-77)](https://xrpl.org/docs/concepts/tokens/fungible-tokens/deep-freeze): a deep-frozen holder can neither send nor receive the token, while a regular freeze only blocks sending.

| Operation                              | Condition              | Expected                   |
| -------------------------------------- | ---------------------- | -------------------------- |
| Deep freeze without regular freeze     | Trust line not frozen  | Failure (tecNO_PERMISSION) |
| Deep-frozen holder sends               | Freeze + deep freeze   | Failure (tecPATH_DRY)      |
| Deep-frozen holder receives            | Freeze + deep freeze   | Failure (tecPATH_DRY)      |
| Clear regular freeze while deep-frozen | Deep freeze still set  | Failure (tecNO_PERMISSION) |
| Receive after deep freeze cleared      | Regular freeze remains | Success                    |
| Send after deep freeze cleared         | Regular freeze remains | Failure (tecPATH_DRY)      |

```bash
pnpm test deep-freeze
```

### DefaultRipple (`default-ripple.test.ts`)

Tests the [DefaultRipple](https://xrpl.org/docs/concepts/tokens/fungible-tokens/rippling) flag.

| Operation            | Issuer DefaultRipple | Expected              |
| -------------------- | -------------------- | --------------------- |
| Alice → Bob transfer | Enabled              | Success               |
| Alice → Bob transfer | Disabled             | Failure (tecPATH_DRY) |

```bash
pnpm test trust-line-token/default-ripple
```

### DepositAuth (`deposit-auth.test.ts`)

Tests the [DepositAuth](https://xrpl.org/docs/concepts/accounts/depositauth) flag.

| Operation               | Bob DepositAuth | DepositPreauth        | Expected                        |
| ----------------------- | --------------- | --------------------- | ------------------------------- |
| Alice → Bob USD         | Enabled         | None                  | Failure (tecNO_PERMISSION)      |
| Alice → Bob XRP         | Enabled         | None                  | Failure (tecNO_PERMISSION)      |
| Issuer → Bob USD (mint) | Enabled         | None                  | Failure (tecNO_PERMISSION)      |
| Bob → Alice USD         | Enabled         | None                  | Success (outgoing unrestricted) |
| Bob → Alice XRP         | Enabled         | None                  | Success (outgoing unrestricted) |
| Alice → Bob USD         | Enabled         | Alice preauthorized   | Success                         |
| Alice → Bob XRP         | Enabled         | Alice preauthorized   | Success                         |
| Alice → Bob USD         | Enabled         | Alice preauth removed | Failure (tecNO_PERMISSION)      |
| Alice → Bob XRP         | Enabled         | Alice preauth removed | Failure (tecNO_PERMISSION)      |
| Alice → Bob USD         | Disabled        | -                     | Success                         |
| Alice → Bob XRP         | Disabled        | -                     | Success                         |

```bash
pnpm test trust-line-token/deposit-auth
```

### DepositAuth + Check Flow (`deposit-auth-check-flow.test.ts`)

Tests DepositAuth combined with [Check](https://xrpl.org/docs/concepts/payment-types/checks).

| Operation                | Bob DepositAuth | Expected                             |
| ------------------------ | --------------- | ------------------------------------ |
| Bob cashes Alice's check | Enabled         | Success (Check bypasses DepositAuth) |

```bash
pnpm test trust-line-token/deposit-auth-check-flow
```

### DisallowXRP (`disallow-xrp.test.ts`)

Tests the [DisallowXRP](https://xrpl.org/docs/references/protocol/transactions/types/accountset#disallowxrp) flag.

| Operation       | Bob DisallowXRP | Expected                     |
| --------------- | --------------- | ---------------------------- |
| Alice → Bob XRP | Enabled         | Success (advisory flag only) |
| Bob → Alice XRP | Enabled         | Success                      |
| Alice → Bob XRP | Disabled        | Success                      |

```bash
pnpm test trust-line-token/disallow-xrp
```

### Edge Cases (`edge-cases.test.ts`)

Tests boundary conditions.

| Operation              | Condition                 | Expected                  |
| ---------------------- | ------------------------- | ------------------------- |
| Alice → Alice transfer | Self-payment              | Failure (temREDUNDANT)    |
| Alice → Bob transfer   | amount=0                  | Failure (temBAD_AMOUNT)   |
| Alice → Bob transfer   | amount > Trust Line limit | Failure (tecPATH_PARTIAL) |
| Transaction with Memo  | MemoType + MemoData       | Success                   |
| Delete Trust Line      | limit=0, balance=0        | Success                   |

```bash
pnpm test trust-line-token/edge-cases
```

### Escrow (`escrow.test.ts`)

Tests [Token Escrow (XLS-85)](https://xrpl.org/docs/concepts/payment-types/escrow): time-locking issued tokens on-ledger. Release times must be strictly after the parent ledger close time (fix1571), so escrows are created relative to the validated ledger close time.

| Operation                        | Condition                            | Expected                   |
| -------------------------------- | ------------------------------------ | -------------------------- |
| Alice escrows tokens to Bob      | Issuer AllowTrustLineLocking not set | Failure (tecNO_PERMISSION) |
| Alice escrows tokens to Bob      | Issuer AllowTrustLineLocking set     | Success (balance locked)   |
| Bob finishes before FinishAfter  | Too early                            | Failure (tecNO_PERMISSION) |
| Bob finishes after FinishAfter   | Time passed                          | Success (tokens delivered) |
| Alice cancels before CancelAfter | Too early                            | Failure (tecNO_PERMISSION) |
| Alice cancels after CancelAfter  | Time passed                          | Success (funds returned)   |

```bash
pnpm test trust-line-token/escrow
```

### GlobalFreeze (`global-freeze.test.ts`)

Tests [GlobalFreeze](https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes#global-freeze) functionality.

| Operation            | GlobalFreeze | Expected                                |
| -------------------- | ------------ | --------------------------------------- |
| Alice → Bob transfer | Enabled      | Failure (tecPATH_DRY)                   |
| Bob → Alice transfer | Enabled      | Failure (tecPATH_DRY)                   |
| Issuer → Alice mint  | Enabled      | Success (Issuer unrestricted)           |
| Issuer → Bob mint    | Enabled      | Success (Issuer unrestricted)           |
| Alice → Issuer burn  | Enabled      | Success (return to Issuer unrestricted) |
| Issuer clawback      | Enabled      | Success (Issuer unrestricted)           |
| Alice → Bob transfer | Disabled     | Success                                 |

```bash
pnpm test trust-line-token/global-freeze
```

### IndividualFreeze (`individual-freeze.test.ts`)

Tests [Individual Freeze](https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes#individual-freeze) functionality.

| Operation                     | Condition                 | Expected                                 |
| ----------------------------- | ------------------------- | ---------------------------------------- |
| Alice → Bob transfer          | Alice Trust Line frozen   | Failure (tecPATH_DRY)                    |
| Bob → Alice transfer          | Alice Trust Line frozen   | Success (freeze only blocks outgoing)    |
| Bob → Bob2 transfer           | Bob not frozen            | Success                                  |
| Issuer → Alice mint           | Alice Trust Line frozen   | Success                                  |
| Alice → Bob transfer          | Alice Trust Line unfrozen | Success                                  |
| Issuer freezes any Trust Line | Issuer set asfNoFreeze    | Failure (tecNO_PERMISSION)               |
| Issuer clears asfNoFreeze     | asfNoFreeze set           | Failure (tecNO_PERMISSION, irreversible) |

```bash
pnpm test trust-line-token/individual-freeze
```

### Issuer DepositAuth (`issuer-deposit-auth.test.ts`)

Tests that [DepositAuth](https://xrpl.org/docs/concepts/accounts/depositauth) on the issuer blocks burns (user → issuer payments) until the user is preauthorized.

| Operation          | Condition                    | Expected                   |
| ------------------ | ---------------------------- | -------------------------- |
| User → Issuer burn | Issuer DepositAuth on        | Failure (tecNO_PERMISSION) |
| User → Issuer burn | User preauthorized by issuer | Success                    |

```bash
pnpm test trust-line-token/issuer-deposit-auth
```

### Multi-Issuer (`multi-issuer.test.ts`)

Tests multi-issuer scenarios.

| Operation                             | Condition                      | Expected                             |
| ------------------------------------- | ------------------------------ | ------------------------------------ |
| Transfer IssuerA USD                  | Alice holds both IssuerA/B USD | Success (IssuerB balance unaffected) |
| Pay IssuerA USD debt with IssuerB USD | Different Issuers              | Failure (tecPATH_PARTIAL)            |
| IssuerA → Alice → IssuerB rippling    | DefaultRipple enabled          | Success                              |

```bash
pnpm test trust-line-token/multi-issuer
```

### Multisig Issuer Governance (`multisig.test.ts`)

Tests controlling the issuing account with a [SignerList](https://xrpl.org/docs/references/protocol/transactions/types/signerlistset) instead of a single key — the institutional issuer setup.

| Operation                         | Condition                           | Expected                                        |
| --------------------------------- | ----------------------------------- | ----------------------------------------------- |
| Mint via multisigned Payment      | 2 of 3 signers (quorum 2)           | Success                                         |
| Mint with one signature           | Weight below quorum                 | Failure (tefBAD_QUORUM)                         |
| Disable master key                | Signer list installed               | Success                                         |
| Master-signed transaction         | Master disabled                     | Failure (tefMASTER_DISABLED)                    |
| Freeze trust line via multisig    | Master disabled                     | Success                                         |
| Remove signer list via multisig   | No regular key, master disabled     | Failure (tecNO_ALTERNATIVE_KEY)                 |
| Rotate signer list via multisig   | Quorum of the old list signs        | Success (full replacement)                      |
| Removed signer contributes        | After rotation                      | Failure (tefBAD_SIGNATURE)                      |
| Signer signs with its regular key | Signer's own master disabled        | Success                                         |
| Signer signs with disabled master | Signer's own master disabled        | Failure (tefMASTER_DISABLED)                    |
| Multisig-only account as signer   | Member of its own list signs for it | Failure (tefBAD_SIGNATURE, nesting unsupported) |

```bash
pnpm test trust-line-token/multisig
```

### NoRipple Flow (`no-ripple-flow.test.ts`)

Tests manual configuration of the [NoRipple](https://xrpl.org/docs/concepts/tokens/fungible-tokens/rippling#using-no-ripple) flag.

| Operation                    | Condition              | Expected                                  |
| ---------------------------- | ---------------------- | ----------------------------------------- |
| Issuer creates Trust Line    | DefaultRipple disabled | Success (Trust Line defaults to NoRipple) |
| Issuer clears Bob's NoRipple | Manual clear           | Success                                   |
| Alice → Bob transfer         | Bob NoRipple cleared   | Success                                   |

```bash
pnpm test trust-line-token/no-ripple-flow
```

### RequireAuth (`require-auth.test.ts`)

Tests [RequireAuth](https://xrpl.org/docs/concepts/tokens/fungible-tokens/authorized-trust-lines) functionality.

| Operation                | Issuer RequireAuth | Trust Line Status    | Expected              |
| ------------------------ | ------------------ | -------------------- | --------------------- |
| Issuer → Alice mint      | Enabled            | Authorized           | Success               |
| Alice → Bob transfer     | Enabled            | Both authorized      | Success               |
| Issuer → Charlie mint    | Enabled            | Unauthorized         | Failure (tecPATH_DRY) |
| Alice → Charlie transfer | Enabled            | Charlie unauthorized | Failure (tecPATH_DRY) |
| Issuer → Charlie mint    | Cleared            | Unauthorized         | Success               |
| Alice → Charlie transfer | Cleared            | Unauthorized         | Success               |

```bash
pnpm test trust-line-token/require-auth
```

### Ripple Direction (`ripple-direction.test.ts`)

Tests ripple directionality (transfer paths through Issuer).

| Sender no_ripple_peer | Receiver no_ripple_peer | Expected              |
| --------------------- | ----------------------- | --------------------- |
| true                  | true                    | Failure (tecPATH_DRY) |
| true                  | false                   | Success               |
| false                 | true                    | Success               |
| false                 | false                   | Success               |

```bash
pnpm test trust-line-token/ripple-direction
```

### TransferRate (`transfer-rate.test.ts`)

Tests [TransferRate](https://xrpl.org/docs/concepts/tokens/transfer-fees) functionality.

| Operation            | TransferRate | Expected                    |
| -------------------- | ------------ | --------------------------- |
| Alice → Bob transfer | 0.5%         | Success (0.5% fee deducted) |
| Issuer → Alice mint  | 0.5%         | Success (fee-exempt)        |
| Alice → Issuer burn  | 0.5%         | Success (fee-exempt)        |
| Alice → Bob transfer | Cleared (0)  | Success (fee-exempt)        |

```bash
pnpm test trust-line-token/transfer-rate
```

### Regular Key (`regular-key.test.ts`)

Tests Hot/Cold wallet isolation using a [Regular Key](https://xrpl.org/docs/tutorials/best-practices/key-management/assign-a-regular-key-pair).

| Action                       | Condition              | Expected Result              |
| ---------------------------- | ---------------------- | ---------------------------- |
| Issuer assigns Regular Key   | Hot Wallet address     | Success                      |
| Issuer disables Master Key   | `asfDisableMaster`     | Success                      |
| Sign tx with Master Key      | Master Key disabled    | Fails (`tefMASTER_DISABLED`) |
| Sign mint tx with Hot Wallet | Tx `Account` is Issuer | Success                      |

```bash
pnpm test trust-line-token/regular-key
```

### Tickets (`ticket.test.ts`)

Tests [Tickets](https://xrpl.org/docs/concepts/accounts/tickets) for offline presigning and out-of-order execution.

| Action                              | Condition                           | Expected Result |
| ----------------------------------- | ----------------------------------- | --------------- |
| Create Tickets                      | Issuer requests 2 tickets           | Success         |
| Submit tx with higher ticket (Tx B) | `Sequence`=0, with `TicketSequence` | Success         |
| Submit tx with lower ticket (Tx A)  | Out of order (Tx A after Tx B)      | Success         |

```bash
pnpm test trust-line-token/ticket
```
