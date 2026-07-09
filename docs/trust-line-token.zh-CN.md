# Trust Line Token

Trust Line Token 是 XRPL 上基于 [Trust Line](https://xrpl.org/docs/concepts/tokens/fungible-tokens/trust-line-tokens) 的同质化代币机制。发行者 (Issuer) 创建代币后，持有者需先建立 Trust Line 才能接收代币。

## Test Suites

### Basic Lifecycle (`basic.test.ts`)

测试完整生命周期：配置发行者 (DefaultRipple) → 建立 Trust Line → Mint → 转账 → Burn → 删除 Trust Line。

```bash
pnpm test trust-line-token/basic
```

### AllowTrustLineClawback (`allow-trustline-clawback.test.ts`)

测试 [Clawback](https://xrpl.org/docs/references/protocol/transactions/types/clawback) 功能。

| 操作                        | 条件                          | 预期                            |
| --------------------------- | ----------------------------- | ------------------------------- |
| Issuer clawback from Bob    | AllowTrustLineClawback 已启用 | 成功                            |
| Issuer clawback 超额        | 回收金额 > 余额               | 成功 (回收全部余额)             |
| 清除 AllowTrustLineClawback | 已设置该标志                  | 交易成功但标志仍保留 (不可撤销) |

```bash
pnpm test allow-trustline-clawback
```

### Check (`check.test.ts`)

测试 [XRPL Check](https://xrpl.org/docs/concepts/payment-types/checks) 功能。

| 操作                | 条件         | 预期               |
| ------------------- | ------------ | ------------------ |
| Bob 兑现 Alice 支票 | 支票有效     | 成功               |
| Alice 取消支票      | 发送方取消   | 成功               |
| Bob 取消支票        | 接收方取消   | 成功               |
| Bob 兑现已取消支票  | 支票已被取消 | 失败 (tecNO_ENTRY) |

```bash
pnpm test trust-line-token/check
```

### Check Burn via Issuer (`check-burn-via-issuer.test.ts`)

测试使用 [Check](https://xrpl.org/docs/concepts/payment-types/checks) 将代币销毁 (burn) 回发行方，绕过发行方的 [DepositAuth](https://xrpl.org/docs/concepts/accounts/depositauth) 限制。

| 操作                        | 条件                    | 预期                        |
| --------------------------- | ----------------------- | --------------------------- |
| User → Issuer 直接销毁      | Issuer 启用 DepositAuth | 失败 (tecNO_PERMISSION)     |
| User 创建面向 Issuer 的支票 | Issuer 启用 DepositAuth | 成功                        |
| Issuer 兑现支票 (销毁)      | Issuer 启用 DepositAuth | 成功 (支票绕过 DepositAuth) |

```bash
pnpm test trust-line-token/check-burn-via-issuer
```

### Credential Deposit Auth (`credential-deposit-auth.test.ts`)

测试基于 [Credentials (XLS-70)](https://xrpl.org/docs/references/protocol/transactions/types/credentialcreate) 的稳定币合规流程：启用 DepositAuth 的收款方仅接受持有发行方签发的有效 KYC 凭证的付款方。

| 操作                 | 条件                         | 预期                      |
| -------------------- | ---------------------------- | ------------------------- |
| Alice → Bob 转账     | Bob 启用 DepositAuth、无凭证 | 失败 (tecNO_PERMISSION)   |
| 携带未接受凭证的付款 | 凭证已签发但未接受           | 失败 (tecBAD_CREDENTIALS) |
| 携带已接受凭证的付款 | 引用 CredentialIDs           | 成功                      |
| 未携带 CredentialIDs | 凭证已接受但未在交易中引用   | 失败 (tecNO_PERMISSION)   |

```bash
pnpm test credential-deposit-auth
```

### Deep Freeze (`deep-freeze.test.ts`)

测试 [Deep Freeze (XLS-77)](https://xrpl.org/docs/concepts/tokens/fungible-tokens/deep-freeze)：被深度冻结的持有者既不能发送也不能接收该代币，而普通冻结仅阻止发送。

| 操作                     | 条件            | 预期                    |
| ------------------------ | --------------- | ----------------------- |
| 未普通冻结时直接深度冻结 | 信任线未冻结    | 失败 (tecNO_PERMISSION) |
| 深度冻结的持有者发送     | 冻结 + 深度冻结 | 失败 (tecPATH_DRY)      |
| 深度冻结的持有者接收     | 冻结 + 深度冻结 | 失败 (tecPATH_DRY)      |
| 深度冻结未清除时清除冻结 | 深度冻结仍生效  | 失败 (tecNO_PERMISSION) |
| 清除深度冻结后接收       | 普通冻结仍生效  | 成功                    |
| 清除深度冻结后发送       | 普通冻结仍生效  | 失败 (tecPATH_DRY)      |

```bash
pnpm test deep-freeze
```

### DefaultRipple (`default-ripple.test.ts`)

测试 [DefaultRipple](https://xrpl.org/docs/concepts/tokens/fungible-tokens/rippling) 标志。

| 操作             | Issuer DefaultRipple | 预期               |
| ---------------- | -------------------- | ------------------ |
| Alice → Bob 转账 | 已启用               | 成功               |
| Alice → Bob 转账 | 未启用               | 失败 (tecPATH_DRY) |

```bash
pnpm test trust-line-token/default-ripple
```

### DepositAuth (`deposit-auth.test.ts`)

测试 [DepositAuth](https://xrpl.org/docs/concepts/accounts/depositauth) 标志。

| 操作                    | Bob DepositAuth | DepositPreauth     | 预期                    |
| ----------------------- | --------------- | ------------------ | ----------------------- |
| Alice → Bob USD         | 已启用          | 无                 | 失败 (tecNO_PERMISSION) |
| Alice → Bob XRP         | 已启用          | 无                 | 失败 (tecNO_PERMISSION) |
| Issuer → Bob USD (mint) | 已启用          | 无                 | 失败 (tecNO_PERMISSION) |
| Bob → Alice USD         | 已启用          | 无                 | 成功 (出账不受限)       |
| Bob → Alice XRP         | 已启用          | 无                 | 成功 (出账不受限)       |
| Alice → Bob USD         | 已启用          | Alice 已预授权     | 成功                    |
| Alice → Bob XRP         | 已启用          | Alice 已预授权     | 成功                    |
| Alice → Bob USD         | 已启用          | Alice 预授权已移除 | 失败 (tecNO_PERMISSION) |
| Alice → Bob XRP         | 已启用          | Alice 预授权已移除 | 失败 (tecNO_PERMISSION) |
| Alice → Bob USD         | 已禁用          | -                  | 成功                    |
| Alice → Bob XRP         | 已禁用          | -                  | 成功                    |

```bash
pnpm test trust-line-token/deposit-auth
```

### DepositAuth + Check Flow (`deposit-auth-check-flow.test.ts`)

测试 DepositAuth 与 [Check](https://xrpl.org/docs/concepts/payment-types/checks) 的配合。

| 操作                | Bob DepositAuth | 预期                          |
| ------------------- | --------------- | ----------------------------- |
| Bob 兑现 Alice 支票 | 已启用          | 成功 (Check 绕过 DepositAuth) |

```bash
pnpm test trust-line-token/deposit-auth-check-flow
```

### DisallowXRP (`disallow-xrp.test.ts`)

测试 [DisallowXRP](https://xrpl.org/docs/references/protocol/transactions/types/accountset#disallowxrp) 标志。

| 操作            | Bob DisallowXRP | 预期                |
| --------------- | --------------- | ------------------- |
| Alice → Bob XRP | 已启用          | 成功 (仅建议性标志) |
| Bob → Alice XRP | 已启用          | 成功                |
| Alice → Bob XRP | 已禁用          | 成功                |

```bash
pnpm test trust-line-token/disallow-xrp
```

### Edge Cases (`edge-cases.test.ts`)

测试边界条件。

| 操作               | 条件                      | 预期                   |
| ------------------ | ------------------------- | ---------------------- |
| Alice → Alice 转账 | 自付款                    | 失败 (temREDUNDANT)    |
| Alice → Bob 转账   | amount=0                  | 失败 (temBAD_AMOUNT)   |
| Alice → Bob 转账   | amount > Trust Line limit | 失败 (tecPATH_PARTIAL) |
| 带 Memo 的交易     | MemoType + MemoData       | 成功                   |
| 删除 Trust Line    | limit=0, balance=0        | 成功                   |

```bash
pnpm test trust-line-token/edge-cases
```

### Escrow (`escrow.test.ts`)

测试 [Token Escrow (XLS-85)](https://xrpl.org/docs/concepts/payment-types/escrow)：将已发行代币在链上按时间锁定。释放时间必须严格晚于父账本 close time（fix1571），因此托管基于已验证账本的 close time 创建。

| 操作                          | 条件                              | 预期                    |
| ----------------------------- | --------------------------------- | ----------------------- |
| Alice 向 Bob 托管代币         | Issuer 未设 AllowTrustLineLocking | 失败 (tecNO_PERMISSION) |
| Alice 向 Bob 托管代币         | Issuer 已设 AllowTrustLineLocking | 成功（余额被锁定）      |
| Bob 在 FinishAfter 之前领取   | 时间未到                          | 失败 (tecNO_PERMISSION) |
| Bob 在 FinishAfter 之后领取   | 时间已过                          | 成功（代币到账）        |
| Alice 在 CancelAfter 之前取消 | 时间未到                          | 失败 (tecNO_PERMISSION) |
| Alice 在 CancelAfter 之后取消 | 时间已过                          | 成功（资金退回）        |

```bash
pnpm test trust-line-token/escrow
```

### GlobalFreeze (`global-freeze.test.ts`)

测试 [GlobalFreeze](https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes#global-freeze) 功能。

| 操作                | GlobalFreeze | 预期                      |
| ------------------- | ------------ | ------------------------- |
| Alice → Bob 转账    | 已启用       | 失败 (tecPATH_DRY)        |
| Bob → Alice 转账    | 已启用       | 失败 (tecPATH_DRY)        |
| Issuer → Alice mint | 已启用       | 成功 (Issuer 不受限)      |
| Issuer → Bob mint   | 已启用       | 成功 (Issuer 不受限)      |
| Alice → Issuer burn | 已启用       | 成功 (退回 Issuer 不受限) |
| Issuer clawback     | 已启用       | 成功 (Issuer 不受限)      |
| Alice → Bob 转账    | 已禁用       | 成功                      |

```bash
pnpm test trust-line-token/global-freeze
```

### IndividualFreeze (`individual-freeze.test.ts`)

测试 [Individual Freeze](https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes#individual-freeze) 功能。

| 操作                       | 条件                      | 预期                              |
| -------------------------- | ------------------------- | --------------------------------- |
| Alice → Bob 转账           | Alice Trust Line 已冻结   | 失败 (tecPATH_DRY)                |
| Bob → Alice 转账           | Alice Trust Line 已冻结   | 成功 (冻结仅阻止出账)             |
| Bob → Bob2 转账            | Bob 未冻结                | 成功                              |
| Issuer → Alice mint        | Alice Trust Line 已冻结   | 成功                              |
| Alice → Bob 转账           | Alice Trust Line 已解冻   | 成功                              |
| Issuer 冻结任意 Trust Line | Issuer 已设置 asfNoFreeze | 失败 (tecNO_PERMISSION)           |
| Issuer 清除 asfNoFreeze    | 已设置 asfNoFreeze        | 失败 (tecNO_PERMISSION，不可撤销) |

```bash
pnpm test trust-line-token/individual-freeze
```

### Issuer DepositAuth (`issuer-deposit-auth.test.ts`)

测试发行方启用 [DepositAuth](https://xrpl.org/docs/concepts/accounts/depositauth) 后会阻止销毁 (user → issuer 支付)，直到用户被预授权。

| 操作               | 条件                    | 预期                    |
| ------------------ | ----------------------- | ----------------------- |
| User → Issuer 销毁 | Issuer 启用 DepositAuth | 失败 (tecNO_PERMISSION) |
| User → Issuer 销毁 | 用户已被发行方预授权    | 成功                    |

```bash
pnpm test trust-line-token/issuer-deposit-auth
```

### Multi-Issuer (`multi-issuer.test.ts`)

测试多发行者场景。

| 操作                                 | 条件                         | 预期                       |
| ------------------------------------ | ---------------------------- | -------------------------- |
| 转账 IssuerA USD                     | Alice 同时持有 IssuerA/B USD | 成功 (不影响 IssuerB 余额) |
| 用 IssuerB USD 支付 IssuerA USD 债务 | 不同 Issuer                  | 失败 (tecPATH_PARTIAL)     |
| IssuerA → Alice → IssuerB rippling   | DefaultRipple 启用           | 成功                       |

```bash
pnpm test trust-line-token/multi-issuer
```

### Multisig Issuer Governance (`multisig.test.ts`)

测试用 [SignerList](https://xrpl.org/docs/references/protocol/transactions/types/signerlistset) 多签而非单一密钥控制发行账户——机构发行方的典型配置。

| 操作                            | 条件                       | 预期                                |
| ------------------------------- | -------------------------- | ----------------------------------- |
| 多签 Payment 铸币               | 3 签名人中 2 人（法定 2）  | 成功                                |
| 单签名铸币                      | 权重低于法定数             | 失败 (tefBAD_QUORUM)                |
| 禁用主密钥                      | 已安装签名人列表           | 成功                                |
| 主密钥签名的交易                | 主密钥已禁用               | 失败 (tefMASTER_DISABLED)           |
| 多签冻结信任线                  | 主密钥已禁用               | 成功                                |
| 多签移除签名人列表              | 无 Regular Key、主密钥禁用 | 失败 (tecNO_ALTERNATIVE_KEY)        |
| 多签轮换签名人列表              | 旧列表法定数签名           | 成功（整表替换）                    |
| 被移除的签名人参签              | 轮换之后                   | 失败 (tefBAD_SIGNATURE)             |
| 签名人用自己的 Regular Key 参签 | 该签名人主密钥已禁用       | 成功                                |
| 签名人用已禁用的主密钥参签      | 该签名人主密钥已禁用       | 失败 (tefMASTER_DISABLED)           |
| 纯多签账户作为签名人            | 其自身列表成员代其签名     | 失败 (tefBAD_SIGNATURE，不支持嵌套) |

```bash
pnpm test trust-line-token/multisig
```

### NoRipple Flow (`no-ripple-flow.test.ts`)

测试 [NoRipple](https://xrpl.org/docs/concepts/tokens/fungible-tokens/rippling#using-no-ripple) 标志的手动配置流程。

| 操作                     | 条件                 | 预期                              |
| ------------------------ | -------------------- | --------------------------------- |
| Issuer 创建 Trust Line   | DefaultRipple 未启用 | 成功 (Trust Line 默认带 NoRipple) |
| Issuer 清除 Bob NoRipple | 手动清除             | 成功                              |
| Alice → Bob 转账         | Bob NoRipple 已清除  | 成功                              |

```bash
pnpm test trust-line-token/no-ripple-flow
```

### RequireAuth (`require-auth.test.ts`)

测试 [RequireAuth](https://xrpl.org/docs/concepts/tokens/fungible-tokens/authorized-trust-lines) 功能。

| 操作                  | Issuer RequireAuth | Trust Line 状态 | 预期               |
| --------------------- | ------------------ | --------------- | ------------------ |
| Issuer → Alice mint   | 已启用             | 已授权          | 成功               |
| Alice → Bob 转账      | 已启用             | 双方已授权      | 成功               |
| Issuer → Charlie mint | 已启用             | 未授权          | 失败 (tecPATH_DRY) |
| Alice → Charlie 转账  | 已启用             | Charlie 未授权  | 失败 (tecPATH_DRY) |
| Issuer → Charlie mint | 已清除             | 未授权          | 成功               |
| Alice → Charlie 转账  | 已清除             | 未授权          | 成功               |

```bash
pnpm test trust-line-token/require-auth
```

### Ripple Direction (`ripple-direction.test.ts`)

测试 Ripple 方向性（通过 Issuer 中转的转账路径）。

| 发送方 no_ripple_peer | 接收方 no_ripple_peer | 预期               |
| --------------------- | --------------------- | ------------------ |
| true                  | true                  | 失败 (tecPATH_DRY) |
| true                  | false                 | 成功               |
| false                 | true                  | 成功               |
| false                 | false                 | 成功               |

```bash
pnpm test trust-line-token/ripple-direction
```

### TransferRate (`transfer-rate.test.ts`)

测试 [TransferRate](https://xrpl.org/docs/concepts/tokens/transfer-fees) (转账费率) 功能。

| 操作                | TransferRate | 预期                    |
| ------------------- | ------------ | ----------------------- |
| Alice → Bob 转账    | 0.5%         | 成功 (扣除 0.5% 手续费) |
| Issuer → Alice mint | 0.5%         | 成功 (免手续费)         |
| Alice → Issuer burn | 0.5%         | 成功 (免手续费)         |
| Alice → Bob 转账    | 已清除 (0)   | 成功 (免手续费)         |

```bash
pnpm test trust-line-token/transfer-rate
```

### Regular Key (`regular-key.test.ts`)

测试冷热钱包隔离与 [Regular Key](https://xrpl.org/docs/tutorials/best-practices/key-management/assign-a-regular-key-pair)。

| 操作                         | 条件                     | 预期                        |
| ---------------------------- | ------------------------ | --------------------------- |
| Issuer 分配 Regular Key      | Hot Wallet 地址          | 成功                        |
| Issuer 禁用 Master Key       | `asfDisableMaster`       | 成功                        |
| 使用 Master Key 签名交易     | 主密钥已禁用             | 失败 (`tefMASTER_DISABLED`) |
| 使用 Hot Wallet 签名发行代币 | 交易 `Account` 为 Issuer | 成功                        |

```bash
pnpm test trust-line-token/regular-key
```

### Tickets (`ticket.test.ts`)

测试 [Tickets](https://xrpl.org/docs/concepts/accounts/tickets) (离线预签名/乱序并发机制)。

| 操作                      | 条件                              | 预期 |
| ------------------------- | --------------------------------- | ---- |
| 创建 Tickets              | Issuer 申请 2 张票                | 成功 |
| 使用大票号提交交易 (Tx B) | `Sequence`=0, 带 `TicketSequence` | 成功 |
| 使用小票号提交交易 (Tx A) | 乱序提交 (Tx A 晚于 Tx B)         | 成功 |

```bash
pnpm test trust-line-token/ticket
```
