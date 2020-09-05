const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils;
const BigNumber = ethers.BigNumber;
const { mintERC20Tokens } = require("./utils.js");
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
const { cDAI, DAI, COMP, COMPTROLLER } = require('../utils/Compound');


// Imports
const APYStrategyExecutor = artifacts.require("APYStrategyExecutor");
const OneInch = artifacts.require("IOneSplit");
const IOneInch = new ethers.utils.Interface(OneInch.abi);

// Selectors
// const getExpectedReturn = IOneInch.getSighash("getExpectedReturn");
// const swap = IOneInch.getSighash("swap");
// const dai_approve = IDAI.getSighash("approve");
// const mint = IcDAI.getSighash("mint");
// const redeem = IcDAI.getSighash("redeem");
// const borrowBalanceCurrent = IcDAI.getSighash("borrowBalanceCurrent");
// const borrowRatePerBlock = IcDAI.getSighash("borrowRatePerBlock");
// const borrow = IcDAI.getSighash("borrow");
// const repayBorrow = IcDAI.getSighash("repayBorrow");
// const balanceOf = IcDAI.getSighash("balanceOf");
// const comp_approve = ICOMP.getSighash("approve");
// const enterMarkets = IComptroller.getSighash("enterMarkets");
// const getAccountLiquidity = IComptroller.getSighash("getAccountLiquidity");
// const claimComp = IComptroller.getSighash("claimComp");

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
  const [owner] = accounts;
  const DAI_MINTER = "0x9759A6Ac90977b93B58547b4A71c78317f391A28";
  const amount = new BN("1000");
  let dai_contract;
  // let cDAI_contract;
  let comp_contract;
  let comptroller_contract;
  let eCDAIAddress;
  let eAmount
  let eBorrowAmount;

  before("Setup", async () => {
    // Function Encodings
    eOwner = abiCoder.encode(["address"], [owner]);
    eCDAIAddress = abiCoder.encode(["address"], [cDAI.address]);
    eAmount = abiCoder.encode(["uint256"], [1000]);
    eBorrowAmount = abiCoder.encode(["uint256"], [1]);

    // mint ourselves DAI
    await mintERC20Tokens(DAI.address, owner, DAI_MINTER, amount);

    // let dai_val = await dai_contract.balanceOf.call(owner);
    // console.log(dai_val.toString());

    // let cdai_val = await cDAI_contract.balanceOf.call(owner);
    // console.log(cdai_val.toString());
  });

  describe("Example Execution", async () => {
    it("Execute Steps", async () => {
      // execute steps
      const exec = await APYStrategyExecutor.new();
      const trx = await exec.execute(
        [
          [DAI.address, DAI.interface.getSighash("approve"), [], [eCDAIAddress, eAmount], []]
          // [cDAI.address, cDAI.interface.getSighash("balanceOf"), [], [eOwner], []],
          // [cDAI.address, cDAI.interface.getSighash("mint"), [], [eAmount], []]
          // [cDAI.address, borrow, [], [eBorrowAmount], []],
        ],
        { from: owner }
      );

      await expectEvent.inTransaction(trx.tx, DAI, 'Approval', { _owner: exec.address, _spender: cDAI.address, _value: '1000' })
      // await expectEvent.inTransaction(trx.tx, cDAI, 'Mint')

      // await expectEvent.inTransaction(trx.tx, exec, 'InitialCall', { a: '0x0000000000000000000000000000000000000000000000000000000000000001' })
      // await expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAUint256', { a: '1' })
      // await expectEvent.inTransaction(trx.tx, contractA, 'ExecuteABytes32', { a: '0x0000000000000000000000000000000000000000000000000000000000000001' })
      // await expectEvent.inTransaction(trx.tx, contractA, 'MultiParam', { a: '1', b: '100', c: '1' })
      // await expectEvent.inTransaction(trx.tx, contractA, 'MultiParam', { a: '1', b: '1', c: '100' })
      // await expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAReturnArray', { a: ['1000', '500'] })
      // await expectEvent.inTransaction(trx.tx, contractA, 'ExecuteAArrayParam', { a: '1000' })
      // await expectEvent.inTransaction(trx.tx, exec, 'Params', { params: '3' })
      // await expectEvent.inTransaction(trx.tx, exec, 'EncodeCallData', { length: '3' })
    });
  });
});
