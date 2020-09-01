const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils
const BigNumber = ethers.BigNumber
const { mintERC20Tokens } = require("./utils.js")
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
// Imports
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
const redeem = IcDAI.getSighash("redeem");
const borrowBalanceCurrent = IcDAI.getSighash("borrowBalanceCurrent");
const borrowRatePerBlock = IcDAI.getSighash("borrowRatePerBlock");
const borrow = IcDAI.getSighash("borrow");
const repayBorrow = IcDAI.getSighash("repayBorrow");
const balanceOf = IcDAI.getSighash("balanceOf");
const comp_approve = ICOMP.getSighash("approve")
const enterMarkets = IComptroller.getSighash("enterMarkets");
const getAccountLiquidity = IComptroller.getSighash("getAccountLiquidity");
const claimComp = IComptroller.getSighash("claimComp");

// const executeB = AInterface.encodeFunctionData('executeB', [100])
// const executeMultiParam = AInterface.encodeFunctionData('executeMultiParam', [1, 1, 1])
// [
//   '0x0000000000000000000000000000000000000000', //ETH
//   '0x6b175474e89094c44da98b954eedeac495271d0f', //DAI
//   ether("0.05"),
//   10,
//   0
// ]


contract("APYStrategyExecution", async (accounts) => {
  const [owner] = accounts
  const DAI_MINTER = '0x9759A6Ac90977b93B58547b4A71c78317f391A28'
  const amount = 1000
  let dai_contract
  let cDAI_contract
  let comp_contract
  let comptroller_contract
  let e_cDAI_address
  let e_amount
  let borrowAmount

  before("Setup", async () => {
    // Contracts
    dai_contract = await DAI.at('0x6b175474e89094c44da98b954eedeac495271d0f')
    cDAI_contract = await cDAI.at('0x5d3a536e4d6dbd6114cc1ead35777bab948e3643')
    comp_contract = await COMP.at('0xc00e94cb662c3520282e6f5717214004a7f26888')
    comptroller_contract = await Comptroller.at('0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b')

    // Function Encodings
    e_cDAI_address = abiCoder.encode(['address'], [cDAI_contract.address]);
    e_amount = abiCoder.encode(['uint256'], [amount]);
    e_owner = abiCoder.encode(['address'], [owner]);
    borrowAmount = abiCoder.encode(['uint256'], [1]);

    // mint ourselves DAI
    await mintERC20Tokens(dai_contract.address, owner, DAI_MINTER, amount);

    let dai_val = await dai_contract.balanceOf.call(owner)
    console.log(dai_val.toNumber());

    let cdai_val = await cDAI_contract.balanceOf.call(owner)
    console.log(cdai_val.toNumber());

  })

  describe('Example Execution', async () => {
    it('Execute Steps', async () => {

      // execute steps
      const exec = await APYStrategyExecutor.new()
      const trx = await exec.execute(
        [
          [dai_contract.address, dai_approve, [], [e_cDAI_address, e_amount], []],
          [dai_contract.address, balanceOf, [], [e_owner], []]
          [cDAI_contract.address, balanceOf, [], [e_owner], []]
          // [cDAI_contract.address, mint, [], [e_amount], []]
          // [cDAI_contract.address, borrow, [], [borrowAmount], []],
        ],
        { from: owner }
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
