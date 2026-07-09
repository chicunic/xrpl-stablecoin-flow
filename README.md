# XRPL Token Flow

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D26-green.svg)](https://nodejs.org/)
[![XRPL](https://img.shields.io/badge/XRPL-5.x-brightgreen.svg)](https://xrpl.org/)
[![Vitest](https://img.shields.io/badge/Vitest-4.x-6E9F18.svg)](https://vitest.dev/)
[![Prettier](https://img.shields.io/badge/Prettier-3.x-F7B93E.svg)](https://prettier.io/)
[![ESLint](https://img.shields.io/badge/ESLint-10.x-4B32C3.svg)](https://eslint.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.x-f69220.svg)](https://pnpm.io/)

A comprehensive TypeScript testing framework for XRPL (XRP Ledger) token operations, featuring extensive integration tests for various XRPL account flags and features.

## Overview

This project provides a robust testing environment for XRPL token flows, focusing on account configuration, trust line management, token issuance, and payment operations. It includes automated testing for critical XRPL features like RequireAuth, DepositAuth, GlobalFreeze, and other account flags.

## Features

- **Comprehensive XRPL Integration Testing**: Test suites covering all major XRPL token operations
- **Account Flag Testing**: RequireAuth, DepositAuth, GlobalFreeze, DisallowXRP, and more
- **Trust Line Management**: Creation, authorization, and clawback functionality
- **Payment Flow Testing**: Token transfers, XRP payments, and check operations
- **Key Management & Security**: Regular Key assignment and Master Key disable (Cold/Hot wallet isolation)
- **Out-of-Order Execution**: Tickets for presigned and concurrent transactions
- **Automated Wallet Funding**: Smart wallet funding with balance checking
- **Parallel Operation Optimization**: Optimized async operations using Promise.all
- **Network Flexibility**: Streamlined for fast, isolated local testing via Docker standalone rippled

## Project Structure

```txt
xrpl-token-flow/
├── src/
│   ├── config/
│   │   └── xrpl.config.ts              # XRPL client configuration
│   └── services/                       # Core Token & Security Services
│       ├── transaction.service.ts      # Transaction signing and submission (single & multisig)
│       ├── trustline-token.service.ts  # TrustLine lifecycle management
│       ├── multi-purpose-token.service.ts # MPT lifecycle management
│       ├── regular-key.service.ts      # Hot/Cold wallet isolation
│       ├── signer-list.service.ts      # Multisig issuer governance
│       ├── escrow.service.ts           # Token escrow (XLS-85)
│       ├── credential.service.ts       # KYC credentials (XLS-70)
│       └── ticket.service.ts           # Offline & concurrent signing
├── tests/
│   ├── setup.ts                        # Global test setup
│   ├── setup-local.ts                  # Local Docker test setup
│   ├── specs/integration/
│   │   ├── trust-line-token/           # Trust Line Token test suites
│   │   └── multi-purpose-token/        # Multi-Purpose Token test suites
│   └── utils/                          # Shared test helpers
├── docker/                             # Docker rippled configuration
├── docs/                               # Documentation
├── .prettierrc                         # Prettier formatter
├── eslint.config.ts                    # ESLint configuration
├── docker-compose.yaml                 # Local rippled container
├── vitest.config.ts                    # Vitest configuration (local Docker)
├── tsconfig.json                       # TypeScript project references
├── tsconfig.src.json                   # Source TypeScript configuration
├── tsconfig.test.json                  # Tests TypeScript configuration
└── package.json                        # Package dependencies and scripts
```

## Prerequisites

- **Node.js**: >=26
- **pnpm**: Package manager
- **Docker**: Required for local network testing

## Getting Started

1. Clone the repository and install dependencies:

```bash
pnpm install
```

1. Copy the environment variable template and configure:

```bash
cp .env.example .env
```

1. Configure the following environment variables in `.env`:

```env
# XRPL Configuration
# XRPL_ENDPOINT=ws://127.0.0.1:6006
```

## Local Network Testing

Run tests against a local standalone rippled in Docker — no faucet or secret key needed. The local node uses the genesis account for wallet funding and is configured with mainnet-matching reserves (1 XRP base / 0.2 XRP owner) via the `[voting]` stanza in `docker/rippled.cfg` ([rippled 1.11.0+](https://github.com/XRPLF/rippled/pull/4319)). The config also sets `[network_id]` to 2 (devnet) — xrpl.js v5 refuses to connect when `server_info` lacks a network ID, and values ≤ 1024 keep transactions free of the `NetworkID` field.

```bash
# Start rippled container
pnpm docker:up

# Run tests against local network
pnpm test

# Stop rippled container
pnpm docker:down
```

## Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `pnpm test`          | Run all tests using local Docker rippled |
| `pnpm test <name>`   | Run a specific test suite                |
| `pnpm test:watch`    | Run tests in watch mode                  |
| `pnpm test:coverage` | Run tests with coverage report           |
| `pnpm check`         | Run type checking + ESLint + Prettier    |
| `pnpm fix`           | Auto-fix linting and formatting issues   |
| `pnpm docker:up`     | Start local rippled container            |
| `pnpm docker:down`   | Stop local rippled container             |

## Test Suites

| Category            | Documentation                                              |
| ------------------- | ---------------------------------------------------------- |
| Trust Line Token    | [docs/trust-line-token.md](docs/trust-line-token.md)       |
| Multi-Purpose Token | [docs/multi-purpose-token.md](docs/multi-purpose-token.md) |

## License

MIT
