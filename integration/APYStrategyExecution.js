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
const OneInch = artifacts.require("OneSplitAudit");
const cDAI = artifacts.require("cDAI");
const COMP = artifacts.require("COMP");
const Comptroller = artifacts.require("Comptroller");
const APYContractA = artifacts.require("APYContractA");
const AInterface = new ethers.utils.Interface(APYContractA.abi)
const executeASelector = AInterface.getSighash("executeA")
const executeAMultiParamSelector = AInterface.getSighash("executeAMultiParam")
// const OneInchInterface = new ethers.utils.Interface(OneInch.abi)
// const cDAIInterface = new ethers.utils.Interface(cDAI.abi)
// const COMPInterface = new ethers.utils.Interface(COMP.abi)
// const ComptrollerInterface = new ethers.utils.Interface(Comptroller.abi)
// const executeB = AInterface.encodeFunctionData('executeB', [100])
// const executeMultiParam = AInterface.encodeFunctionData('executeMultiParam', [1, 1, 1])
// [
//   '0x0000000000000000000000000000000000000000', //ETH
//   '0x6b175474e89094c44da98b954eedeac495271d0f', //DAI
//   ether("0.05"),
//   10,
//   0
// ]
console.log(executeASelector)
console.log(executeAMultiParamSelector)
const hex100 = ethers.utils.hexValue(100)
const hex1 = ethers.utils.hexValue(1)

contract("APYStrategyExecution", async (accounts) => {
  describe('Example Execution', async () => {
    it('Basic Calls', async () => {

      const contractA = await APYContractA.new()
      // const contractB = await APYContractB.new()

      // execute on data
      const exec = await APYStrategyExecutor.new()
      const trx = await exec.execute(
        [
          [contractA.address, executeASelector, [], [hex100], []],
          [contractA.address, executeAMultiParamSelector, [0], [hex1, hex1, hex1], [1]] // -> [1, 100, 1]
        ]
      )

      expectEvent.inTransaction(trx.tx, contractA, 'MultiParam', { a: '1', b: '100', c: '1' })
      // expectEvent.inTransaction(trx.tx, contractB, 'APYcontractBExecute', { data: '1000' })
    })
  })
})