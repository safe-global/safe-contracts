# Safe Smart Account

[![npm version](https://badge.fury.io/js/%40safe-global%2Fsafe-smart-account.svg)](https://badge.fury.io/js/%40safe-global%2Fsafe-smart-account)
[![Build Status](https://github.com/safe-global/safe-smart-account/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/safe-global/safe-smart-account/actions)
[![Coverage Status](https://coveralls.io/repos/github/safe-global/safe-smart-account/badge.svg?branch=main)](https://coveralls.io/github/safe-global/safe-smart-account)

> [!WARNING]
> **This branch contains changes that are under development.** To use the latest audited version, make sure to use the correct commit. The tagged versions that are used by the Safe team can be found in the [releases](https://github.com/safe-global/safe-smart-account/releases).

## Usage

### Install requirements with npm:

```bash
npm i
```

### Testing

To run the tests:

```bash
npm run build
npm run test
```

Optionally, if you want to run the ERC-4337 compatibility test, it uses a live bundler and node, so it contains some prerequisites:

1. Define the environment variables:

```
ERC4337_TEST_BUNDLER_URL=
ERC4337_TEST_NODE_URL=
ERC4337_TEST_SINGLETON_ADDRESS=
ERC4337_TEST_SAFE_FACTORY_ADDRESS=
MNEMONIC=
```

2. Pre-fund the executor account derived from the mnemonic with some Native Token to cover the deployment of an ERC-4337 module and the pre-fund of the Safe for the test operation.

### Deployments

A collection of the different Safe contract deployments and their addresses can be found in the [Safe deployments](https://github.com/safe-global/safe-deployments) repository.

To add support for a new network follow the steps of the `Deploy` section and create a PR in the [Safe deployments](https://github.com/safe-global/safe-deployments) repository.

### Deploy

> [!WARNING]
> **Make sure to use the correct commit when deploying the contracts.** Any change to the contract code or compiler settings changes the addresses. The tagged versions that are used by the Safe team can be found in the [releases](https://github.com/safe-global/safe-smart-account/releases).

> **Current version:** The latest release is [v1.5.0](https://github.com/safe-global/safe-smart-account/tree/v1.5.0) on the commit [dc437e8](https://github.com/safe-global/safe-smart-account/commit/dc437e8fba8b4805d76bcbd1c668c9fd3d1e83be)

This will deploy the contracts deterministically and verify the contracts on Etherscan using [Solidity 0.7.6](https://github.com/ethereum/solidity/releases/tag/v0.7.6) by default.

Preparation:

- Set `MNEMONIC` in `.env`
- Set `INFURA_KEY` in `.env`

```bash
npm run deploy-all <network>
```

This will perform the following steps

```bash
npm run build
npx hardhat --network <network> deploy
npx hardhat --network <network> sourcify
npx hardhat --network <network> etherscan-verify
npx hardhat --network <network> local-verify
```

#### Custom Networks

It is possible to use the `NODE_URL` env var to connect to any EVM-based network via an RPC endpoint. This connection can then be used with the `custom` network.

E.g. to deploy the Safe contract suite on that network you would run `npm run deploy-all custom`.

The resulting addresses should be the same on all networks.

Note: Addresses will vary if contract code is changed or a different Solidity version is used.

#### Replay protection ([EIP-155](https://eips.ethereum.org/EIPS/eip-155))

Some networks require replay protection, making it incompatible with the default deployment process as it relies on a presigned transaction without replay protection (see <https://github.com/Arachnid/deterministic-deployment-proxy>).

Safe Smart Account contracts use a different deterministic deployment proxy (<https://github.com/safe-global/safe-singleton-factory>). To make sure that the latest version of this package is installed, run `npm i --save-dev @safe-global/safe-singleton-factory` before deployment. For more information, including deploying the factory to a new network, please refer to the factory repository.

Note: This will result in different addresses compared to hardhat's default deterministic deployment process.

### Verify contract

This command will use the deployment artifacts to compile the contracts and compare them to the onchain code

```bash
npx hardhat --network <network> local-verify
```

This command will upload the contract source to Etherscan

```bash
npx hardhat --network <network> etherscan-verify
```

## Documentation

- [Safe developer portal](http://docs.safe.global)
- [Error codes](docs/error_codes.md)
- [Coding guidelines](docs/guidelines.md)

## Audits and Formal Verification

- [for Version 1.5.0 by Certora & Ackee](docs/audit_1_5_0.md)
- [for Version 1.4.0/1.4.1 by Ackee Blockchain](docs/audit_1_4_0.md)
- [for Version 1.3.0 by G0 Group, Certora & Nethermind](docs/audit_1_3_0.md)
- [for Version 1.2.0 by G0 Group](docs/audit_1_2_0.md)
- [for Version 1.1.1 by G0 Group](docs/audit_1_1_1.md)
- [for Version 1.0.0 by Runtime Verification](docs/rv_1_0_0.md)
- [for Version 0.0.1 by Alexey Akhunov](docs/alexey_audit.md)

## Security and Liability

All contracts are WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

## License

All smart contracts are released under LGPL-3.0
