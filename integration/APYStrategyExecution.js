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
const OneInchInterface = new ethers.utils.Interface(OneInch.abi)
const cDAIInterface = new ethers.utils.Interface(cDAI.abi)
const COMPInterface = new ethers.utils.Interface(COMP.abi)
const ComptrollerInterface = new ethers.utils.Interface(Comptroller.abi)
const getExpectedReturn = AInterface.encodeFunctionData(
  'getExpectedReturn',
  [
    '0x0000000000000000000000000000000000000000', //ETH
    '0x6b175474e89094c44da98b954eedeac495271d0f', //DAI
    ether("0.05"),
    10,
    0
  ]
)

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
          ['', getExpectedReturn],
          [contractA.address, encodeA],
          [contractB.address, encodeB]
        ]
      )

      expectEvent.inTransaction(trx.tx, contractA, 'APYcontractAExecute', { data: '100' })
      expectEvent.inTransaction(trx.tx, contractB, 'APYcontractBExecute', { data: '1000' })
    })
  })
})