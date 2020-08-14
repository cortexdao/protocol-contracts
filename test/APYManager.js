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
    const returnAmount = new BN("100000");
    const slippage = new BN("200");
    await mockAPYManagerSwap(
      oneInch,
      returnAmount, // received amount 1inch anticipates
      apyManager.amountWithSlippage, // slippage calc
      slippage
    );

    const fromToken = constants.ZERO_ADDRESS;
    const destToken = constants.ZERO_ADDRESS;
    const amount = new BN("134");

    // Need to send ether before calling swap, since
    // "fromToken" is the zero address and so swap function
    // will expect to swap ETH.
    send.ether(wallet, apyManager.address, ether("1"));
    const receivedAmount = await apyManager.swap.call(
      fromToken,
      destToken,
      amount,
      slippage,
      {
        from: wallet,
      }
    );
    expect(receivedAmount).to.bignumber.gt("0");
    expect(receivedAmount).to.bignumber.lt(returnAmount);
  });

  const getOneInchMock = async () => {
    const mock = await MockContract.new();
    oneInch = await IOneSplit.at(mock.address);
    oneInch._mock = mock;
    return oneInch;
  };

  const mockAPYManagerSwap = async (
    oneInchMock,
    returnAmount,
    slippageCalculation,
    slippage
  ) => {
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
      [returnAmount, ["0", "0"]]
    );
    await mock.givenMethodReturn(getExpectedReturnAbi, encodedReturn);

    const receivedAmount = await slippageCalculation(returnAmount, slippage);
    await mock.givenMethodReturnUint(swapAbi, receivedAmount);
  };
});
