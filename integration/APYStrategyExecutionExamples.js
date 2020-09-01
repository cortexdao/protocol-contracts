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
const APYContractA = artifacts.require("APYContractA");
const AInterface = new ethers.utils.Interface(APYContractA.abi)
const executeASelector = AInterface.getSighash("executeA")
const executeAMultiParamSelector = AInterface.getSighash("executeAMultiParam")
const executeAReturnArraySelector = AInterface.getSighash("executeAReturnArray")
const executeAArrayParam = AInterface.getSighash("executeAArrayParam")

const e_0 = abiCoder.encode(['uint256'], [0])
const e_1 = abiCoder.encode(['uint256'], [1])

console.log(e_0)
console.log(e_1)

contract("APYStrategyExecution", async (accounts) => {
  describe('Example Execution', async () => {
    it('Basic Calls', async () => {
      const contractA = await APYContractA.new()

      // execute on data
      const exec = await APYStrategyExecutor.new()
      const trx = await exec.execute(
        [
          [contractA.address, executeASelector, [], [e_1], []],
          [contractA.address, executeAMultiParamSelector, [0], [e_1, e_1, e_1], [1]],
          [contractA.address, executeAMultiParamSelector, [0, 0, 0], [e_1, e_1, e_1], [constants.MAX_UINT256, 2, constants.MAX_UINT256]],
          [contractA.address, executeAReturnArraySelector, [0, 0, 0], [e_1], [constants.MAX_UINT256, constants.MAX_UINT256, 0]]
          // [contractA.address, executeAArrayParam, [0, 0, 0], [e_1], [constants.MAX_UINT256, constants.MAX_UINT256, 0]] // does not work
          // NOTE: 0 is cheaper in gas
        ]
      )

      expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAUint256', { a: '1' })
      expectEvent.inTransaction(trx.tx, contractA, 'MultiParam', { a: '1', b: '100', c: '1' })
      expectEvent.inTransaction(trx.tx, contractA, 'MultiParam', { a: '1', b: '1', c: '100' })
      expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAReturnArray', { a: ['1000', '500'] })
      // expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAArrayParam', { a: '1000' })
      //expectEvent.inTransaction(trx.tx, exec, 'Params', { params: '3' })
    })
  })
})
