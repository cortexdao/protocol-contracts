const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils;

const GenericExecutor = artifacts.require("GenericExecutor");
const ContractA = artifacts.require("ContractA");

const APYStrategyExecutor = artifacts.require("APYStrategyExecutor");
const APYContractA = artifacts.require("APYContractA");

const { expectEvent } = require("@openzeppelin/test-helpers");

contract("Test GenericExecutor", async (accounts) => {
  it("Execution Test GenericExecutor", async () => {
    const A = await ContractA.new()
    const iA = new ethers.utils.Interface(ContractA.abi)
    const exec = await GenericExecutor.new()

    const trx = await exec.execute(
      [
        [A.address, iA.encodeFunctionData('executeA', [100])],
      ]
    )
  })

  it("Execution Test APYStrategyExecutor", async () => {
    const A = await APYContractA.new()
    const iA = new ethers.utils.Interface(APYContractA.abi)
    const exec = await APYStrategyExecutor.new();

    const trx = await exec.execute(
      [
        [A.address, iA.encodeFunctionData('executeA', [100])],
      ]
    )
  })
})