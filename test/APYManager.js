const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
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

const APYManager = artifacts.require("APYManagerTestProxy");
const IOneSplit = artifacts.require("IOneSplit");
const MockContract = artifacts.require("MockContract");

contract("APYManager", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let apyManager;
  let oneInch;
  let mock;

  beforeEach(async () => {
    mock = await MockContract.new();
    oneInch = await IOneSplit.at(mock.address);
    apyManager = await APYManager.new();
    await apyManager.setOneInchAddress(oneInch.address, { from: deployer });
  });

  it("1inch swap", async () => {
    const swapAbi = oneInch.contract.methods
      .swap(constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, 0, 0, [0, 0], 0)
      .encodeABI();
    const getExpectedReturnAbi = oneInch.contract.methods
      .getExpectedReturn(
        constants.ZERO_ADDRESS,
        constants.ZERO_ADDRESS,
        0,
        0,
        0
      )
      .encodeABI();

    const encodedReturn = web3.eth.abi.encodeParameters(
      ["uint256", "uint256[]"],
      [
        "20548",
        [
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "10",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
        ],
      ]
    );
    await mock.givenMethodReturn(getExpectedReturnAbi, encodedReturn);
    await mock.givenMethodReturnUint(swapAbi, new BN("1"));

    const fromToken = constants.ZERO_ADDRESS;
    const destToken = constants.ZERO_ADDRESS;
    const amount = new BN("134");
    const slippage = 200;
    await apyManager.swap(fromToken, destToken, amount, slippage, {
      from: wallet,
    });
  });
});
