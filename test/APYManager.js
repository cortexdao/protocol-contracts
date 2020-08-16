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

ZERO_ADDRESS = constants.ZERO_ADDRESS;
DUMMY_ADDRESS = "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE";

contract("APYManager", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let apyManager;
  let oneInch;

  beforeEach(async () => {
    oneInch = await getOneInchMock();
    apyManager = await APYManager.new();
    await apyManager.setOneInchAddress(oneInch.address, { from: deployer });
  });

  it("can swap ETH for ERC20", async () => {
    const returnAmount = new BN("100000");
    await mockAPYManagerSwap(oneInch, returnAmount);

    const fromAddress = ZERO_ADDRESS;
    const toAddress = DUMMY_ADDRESS;
    const amount = new BN("134");

    // Need to send ether before calling swap, since
    // "fromAddress" is the zero address and so swap function
    // will expect to swap ETH.
    send.ether(wallet, apyManager.address, ether("1"));
    const receivedAmount = await apyManager.swap.call(
      fromAddress,
      toAddress,
      amount,
      {
        from: wallet,
      }
    );
    expect(receivedAmount).to.bignumber.equal(returnAmount);
  });

  it("can swap ERC20 tokens", async () => {
    const returnAmount = new BN("100000");
    await mockAPYManagerSwap(oneInch, returnAmount);

    const fromAddress = (await getERC20Mock()).address;
    const toAddress = DUMMY_ADDRESS;
    const amount = new BN("134");

    const receivedAmount = await apyManager.swap.call(
      fromAddress,
      toAddress,
      amount,
      {
        from: wallet,
      }
    );
    expect(receivedAmount).to.bignumber.equal(returnAmount);
  });

  const getERC20Mock = async () => {
    const mockERC20 = await MockContract.new();
    await mockERC20.givenAnyReturnBool(true);
    return mockERC20;
  };

  const getOneInchMock = async () => {
    const mock = await MockContract.new();
    oneInch = await IOneSplit.at(mock.address);
    oneInch._mock = mock;
    return oneInch;
  };

  const mockAPYManagerSwap = async (oneInchMock, returnAmount) => {
    const swapAbi = oneInchMock.contract.methods
      .swap(DUMMY_ADDRESS, DUMMY_ADDRESS, 0, 0, [0, 0], 0)
      .encodeABI();
    const getExpectedReturnAbi = oneInchMock.contract.methods
      .getExpectedReturn(DUMMY_ADDRESS, DUMMY_ADDRESS, 0, 0, 0)
      .encodeABI();

    const encodedReturn = web3.eth.abi.encodeParameters(
      ["uint256", "uint256[]"],
      [0, ["0", "0"]]
    );
    await oneInchMock._mock.givenMethodReturn(
      getExpectedReturnAbi,
      encodedReturn
    );

    await oneInchMock._mock.givenMethodReturnUint(swapAbi, returnAmount);
  };
});
