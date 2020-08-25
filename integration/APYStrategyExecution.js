const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils
const BigNumber = ethers.BigNumber


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

console.log(executeASelector)
console.log(executeAMultiParamSelector)

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
const bytes32String = ethers.utils.formatBytes32String('1')
const hexValue = ethers.utils.hexValue(1)
const encoded = abiCoder.encode(['uint256'], [1])

console.log(bytes32String)
console.log(hexValue)
console.log(encoded)


contract("APYStrategyExecution", async (accounts) => {
  describe('Example Execution', async () => {
    it('Basic Calls', async () => {

      const contractA = await APYContractA.new()
      const tx = await contractA.executeA(1)
      // expectEvent.inTransaction(tx, contractA, 'ExecuteA', { a: 1 })
      expectEvent(tx, 'ExecuteAUint256', { a: '1' })
      expectEvent(tx, 'ExecuteABytes32', { a: '0x0000000000000000000000000000000000000000000000000000000000000001' })
      // const contractB = await APYContractB.new()

      // // execute on data
      const exec = await APYStrategyExecutor.new()
      const trx = await exec.execute(
        [
          [contractA.address, executeASelector, [], [encoded], []],
          // [contractA.address, executeAMultiParamSelector, [0], [hex1, hex1, hex1], [1]] // -> [1, 100, 1]
        ]
      )

      expectEvent.inTransaction(trx.tx, exec, 'InitialCall', { a: '0x0000000000000000000000000000000000000000000000000000000000000001' })
      // expectEvent.inTransaction(trx.tx, contractA, 'ExecuteA', { input: 100 })
      // expectEvent.inTransaction(trx.tx, contractA, 'MultiParam', { a: '1', b: '100', c: '1' })
    })
  })
})