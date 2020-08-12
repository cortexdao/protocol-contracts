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

  beforeEach(async () => {
    oneInch = await getOneInchMock();
    apyManager = await APYManager.new();
    await apyManager.setOneInchAddress(oneInch.address, { from: deployer });
  });

  it("1inch swap", async () => {
    const expectedReturnAmount = new BN("1");
    await mockAPYManagerSwap(oneInch, expectedReturnAmount);

    const fromToken = constants.ZERO_ADDRESS;
    const destToken = constants.ZERO_ADDRESS;
    const amount = new BN("134");
    const slippage = 200;
    const returnedAmount = await apyManager.swap.call(
      fromToken,
      destToken,
      amount,
      slippage,
      {
        from: wallet,
      }
    );
    expect(returnedAmount).to.bignumber.equal(expectedReturnAmount);
  });

  const getOneInchMock = async () => {
    const mock = await MockContract.new();
    oneInch = await IOneSplit.at(mock.address);
    oneInch._mock = mock;
    return oneInch;
  };

  const mockAPYManagerSwap = async (oneInchMock, returnAmount) => {
    const mock = oneInchMock._mock;
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
      ["0", ["0", "0"]]
    );
    await mock.givenMethodReturn(getExpectedReturnAbi, encodedReturn);
    await mock.givenMethodReturnUint(swapAbi, returnAmount);
  };
});
