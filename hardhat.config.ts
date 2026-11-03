import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig, HttpNetworkUserConfig } from "hardhat/types";
import "hardhat-deploy";
import type { DeterministicDeploymentInfo } from "hardhat-deploy/dist/types";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getSingletonFactoryInfo } from "@safe-global/safe-singleton-factory";

import "./src/tasks/local_verify";
import "./src/tasks/deploy_contracts";
import "./src/tasks/show_codesize";

const argv = yargs(hideBin(process.argv))
    .option("network", {
        type: "string",
        default: "hardhat",
    })
    .help(false)
    .version(false)
    .parseSync();

dotenv.config({ quiet: true });
const {
    NODE_URL,
    INFURA_KEY,
    MNEMONIC,
    ETHERSCAN_API_KEY,
    PK,
    SOLIDITY_VERSION,
    SOLIDITY_SETTINGS,
    HARDHAT_CHAIN_ID,
    HARDHAT_SECP256R1_PRECOMPILE,
    HARDHAT_ENABLE_GAS_REPORTER,
} = process.env;

if (["mainnet", "sepolia"].includes(argv.network) && INFURA_KEY === undefined) {
    throw new Error(`Could not find Infura key in env, unable to connect to network ${argv.network}`);
}

const DEFAULT_MNEMONIC = "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";
const DEFAULT_SOLIDITY_VERSION = "0.7.6";

const sharedNetworkConfig: HttpNetworkUserConfig = {};
if (PK) {
    sharedNetworkConfig.accounts = [PK];
} else {
    sharedNetworkConfig.accounts = {
        mnemonic: MNEMONIC ?? DEFAULT_MNEMONIC,
    };
}
// Do not append the metadata hash to the bytecode: it is never executed and costs 200 gas per byte to deploy.
const noMetadataHashSettings = { metadata: { bytecodeHash: "none" as const } };

const soliditySettings = SOLIDITY_SETTINGS
    ? { ...noMetadataHashSettings, ...JSON.parse(SOLIDITY_SETTINGS) }
    : noMetadataHashSettings;

const deterministicDeployment = (network: string): DeterministicDeploymentInfo => {
    const info = getSingletonFactoryInfo(parseInt(network));
    if (!info) {
        throw new Error(
            `Safe factory not found for network ${network}. You can request a new deployment at https://github.com/safe-global/safe-singleton-factory.`,
        );
    }
    return {
        factory: info.address,
        deployer: info.signerAddress,
        funding: `${BigInt(info.gasLimit) * BigInt(info.gasPrice)}`,
        signedTx: info.transaction,
    };
};

const userConfig: HardhatUserConfig = {
    paths: {
        artifacts: "build/artifacts",
        cache: "build/cache",
        deploy: "src/deploy",
        sources: "contracts",
    },
    typechain: {
        outDir: "typechain-types",
        target: "ethers-v6",
    },
    solidity: {
        compilers: [
            { version: SOLIDITY_VERSION ?? DEFAULT_SOLIDITY_VERSION, settings: soliditySettings },
            { version: DEFAULT_SOLIDITY_VERSION, settings: noMetadataHashSettings },
        ],
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
            blockGasLimit: 100000000,
            gas: 100000000,
            chainId: Number(HARDHAT_CHAIN_ID ?? 31337),
            enableRip7212: HARDHAT_SECP256R1_PRECOMPILE === "1",
        },
        mainnet: {
            ...sharedNetworkConfig,
            url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
        },
        sepolia: {
            ...sharedNetworkConfig,
            url: `https://sepolia.infura.io/v3/${INFURA_KEY}`,
        },
        gnosis: {
            ...sharedNetworkConfig,
            url: `https://rpc.gnosischain.com`,
        },
        zksync: {
            ...sharedNetworkConfig,
            url: "https://mainnet.era.zksync.io",
        },
        ...(NODE_URL
            ? {
                  custom: {
                      ...sharedNetworkConfig,
                      url: NODE_URL,
                  },
              }
            : {}),
    },
    deterministicDeployment,
    namedAccounts: {
        deployer: 0,
    },
    mocha: {
        timeout: 2000000,
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    },
    gasReporter: {
        enabled: HARDHAT_ENABLE_GAS_REPORTER === "1",
    },
};

export default userConfig;
