import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { Contract } from "ethers";
import { deployContract, getFactory, getMock, getSafe, getSafeProxyRuntimeCode } from "../utils/setup";
import { AddressZero } from "@ethersproject/constants";
import { calculateChainSpecificProxyAddress, calculateProxyAddress, calculateProxyAddressWithCallback } from "../../src/utils/proxies";
import { chainId } from "./../utils/encoding";

describe("ProxyFactory", () => {
    const SINGLETON_SOURCE = `
    contract Test {
        address _singleton;
        address public creator;
        bool public isInitialized;
        constructor() payable {
            creator = msg.sender;
        }

        function init() public {
            require(!isInitialized, "Is initialized");
            creator = msg.sender;
            isInitialized = true;
        }

        function masterCopy() public pure returns (address) {
            return address(0);
        }

        function forward(address to, bytes memory data) public returns (bytes memory result) {
            (,result) = to.call(data);
        }
    }`;

    const setupTests = hre.deployments.createFixture(async ({ deployments }) => {
        await deployments.fixture();
        const signers = await hre.ethers.getSigners();
        const [user1] = signers;
        const singleton = await deployContract(user1, SINGLETON_SOURCE);
        return {
            safe: await getSafe({ owners: [user1.address] }),
            factory: await getFactory(),
            mock: await getMock(),
            singleton,
        };
    });

    describe("createProxyWithNonce", () => {
        const saltNonce = 42;

        it("should revert if singleton address is not a contract", async () => {
            const { factory } = await setupTests();
            const randomAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
            await expect(factory.createProxyWithNonce(randomAddress, "0x", saltNonce)).to.be.revertedWith(
                "Singleton contract not deployed",
            );
        });

        it("should revert with invalid initializer", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            await expect(factory.createProxyWithNonce(singletonAddress, "0x42baddad", saltNonce)).to.be.revertedWithoutReason();
        });

        it("should emit event without initializing", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            const initCode = "0x";
            const proxyAddress = await calculateProxyAddress(factory, singletonAddress, initCode, saltNonce);
            await expect(factory.createProxyWithNonce(singletonAddress, initCode, saltNonce))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);
            const proxy = singleton.attach(proxyAddress) as Contract;

            expect(await proxy.creator()).to.be.eq(AddressZero);
            expect(await proxy.isInitialized()).to.be.eq(false);
            expect(await proxy.masterCopy()).to.be.eq(singletonAddress);
            expect(await singleton.masterCopy()).to.be.eq(AddressZero);
            expect(await hre.ethers.provider.getCode(proxyAddress)).to.be.eq(await getSafeProxyRuntimeCode());
        });

        it("should emit event with initializing", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            const factoryAddress = await factory.getAddress();

            const initCode = singleton.interface.encodeFunctionData("init", []);
            const proxyAddress = await calculateProxyAddress(factory, singletonAddress, initCode, saltNonce);
            await expect(factory.createProxyWithNonce(singletonAddress, initCode, saltNonce))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);
            const proxy = singleton.attach(proxyAddress) as Contract;
            expect(await proxy.creator()).to.be.eq(factoryAddress);
            expect(await proxy.isInitialized()).to.be.eq(true);
            expect(await proxy.masterCopy()).to.be.eq(singletonAddress);
            expect(await singleton.masterCopy()).to.be.eq(AddressZero);
            expect(await hre.ethers.provider.getCode(proxyAddress)).to.be.eq(await getSafeProxyRuntimeCode());
        });

        it("should not be able to deploy same proxy twice", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();

            const initCode = singleton.interface.encodeFunctionData("init", []);
            const proxyAddress = await calculateProxyAddress(factory, singletonAddress, initCode, saltNonce);
            await expect(factory.createProxyWithNonce(singletonAddress, initCode, saltNonce))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);
            await expect(factory.createProxyWithNonce(singletonAddress, initCode, saltNonce)).to.be.revertedWith("Create2 call failed");
        });
    });

    describe("createChainSpecificProxyWithNonce", () => {
        const saltNonce = 42;

        it("should revert if singleton address is not a contract", async () => {
            const { factory } = await setupTests();
            await expect(factory.createProxyWithNonce(AddressZero, "0x", saltNonce)).to.be.revertedWith("Singleton contract not deployed");
        });

        it("should revert with invalid initializer", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();

            await expect(factory.createProxyWithNonce(singletonAddress, "0x42baddad", saltNonce)).to.be.revertedWithoutReason();
        });

        it("should emit event without initializing", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            const initCode = "0x";
            const proxyAddress = await calculateProxyAddress(factory, singletonAddress, initCode, saltNonce);
            await expect(factory.createProxyWithNonce(singletonAddress, initCode, saltNonce))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);
            const proxy = singleton.attach(proxyAddress) as Contract;
            expect(await proxy.creator()).to.be.eq(AddressZero);
            expect(await proxy.isInitialized()).to.be.eq(false);
            expect(await proxy.masterCopy()).to.be.eq(singletonAddress);
            expect(await singleton.masterCopy()).to.be.eq(AddressZero);
            expect(await hre.ethers.provider.getCode(proxyAddress)).to.be.eq(await getSafeProxyRuntimeCode());
        });

        it("should emit event with initializing", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            const factoryAddress = await factory.getAddress();
            const initCode = singleton.interface.encodeFunctionData("init", []);
            const proxyAddress = await calculateProxyAddress(factory, singletonAddress, initCode, saltNonce);
            await expect(factory.createProxyWithNonce(singletonAddress, initCode, saltNonce))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);
            const proxy = singleton.attach(proxyAddress) as Contract;
            expect(await proxy.creator()).to.be.eq(factoryAddress);
            expect(await proxy.isInitialized()).to.be.eq(true);
            expect(await proxy.masterCopy()).to.be.eq(singletonAddress);
            expect(await singleton.masterCopy()).to.be.eq(AddressZero);
            expect(await hre.ethers.provider.getCode(proxyAddress)).to.be.eq(await getSafeProxyRuntimeCode());
        });

        it("should deploy proxy to create2 address with chainid included in salt", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            const provider = hre.ethers.provider;
            const initCode = singleton.interface.encodeFunctionData("init", []);
            const proxyAddress = await calculateChainSpecificProxyAddress(factory, singletonAddress, initCode, saltNonce, await chainId());
            expect(await provider.getCode(proxyAddress)).to.eq("0x");

            await factory.createChainSpecificProxyWithNonce(singletonAddress, initCode, saltNonce);

            expect(await provider.getCode(proxyAddress)).to.be.eq(await getSafeProxyRuntimeCode());
        });

        it("should not be able to deploy same proxy twice", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            const initCode = singleton.interface.encodeFunctionData("init", []);
            const proxyAddress = await calculateProxyAddress(factory, singletonAddress, initCode, saltNonce);
            await expect(factory.createProxyWithNonce(singletonAddress, initCode, saltNonce))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);
            await expect(factory.createProxyWithNonce(singletonAddress, initCode, saltNonce)).to.be.revertedWith("Create2 call failed");
        });
    });

    describe("createProxyWithCallback", () => {
        const saltNonce = 42;

        it("check callback is invoked", async () => {
            const { factory, mock, singleton } = await setupTests();
            const mockAddress = await mock.getAddress();
            const singletonAddress = await singleton.getAddress();
            const factoryAddress = await factory.getAddress();

            const callback = await hre.ethers.getContractAt("IProxyCreationCallback", mockAddress);
            const initCode = singleton.interface.encodeFunctionData("init", []);

            const proxyAddress = await calculateProxyAddressWithCallback(factory, singletonAddress, initCode, saltNonce, mockAddress);
            await expect(factory.createProxyWithCallback(singletonAddress, initCode, saltNonce, mockAddress))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);

            expect(await mock.invocationCount()).to.be.deep.equal(1n);

            const callbackData = callback.interface.encodeFunctionData("proxyCreated", [proxyAddress, factoryAddress, initCode, saltNonce]);
            expect(await mock.invocationCountForMethod(callbackData)).to.eq(1n);
        });

        it("check callback error cancels deployment", async () => {
            const { factory, mock, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            const mockAddress = await mock.getAddress();
            const initCode = "0x";
            await mock.givenAnyRevert();
            await expect(
                factory.createProxyWithCallback(singletonAddress, initCode, saltNonce, mockAddress),
                "Should fail if callback fails",
            ).to.be.reverted;

            await mock.reset();
            // Should be successfull now
            const proxyAddress = await calculateProxyAddressWithCallback(factory, singletonAddress, initCode, saltNonce, mockAddress);
            await expect(factory.createProxyWithCallback(singletonAddress, initCode, saltNonce, mockAddress))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);
        });

        it("should work without callback", async () => {
            const { factory, singleton } = await setupTests();
            const singletonAddress = await singleton.getAddress();
            const initCode = "0x";
            const proxyAddress = await calculateProxyAddressWithCallback(factory, singletonAddress, initCode, saltNonce, AddressZero);
            await expect(factory.createProxyWithCallback(singletonAddress, initCode, saltNonce, AddressZero))
                .to.emit(factory, "ProxyCreation")
                .withArgs(proxyAddress, singletonAddress);
            const proxy = singleton.attach(proxyAddress) as Contract;
            expect(await proxy.creator()).to.be.eq(AddressZero);
            expect(await proxy.isInitialized()).to.be.eq(false);
            expect(await proxy.masterCopy()).to.be.eq(singletonAddress);
            expect(await singleton.masterCopy()).to.be.eq(AddressZero);
            expect(await hre.ethers.provider.getCode(proxyAddress)).to.be.eq(await getSafeProxyRuntimeCode());
        });
    });
});
