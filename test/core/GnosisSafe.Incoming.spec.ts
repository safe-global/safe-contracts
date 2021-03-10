import { expect } from "chai";
import hre, { deployments, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { deployContract, getSafeWithOwners } from "../utils/setup";
import { parseEther } from "@ethersproject/units";

describe("GnosisSafe", async () => {

    const [user1] = waffle.provider.getWallets();

    const setupTests = deployments.createFixture(async ({ deployments }) => {
        await deployments.fixture();
        let source = `
        contract Test {
            function transferEth(address payable safe) public payable returns (bool success) {
                safe.transfer(msg.value);
            }
            function sendEth(address payable safe) public payable returns (bool success) {
                require(safe.send(msg.value));
            }
        }`
        return {
            safe: await getSafeWithOwners([user1.address]),
            caller: await deployContract(user1, source)
        }
    })

    describe("fallback", async () => {

        it('should be able to receive ETH via transfer', async () => {
            const { safe, caller } = await setupTests()
            // Notes: It is not possible to load storage + a call + emit event with 2300 gas
            // Test Validator
            await caller.transferEth(safe.address, { value: parseEther("1") })
            await expect(await hre.ethers.provider.getBalance(safe.address)).to.be.deep.eq(parseEther("1"))
        })

        it('should be able to receive ETH via send', async () => {
            const { safe, caller } = await setupTests()
            // Notes: It is not possible to load storage + a call + emit event with 2300 gas
            // Test Validator
            await caller.sendEth(safe.address, { value: parseEther("1") })
            await expect(await hre.ethers.provider.getBalance(safe.address)).to.be.deep.eq(parseEther("1"))
        })

        it('should throw for incoming eth with data', async () => {
            const { safe } = await setupTests()
            await expect(
                user1.sendTransaction({to: safe.address, value: 23, data: "0xbaddad"})
            ).to.be.revertedWith("fallback function is not payable and was called with value 23")
        })
    })
})