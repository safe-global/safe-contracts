import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import { getFactory, getSafe, getSafeL2Singleton, getSafeSingleton } from "../utils/setup";
import { sameHexString } from "../utils/strings";
import { executeContractCallWithSigners } from "../../src";
import { EXPECTED_SAFE_STORAGE_LAYOUT, getContractStorageLayout } from "../utils/storage";

type HardhatTraceLog = {
    depth: number;
    gas: number;
    gasCost: number;
    op: string;
    pc: number;
    stack: string[];
    storage: { [key: string]: string };
    memory: string;
};

type HardhatTrace = {
    failed: boolean;
    gas: number;
    returnValue: string;
    structLogs: HardhatTraceLog[];
};

describe("SafeToL2Setup", () => {
    const setupTests = deployments.createFixture(async ({ deployments }) => {
        await deployments.fixture();
        const safeToL2SetupAddress = (await deployments.get("SafeToL2Setup")).address;
        const safeToL2SetupLib = await hre.ethers.getContractAt("SafeToL2Setup", safeToL2SetupAddress);
        const signers = await hre.ethers.getSigners();
        const safeSingleton = await getSafeSingleton();
        const safeL2 = await getSafeL2Singleton();
        const proxyFactory = await getFactory();
        return {
            safeToL2SetupLib,
            signers,
            safeSingleton,
            safeL2,
            proxyFactory,
        };
    });

    describe("L2", () => {
        before(function () {
            if (hre.network.config.chainId === 1) {
                this.skip();
            }
        });

        describe("setupToL2", () => {
            it("follows the expected storage layout", async () => {
                const safeStorageLayout = await getContractStorageLayout(hre, "SafeToL2Setup");

                expect(safeStorageLayout).to.deep.eq(EXPECTED_SAFE_STORAGE_LAYOUT);
            });

            it("should emit an event", async () => {
                const {
                    safeSingleton,
                    safeL2,
                    proxyFactory,
                    signers: [user1],
                    safeToL2SetupLib,
                } = await setupTests();
                const safeL2SingletonAddress = await safeL2.getAddress();
                const safeToL2SetupCall = safeToL2SetupLib.interface.encodeFunctionData("setupToL2", [safeL2SingletonAddress]);

                const setupData = safeL2.interface.encodeFunctionData("setup", [
                    [user1.address],
                    1,
                    safeToL2SetupLib.target,
                    safeToL2SetupCall,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    0,
                    ethers.ZeroAddress,
                ]);
                const safeAddress = await proxyFactory.createProxyWithNonce.staticCall(safeSingleton.target, setupData, 0);

                await expect(proxyFactory.createProxyWithNonce(safeSingleton.target, setupData, 0))
                    .to.emit(safeToL2SetupLib.attach(safeAddress), "ChangedMasterCopy")
                    .withArgs(safeL2SingletonAddress);
            });

            it("only allows singleton address that contains code", async () => {
                const {
                    safeSingleton,
                    safeL2,
                    proxyFactory,
                    signers: [user1, user2],
                    safeToL2SetupLib,
                } = await setupTests();
                const safeToL2SetupCall = safeToL2SetupLib.interface.encodeFunctionData("setupToL2", [user2.address]);

                const setupData = safeL2.interface.encodeFunctionData("setup", [
                    [user1.address],
                    1,
                    safeToL2SetupLib.target,
                    safeToL2SetupCall,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    0,
                    ethers.ZeroAddress,
                ]);

                // For some reason, hardhat can't infer the revert reason
                await expect(proxyFactory.createProxyWithNonce(safeSingleton.target, setupData, 0)).to.be.reverted;
            });

            it("can be used only via DELEGATECALL opcode", async () => {
                const { safeToL2SetupLib } = await setupTests();
                const randomAddress = ethers.hexlify(ethers.randomBytes(20));

                await expect(safeToL2SetupLib.setupToL2(randomAddress)).to.be.rejectedWith(
                    "SafeToL2Setup should only be called via delegatecall",
                );
            });

            it("can only be used through Safe initialization process", async () => {
                const {
                    safeToL2SetupLib,
                    signers: [user1],
                } = await setupTests();
                const safe = await getSafe({ owners: [user1.address] });
                const safeToL2SetupLibAddress = await safeToL2SetupLib.getAddress();

                await expect(
                    executeContractCallWithSigners(safe, safeToL2SetupLib, "setupToL2", [safeToL2SetupLibAddress], [user1], true),
                ).to.be.rejectedWith("Safe must have not executed any tx");
            });

            it("changes the expected storage slot without touching the most important ones", async () => {
                if (hre.network.zksync) {
                    // zksync doesn't support hardhat style traces
                    // and their traces only include calls without the storage changes
                    return;
                }

                const {
                    safeSingleton,
                    safeL2,
                    proxyFactory,
                    signers: [user1],
                    safeToL2SetupLib,
                } = await setupTests();

                const safeL2SingletonAddress = await safeL2.getAddress();
                const safeToL2SetupLibAddress = await safeToL2SetupLib.getAddress();
                const safeToL2SetupCall = safeToL2SetupLib.interface.encodeFunctionData("setupToL2", [safeL2SingletonAddress]);

                const setupData = safeL2.interface.encodeFunctionData("setup", [
                    [user1.address],
                    1,
                    safeToL2SetupLib.target,
                    safeToL2SetupCall,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    0,
                    ethers.ZeroAddress,
                ]);
                const safeAddress = await proxyFactory.createProxyWithNonce.staticCall(safeSingleton.target, setupData, 0);

                const transaction = await (await proxyFactory.createProxyWithNonce(safeSingleton.target, setupData, 0)).wait();
                if (!transaction?.hash) {
                    throw new Error("No transaction hash");
                }
                // I decided to use tracing for this test because it gives an overview of all the storage slots involved in the transaction
                // Alternatively, one could use `eth_getStorageAt` to check storage slots directly
                // But that would not guarantee that other storage slots were not touched during the transaction
                const trace = (await hre.network.provider.send("debug_traceTransaction", [transaction.hash])) as HardhatTrace;
                // Hardhat uses the most basic struct/opcode logger tracer: https://geth.ethereum.org/docs/developers/evm-tracing/built-in-tracers#struct-opcode-logger
                // To find the "snapshot" of the storage before the DELEGATECALL into the library, we need to find the first DELEGATECALL opcode calling into the library
                // To do that, we search for the DELEGATECALL opcode with the stack input pointing to the library address
                const delegateCallIntoTheLib = trace.structLogs.findIndex(
                    (log) =>
                        log.op === "DELEGATECALL" &&
                        sameHexString(log.stack[log.stack.length - 2], ethers.zeroPadValue(safeToL2SetupLibAddress, 32).slice(2)),
                );
                const preDelegateCallStorage = trace.structLogs[delegateCallIntoTheLib].storage;

                // The SafeSetup event is emitted after the Safe is set up
                // To get the storage snapshot after the Safe is set up, we need to find the LOG2 opcode with the topic input on the stack equal the SafeSetup event signature
                const SAFE_SETUP_EVENT_SIGNATURE = safeSingleton.interface.getEvent("SafeSetup").topicHash;
                const postSafeSetup = trace.structLogs.find(
                    (log, index) =>
                        log.op === "LOG2" &&
                        log.stack[log.stack.length - 3] === SAFE_SETUP_EVENT_SIGNATURE.slice(2) &&
                        index > delegateCallIntoTheLib,
                );
                if (!postSafeSetup) {
                    throw new Error("No SafeSetup event");
                }
                const postSafeSetupStorage = postSafeSetup.storage;

                for (const [key, value] of Object.entries(postSafeSetupStorage)) {
                    // The slot key 0 is the singleton storage slot, it must equal the L2 singleton address
                    if (sameHexString(key, ethers.zeroPadValue("0x00", 32))) {
                        expect(sameHexString(ethers.zeroPadValue(safeL2SingletonAddress, 32), value)).to.be.true;
                    } else {
                        // All other storage slots must be the same as before the DELEGATECALL
                        if (key in preDelegateCallStorage) {
                            expect(sameHexString(preDelegateCallStorage[key], value)).to.be.true;
                        } else {
                            // This special case is needed because the SafeToL2Setup library inherits the SafeStorage library
                            // And that makes the tracer report all the storage slots in the SafeStorage library as well
                            // Even though if they were not touched during the transaction
                            expect(sameHexString(value, "0".repeat(64))).to.be.true;
                        }
                    }
                }

                // Double-check that the storage slot was changed at the end of the transaction
                const singletonInStorage = await hre.ethers.provider.getStorage(safeAddress, ethers.zeroPadValue("0x00", 32));
                expect(sameHexString(singletonInStorage, ethers.zeroPadValue(safeL2SingletonAddress, 32))).to.be.true;
            });
        });
    });

    describe("L1", () => {
        before(function () {
            if (hre.network.config.chainId !== 1) {
                this.skip();
            }
        });

        it("should be a noop when the chain id is 1 [@L1]", async () => {
            const {
                safeSingleton,
                safeL2,
                proxyFactory,
                signers: [user1],
                safeToL2SetupLib,
            } = await setupTests();
            const safeSingletonAddress = await safeSingleton.getAddress();
            const safeL2SingletonAddress = await safeL2.getAddress();
            const safeToL2SetupCall = safeToL2SetupLib.interface.encodeFunctionData("setupToL2", [safeL2SingletonAddress]);

            const setupData = safeL2.interface.encodeFunctionData("setup", [
                [user1.address],
                1,
                safeToL2SetupLib.target,
                safeToL2SetupCall,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                0,
                ethers.ZeroAddress,
            ]);
            const safeAddress = await proxyFactory.createProxyWithNonce.staticCall(safeSingleton.target, setupData, 0);

            await expect(proxyFactory.createProxyWithNonce(safeSingletonAddress, setupData, 0)).to.not.emit(
                safeToL2SetupLib.attach(safeAddress),
                "ChangedMasterCopy",
            );
            const singletonInStorage = await hre.ethers.provider.getStorage(safeAddress, ethers.zeroPadValue("0x00", 32));
            expect(sameHexString(singletonInStorage, ethers.zeroPadValue(safeSingletonAddress, 32))).to.be.true;
        });
    });
});
