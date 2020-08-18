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
const APYStrategy = artifacts.require("TestStrategy");
const APYLiquidityPool = artifacts.require("APYLiquidityPool");
const APT = artifacts.require("APT");

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

  it("can rebalance using unused ETH", async () => {
    // mock out manager's _swap function
    const returnAmount = ether("100");
    await mockAPYManagerSwap(oneInch, returnAmount);

    // setup strategy and pool
    const inputAddresses = [DUMMY_ADDRESS, DUMMY_ADDRESS, DUMMY_ADDRESS];
    const proportions = ["1", "2", "97"];
    const ethAmount = ether("100");
    const expectedFromAmounts = proportions.map((p) => ether(p));
    const strategy = await APYStrategy.new(inputAddresses, proportions);
    await apyManager.setStrategy(strategy.address, { from: deployer });
    const pool = await deployPoolWithEther(apyManager, ethAmount);
    await apyManager.setPool(pool.address, { from: deployer });

    // Check what we can without using events or peering
    // into the innards of the rebalance function.
    const receivedAmounts = await apyManager.rebalance.call();
    expect(receivedAmounts.length).to.equal(inputAddresses.length);

    // Send actual rebalance transaction and emit swap events.
    // Each swap event should reflect appropriate proportion of ETH value.
    const receipt = await apyManager.rebalance();
    expect(await balance.current(apyManager.address)).to.bignumber.equal(
      "0",
      "All ETH should be used up by rebalance function."
    );
    const swapEvents = getEvent(receipt, "AssetsSwapped");
    expect(swapEvents.length).to.equal(
      expectedFromAmounts.length,
      "Incorrect number of swap events found."
    );
    const tolerance = "5";
    for (i = 0; i < swapEvents.length; i++) {
      const event = swapEvents[i];
      const expectedFromAmount = expectedFromAmounts[i];
      const resultFromAmount = event.args["fromAmount"];
      expect(
        resultFromAmount.sub(expectedFromAmount).abs()
      ).to.be.bignumber.lte(tolerance);
    }
  });

  const getEvent = (receipt, eventName) => {
    const events = receipt.logs.filter((e) => e.event === eventName);
    return events;
  };

  const deployPoolWithEther = async (apyManager, ethAmount) => {
    const pool = await APYLiquidityPool.new();
    const apt = await APT.new();
    await pool.setTokenAddress(apt.address, { from: deployer });
    await apt.setPoolAddress(pool.address, { from: deployer });
    await pool.setManagerAddress(apyManager.address, { from: deployer });

    await send.ether(other, pool.address, ethAmount);

    return pool;
  };

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
