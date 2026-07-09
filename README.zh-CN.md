# XRPL Token Flow

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D26-green.svg)](https://nodejs.org/)
[![XRPL](https://img.shields.io/badge/XRPL-5.x-brightgreen.svg)](https://xrpl.org/)
[![Vitest](https://img.shields.io/badge/Vitest-4.x-6E9F18.svg)](https://vitest.dev/)
[![Prettier](https://img.shields.io/badge/Prettier-3.x-F7B93E.svg)](https://prettier.io/)
[![ESLint](https://img.shields.io/badge/ESLint-10.x-4B32C3.svg)](https://eslint.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.x-f69220.svg)](https://pnpm.io/)

一个全面的 TypeScript 测试框架，用于 XRPL (XRP 账本) 代币操作，具有针对各种 XRPL 账户标志和功能的广泛集成测试。

## 概述

本项目为 XRPL 代币流提供强大的测试环境，专注于账户配置、信任线管理、代币发行和支付操作。包含针对关键 XRPL 功能 (如 RequireAuth、DepositAuth、GlobalFreeze 和其他账户标志) 的自动化测试。

## 特性

- **全面的 XRPL 集成测试**: 覆盖所有主要 XRPL 代币操作的测试套件
- **账户标志测试**: RequireAuth、DepositAuth、GlobalFreeze、DisallowXRP 等
- **信任线管理**: 创建、授权和追回功能
- **支付流程测试**: 代币转账、XRP 支付和支票操作
- **密钥管理与安全**: 常规密钥 (Regular Key) 分配与主密钥隔离
- **并发与预签名**: 使用 Tickets 实现乱序提交
- **自动钱包资助**: 智能钱包资助，具有余额检查功能
- **并行操作优化**: 使用 Promise.all 优化异步操作
- **网络灵活性**: 精简高效的本地 Docker standalone 测试环境

## 项目结构

```txt
xrpl-token-flow/
├── src/
│   ├── config/
│   │   └── xrpl.config.ts              # XRPL 客户端配置
│   └── services/                       # 核心代币与安全服务
│       ├── transaction.service.ts      # 交易签名与提交（单签与多签）
│       ├── trustline-token.service.ts  # TrustLine 生命周期管理
│       ├── multi-purpose-token.service.ts # MPT 生命周期管理
│       ├── regular-key.service.ts      # 冷热钱包隔离与密钥轮转
│       ├── signer-list.service.ts      # 多签发行方治理
│       ├── escrow.service.ts           # 代币托管 Escrow（XLS-85）
│       ├── credential.service.ts       # KYC 凭证（XLS-70）
│       └── ticket.service.ts           # 离线签名与并发控制
├── tests/
│   ├── setup.ts                        # 全局测试设置
│   ├── setup-local.ts                  # 本地 Docker 测试设置
│   ├── specs/integration/
│   │   ├── trust-line-token/           # Trust Line Token 测试套件
│   │   └── multi-purpose-token/        # Multi-Purpose Token 测试套件
│   └── utils/                          # 共享测试辅助工具
├── docker/                             # Docker rippled 配置
├── docs/                               # 文档
├── .prettierrc                         # Prettier 格式化配置
├── eslint.config.ts                    # ESLint 配置
├── docker-compose.yaml                 # 本地 rippled 容器
├── vitest.config.ts                    # Vitest 配置 (本地 Docker)
├── tsconfig.json                       # TypeScript 项目引用配置
├── tsconfig.src.json                   # 源码 TypeScript 配置
├── tsconfig.test.json                  # 测试 TypeScript 配置
└── package.json                        # 包依赖和脚本
```

## 先决条件

- **Node.js**: >=26
- **pnpm**: 包管理器
- **Docker**: 本地网络测试需要

## 快速开始

1. 克隆仓库并安装依赖:

```bash
pnpm install
```

1. 复制环境变量模板并配置:

```bash
cp .env.example .env
```

1. 在 `.env` 中配置以下环境变量:

```env
# XRPL 配置
# XRPL_ENDPOINT=ws://127.0.0.1:6006
```

## 本地网络测试

使用本地 Docker standalone rippled 运行测试 — 无需水龙头或密钥。本地节点使用 genesis 账户进行钱包资助，并通过 `docker/rippled.cfg` 中的 `[voting]` 配置与主网一致的 reserve (1 XRP base / 0.2 XRP owner) ([rippled 1.11.0+](https://github.com/XRPLF/rippled/pull/4319))。配置中还设置了 `[network_id]` 为 2 (devnet) — xrpl.js v5 在 `server_info` 缺少 network ID 时会拒绝连接，且 ≤ 1024 的值不会在交易中添加 `NetworkID` 字段。

```bash
# 启动 rippled 容器
pnpm docker:up

# 运行测试
pnpm test

# 停止 rippled 容器
pnpm docker:down
```

## 脚本

| 命令                 | 描述                             |
| -------------------- | -------------------------------- |
| `pnpm test`          | 使用本地 Docker rippled 运行测试 |
| `pnpm test <name>`   | 运行指定测试套件                 |
| `pnpm test:watch`    | 以监听模式运行测试               |
| `pnpm test:coverage` | 运行测试并生成覆盖率报告         |
| `pnpm check`         | 运行类型检查 + ESLint + Prettier |
| `pnpm fix`           | 自动修复代码检查和格式化问题     |
| `pnpm docker:up`     | 启动本地 rippled 容器            |
| `pnpm docker:down`   | 停止本地 rippled 容器            |

## 测试套件

| 分类                | 文档                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| Trust Line Token    | [docs/trust-line-token.zh-CN.md](docs/trust-line-token.zh-CN.md)       |
| Multi-Purpose Token | [docs/multi-purpose-token.zh-CN.md](docs/multi-purpose-token.zh-CN.md) |

## 许可证

MIT
