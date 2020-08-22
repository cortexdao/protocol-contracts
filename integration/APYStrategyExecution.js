const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils


const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent,
  expectRevert,
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const APYStrategyExecutor = artifacts.require("APYStrategyExecutor");
const APYContractA = artifacts.require("APYContractA");
const APYContractB = artifacts.require("APYContractB");
const AInterface = new ethers.utils.Interface(APYContractA.abi)
const BInterface = new ethers.utils.Interface(APYContractB.abi)
const encodeA = AInterface.encodeFunctionData('executeA', [100])
const encodeB = BInterface.encodeFunctionData('executeB', [1000])

console.log(encodeA)
console.log(encodeB)

contract("APYStrategyExecution", async (accounts) => {
  describe('Example Execution', async () => {
    it('Basic Calls', async () => {

      const contractA = await APYContractA.new()
      const contractB = await APYContractB.new()

      // execute on data
      const exec = await APYStrategyExecutor.new()
      const trx = await exec.execute(
        [
          [contractA.address, encodeA],
          [contractB.address, encodeB]
        ]
      )

      expectEvent.inTransaction(trx.tx, contractA, 'APYcontractAExecute', { data: '100' })
      expectEvent.inTransaction(trx.tx, contractB, 'APYcontractBExecute', { data: '1000' })
    })
  })
})