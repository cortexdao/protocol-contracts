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
const APYStrategyGeneralExecutor = artifacts.require("APYStrategyGeneralExecutor");
const OneInch = artifacts.require("IOneSplit");
const IOneInch = new ethers.utils.Interface(OneInch.abi);

const APYContractA = artifacts.require("APYContractA");
const AInterface = new ethers.utils.Interface(APYContractA.abi);

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
    // mint ourselves DAI
    await mintERC20Tokens(DAI.address, owner, DAI_MINTER, amount);
  });

  describe("Example Execution", async () => {
    it("Execute Steps", async () => {
      // execute steps
      const AContract = await APYContractA.new();
      const exec = await APYStrategyGeneralExecutor.new();
      const trx = await exec.execute(
        [
          // [AContract.address, AInterface.encodeFunctionData('executeA', [100])]
          [DAI.address, DAI.interface.encodeFunctionData('approve', [cDAI.address, 1000])],
          [cDAI.address, cDAI.interface.encodeFunctionData('balanceOf', [owner])],
          [cDAI.address, cDAI.interface.encodeFunctionData("mint", [1000])]
        ],
        { from: owner }
      );

      await expectEvent.inTransaction(trx.tx, DAI, 'Approval', { _owner: exec.address, _spender: cDAI.address, _value: '1000' })
      await expectEvent.inTransaction(trx.tx, cDAI, 'Mint')

      // await expectEvent.inTransaction(trx.tx, exec, 'InitialCall', { a: '0x0000000000000000000000000000000000000000000000000000000000000001' })
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
