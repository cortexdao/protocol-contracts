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
// Contracts
const APYStrategyExecutor = artifacts.require("APYStrategyExecutor");
const OneInch = artifacts.require("IOneSplit");
const DAI = artifacts.require("IERC20");
const cDAI = artifacts.require("CErc20");
const COMP = artifacts.require("IERC20");
const Comptroller = artifacts.require("Comptroller");
// Interfaces
const IOneInch = new ethers.utils.Interface(OneInch.abi);
const IDAI = new ethers.utils.Interface(DAI.abi);
const IcDAI = new ethers.utils.Interface(cDAI.abi);
const ICOMP = new ethers.utils.Interface(COMP.abi);
const IComptroller = new ethers.utils.Interface(Comptroller.abi);
// Selectors
const getExpectedReturn = IOneInch.getSighash("getExpectedReturn");
const swap = IOneInch.getSighash("swap");
const dai_approve = IDAI.getSighash("approve");
const mint = IcDAI.getSighash("mint");
const redeem = IDAI.getSighash("redeem");
const borrowBalanceCurrent = IcDAI.getSighash("borrowBalanceCurrent");
const borrowRatePerBlock = IcDAI.getSighash("borrowRatePerBlock");
const borrow = IcDAI.getSighash("borrow");
const repayBorrow = IcDAI.getSighash("repayBorrow");
const balanceOf = IcDAI.getSighash("balanceOf");
const comp_approve = ICOMP.getSighash("approve")
const enterMarkets = IComptroller.getSighash("enterMarkets");
const getAccountLiquidity = IComptroller.getSighash("getAccountLiquidity");
const claimComp = IComptroller.getSighash("claimComp");
// Function Encodings

// const executeB = AInterface.encodeFunctionData('executeB', [100])
// const executeMultiParam = AInterface.encodeFunctionData('executeMultiParam', [1, 1, 1])
// [
//   '0x0000000000000000000000000000000000000000', //ETH
//   '0x6b175474e89094c44da98b954eedeac495271d0f', //DAI
//   ether("0.05"),
//   10,
//   0
// ]
const e_cDAI_address = abiCoder.encode(['address'], cDAI.address);
const amount = abiCoder.encode(['uint256'], [1000]);
const borrowAmount = abiCoder.encode(['uint256'], [1]);

contract("APYStrategyExecution", async (accounts) => {
  describe('Example Execution', async () => {
    it('Execute Steps', async () => {

      // execute steps
      const exec = await APYStrategyExecutor.new()
      const trx = await exec.execute(
        [
          [DAI.address, dai_approve, [], [e_cDAI_address, amount], []],
          [cDAI.address, mint, [], [amount], []],
          [cDAI.address, borrow, [], [borrowAmount], []],
        ]
      )

      // expectEvent.inTransaction(trx.tx, exec, 'InitialCall', { a: '0x0000000000000000000000000000000000000000000000000000000000000001' })
      // expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAUint256', { a: '1' })
      // expectEvent.inTransaction(trx.tx, contractA, 'ExecuteABytes32', { a: '0x0000000000000000000000000000000000000000000000000000000000000001' })
      // expectEvent.inTransaction(trx.tx, contractA, 'MultiParam', { a: '1', b: '100', c: '1' })
      // expectEvent.inTransaction(trx.tx, contractA, 'MultiParam', { a: '1', b: '1', c: '100' })
      // expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAReturnArray', { a: ['1000', '500'] })
      // expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAArrayParam', { a: '1000' })
      //expectEvent.inTransaction(trx.tx, exec, 'Params', { params: '3' })
      //expectEvent.inTransaction(trx.tx, exec, 'EncodeCallData', { length: '3' })
    })
  })
})
