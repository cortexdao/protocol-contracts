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
const { cDAI, DAI, COMP, COMPTROLLER } = require('../utils/Compound');

// Imports
const APYStrategyGeneralExecutor = artifacts.require("APYStrategyGeneralExecutor");
const ERC20 = artifacts.require("ERC20");
const OneInch = artifacts.require("IOneSplit");
const IOneInch = new ethers.utils.Interface(OneInch.abi);

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
    const DAIInstance = await ERC20.at(DAI.address)
    const daiBalance = await DAIInstance.balanceOf(owner)
    console.log(`Starting DAI Balance: ${daiBalance.toNumber()}`)
  });

  describe("Example Execution", async () => {
    it("Execute Steps", async () => {
      // execute steps
      const exec = await APYStrategyGeneralExecutor.new();
      const trx = await exec.execute(
        [
          // [AContract.address, AInterface.encodeFunctionData('executeA', [100])]
          [DAI.address, DAI.interface.encodeFunctionData('approve', [cDAI.address, 1000])],
          [cDAI.address, cDAI.interface.encodeFunctionData("mint", [1000])]
        ],
        { from: owner }
      );

      await expectEvent.inTransaction(trx.tx, DAI, 'Approval', { _owner: exec.address, _spender: cDAI.address, _value: '1000' })
      await expectEvent.inTransaction(trx.tx, cDAI, 'Mint')
    });
  });
});
