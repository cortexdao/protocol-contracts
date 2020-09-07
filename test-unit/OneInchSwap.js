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
const timeMachine = require("ganache-time-traveler");

const OneInchSwap = artifacts.require("OneInchSwapTestProxy");
const IOneSplit = artifacts.require("IOneSplit");
const MockContract = artifacts.require("MockContract");

const ZERO_ADDRESS = constants.ZERO_ADDRESS;
const { DUMMY_ADDRESS } = require("../utils/constants");

contract("OneInchSwap", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let oneInchSwap;
  let oneSplit;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];

    oneSplit = await getOneSplitMock();
    oneInchSwap = await OneInchSwap.new();
    await oneInchSwap.setOneInchAddress(oneSplit.address, { from: deployer });
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  it("can swap ETH for ERC20", async () => {
    const returnAmount = new BN("100000");
    await mockOneSplitSwap(oneSplit, returnAmount);

    const fromAddress = ZERO_ADDRESS;
    const toAddress = DUMMY_ADDRESS;
    const amount = new BN("134");

    // Need to send ether before calling swap, since
    // "fromAddress" is the zero address and so swap function
    // will expect to swap ETH.
    send.ether(wallet, oneInchSwap.address, ether("1"));
    const receivedAmount = await oneInchSwap.swap.call(
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
    await mockOneSplitSwap(oneSplit, returnAmount);

    const fromAddress = (await getERC20Mock()).address;
    const toAddress = DUMMY_ADDRESS;
    const amount = new BN("134");

    const receivedAmount = await oneInchSwap.swap.call(
      fromAddress,
      toAddress,
      amount,
      {
        from: wallet,
      }
    );
    expect(receivedAmount).to.bignumber.equal(returnAmount);
  });

  const getEvent = (receipt, eventName) => {
    const events = receipt.logs.filter((e) => e.event === eventName);
    return events;
  };

  const getERC20Mock = async () => {
    const mockERC20 = await MockContract.new();
    await mockERC20.givenAnyReturnBool(true);
    return mockERC20;
  };

  const getOneSplitMock = async () => {
    const mock = await MockContract.new();
    oneSplit = await IOneSplit.at(mock.address);
    oneSplit._mock = mock;
    return oneSplit;
  };

  const mockOneSplitSwap = async (oneSplitMock, returnAmount) => {
    const swapAbi = oneSplitMock.contract.methods
      .swap(DUMMY_ADDRESS, DUMMY_ADDRESS, 0, 0, [0, 0], 0)
      .encodeABI();
    const getExpectedReturnAbi = oneSplitMock.contract.methods
      .getExpectedReturn(DUMMY_ADDRESS, DUMMY_ADDRESS, 0, 0, 0)
      .encodeABI();

    const encodedReturn = web3.eth.abi.encodeParameters(
      ["uint256", "uint256[]"],
      [0, ["0", "0"]]
    );
    await oneSplitMock._mock.givenMethodReturn(
      getExpectedReturnAbi,
      encodedReturn
    );

    await oneSplitMock._mock.givenMethodReturnUint(swapAbi, returnAmount);
  };
});
