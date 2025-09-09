# XRPL 稳定币流

一个全面的 TypeScript 测试框架，用于 XRPL (XRP 账本) 稳定币操作，具有针对各种 XRPL 账户标志和功能的广泛集成测试。

## 概述

本项目为 XRPL 稳定币流提供强大的测试环境，专注于账户配置、信任线管理、代币发行和支付操作。包含针对关键 XRPL 功能 (如 RequireAuth、DepositAuth、GlobalFreeze 和其他账户标志) 的自动化测试。

## 特性

- **全面的 XRPL 集成测试**: 覆盖所有主要 XRPL 稳定币操作的测试套件
- **账户标志测试**: RequireAuth、DepositAuth、GlobalFreeze、DisallowXRP 等
- **信任线管理**: 创建、授权和追回功能
- **支付流程测试**: 代币转账、XRP 支付和支票操作
- **自动钱包资助**: 智能钱包资助，具有余额检查和水龙头集成
- **并行操作优化**: 使用 Promise.all 优化异步操作
- **网络灵活性**: 支持 devnet、testnet 和自定义 XRPL 端点

## 项目结构

```
xrpl-stablecoin-flow/
├── src/
│   ├── config/
│   │   └── xrpl.config.ts      # XRPL 客户端配置
│   └── services/
│       └── fund.service.ts     # 钱包资助服务
├── tests/
│   ├── specs/integration/      # 集成测试套件
│   │   ├── allow-trustline-clawback.test.ts
│   │   ├── check.test.ts
│   │   ├── default-ripple.test.ts
│   │   ├── deposit-auth-check-flow.test.ts
│   │   ├── deposit-auth.test.ts
│   │   ├── disallow-xrp.test.ts
│   │   ├── global-freeze.test.ts
│   │   ├── no-ripple-flow.test.ts
│   │   └── require-auth.test.ts
│   └── utils/
│       ├── data.ts             # 共享测试常量
│       ├── helpers.ts          # 测试辅助函数
│       └── mock.factory.ts     # 模拟数据工厂
├── jest.config.js              # Jest 配置
├── tsconfig.json              # TypeScript 配置
└── package.json               # 包依赖和脚本
```

## 先决条件

- **Node.js**: ≥22.0.0
- **pnpm**: 包管理器
- **TypeScript**: ^5.9.2
- **XRPL**: ^4.4.0

## 测试套件

### 1. 账户标志测试

#### AllowTrustLineClawback (`allow-trustline-clawback.test.ts`)

测试[追回功能](https://xrpl.org/docs/references/protocol/transactions/types/clawback):

- 在发行者账户上启用追回
- 执行代币追回
- 余额调整和验证

**运行测试:**

```bash
pnpm test allow-trustline-clawback
```

#### DefaultRipple (`default-ripple.test.ts`)

测试 [DefaultRipple 标志](https://xrpl.org/docs/concepts/tokens/fungible-tokens/rippling)账户配置:

- 设置 DefaultRipple 标志
- 自动波纹传播行为
- 多跳支付场景

**运行测试:**

```bash
pnpm test default-ripple
```

#### DepositAuth (`deposit-auth.test.ts`)

测试[存款授权标志](https://xrpl.org/docs/concepts/accounts/depositauth)要求:

- 在接收者账户上设置 DepositAuth 标志
- 授权存款流程
- 支付授权机制

**运行测试:**

```bash
pnpm test deposit-auth
```

#### DisallowXRP (`disallow-xrp.test.ts`)

测试 [DisallowXRP 标志](https://xrpl.org/docs/concepts/accounts/depositauth)限制:

- 设置 DisallowXRP 标志
- 防止向已标记账户的 XRP 支付
- 仅代币交易流程

**运行测试:**

```bash
pnpm test disallow-xrp
```

#### GlobalFreeze (`global-freeze.test.ts`)

测试[全局冻结标志](https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes#global-freeze)功能:

- 在发行者账户上应用全局冻结
- 冻结期间防止代币转账
- 解冻和恢复操作

**运行测试:**

```bash
pnpm test global-freeze
```

#### RequireAuth (`require-auth.test.ts`)

测试代币发行者的 [RequireAuth 标志](https://xrpl.org/docs/concepts/tokens/fungible-tokens/authorized-trust-lines)功能:

- 在发行者账户上设置 RequireAuth 标志
- 需要授权的信任线创建
- 代币转账授权过程
- 未授权转账预防

**运行测试:**

```bash
pnpm test require-auth
```

### 2. 支付流程测试

#### NoRipple Flow (`no-ripple-flow.test.ts`)

测试 [NoRipple 标志](https://xrpl.org/docs/concepts/tokens/fungible-tokens/rippling)配置:

- 在信任线上设置 NoRipple 标志
- 防止通过账户进行波纹传播
- 直接支付路径

**运行测试:**

```bash
pnpm test no-ripple-flow
```

#### Deposit Auth Check Flow (`deposit-auth-check-flow.test.ts`)

测试带[存款授权](https://xrpl.org/docs/concepts/accounts/depositauth)的支票操作:

- 创建具有存款授权要求的支票
- 授权工作流程
- 授权支票兑现

**运行测试:**

```bash
pnpm test deposit-auth-check-flow
```

### 3. 支付测试

#### Check Operations (`check.test.ts`)

测试 [XRPL 支票](https://xrpl.org/docs/concepts/payment-types/checks)功能:

- 创建支付支票
- 支票授权和兑现
- 支票取消流程

**运行测试:**

```bash
pnpm test check
```

## 许可证

MIT

## 关键词

- XRP
- XRPL
- 稳定币
- TypeScript
- 测试
- 集成测试
- 区块链
- 加密货币
