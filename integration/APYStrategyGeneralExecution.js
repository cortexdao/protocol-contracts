const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder, parseUnits } = ethers.utils;
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
const ERC20 = artifacts.require("IERC20");
const cERC20 = artifacts.require("CErc20");
const OneInch = artifacts.require("IOneSplit");
const IOneInch = new ethers.utils.Interface(OneInch.abi);

contract("APYStrategyExecution", async (accounts) => {
  const [owner] = accounts;
  const DAI_MINTER = "0x9759A6Ac90977b93B58547b4A71c78317f391A28";
  const amount = parseUnits('1000', 10);
  let DAIInstance
  let daiBalance
  let cDAIInstance
  let errCode
  let exec

  before("Setup", async () => {
    exec = await APYStrategyGeneralExecutor.new();
    DAIInstance = await ERC20.at(DAI.address)
    cDAIInstance = await cERC20.at(cDAI.address)

    // mint to user
    await mintERC20Tokens(DAI.address, owner, DAI_MINTER, amount);
    daiBalance = await DAIInstance.balanceOf(owner)
    console.log(`Starting DAI Balance: ${daiBalance.toNumber()}`)
    await DAIInstance.approve(exec.address, daiBalance)

    await DAIInstance.approve(cDAI.address, daiBalance)
    errCode = await cDAIInstance.mint.call(daiBalance)
    console.log(`Mint Error Code: ${errCode.toNumber()}`)

    // mint to exec
    await mintERC20Tokens(DAI.address, exec.address, DAI_MINTER, amount);
    daiBalance = await DAIInstance.balanceOf(exec.address)
    console.log(`exec Starting DAI Balance: ${daiBalance.toNumber()}`)
  });

  describe.skip("Example Execution", async () => {
    it("Execute mint", async () => {
      // execute steps
      const trx = await exec.execute(
        DAI.address,
        amount,
        true,
        [
          [DAI.address, DAI.interface.encodeFunctionData('approve', [cDAI.address, amount])],
          [cDAI.address, cDAI.interface.encodeFunctionData("mint", [amount])]
        ],
        { from: owner }
      );

      await expectEvent.inTransaction(trx.tx, DAI, 'Approval', { _owner: exec.address, _spender: cDAI.address, _value: '1000' })
      await expectEvent.inTransaction(trx.tx, cDAI, 'Mint')
    });

    it.skip("Execute redeem", async () => {
      // execute steps
      const trx = await exec.execute(
        [
          DAI.address,
          amount,
          true,
          [cDAI.address, cDAI.interface.encodeFunctionData("redeem", [1000])]
        ],
        { from: owner }
      );
      await expectEvent.inTransaction(trx.tx, cDAI, 'Redeem')
    });
  });
});
