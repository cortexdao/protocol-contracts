const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  getStablecoinAddress,
  acquireToken,
  bytes32,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

async function sendErc20Tokens(symbol, amount, recipient, ethFunder) {
  if (!["DAI", "USDC", "USDT"].includes(symbol.toUpperCase())) {
    throw Error("Unsupported ERC20 token.");
  }
  const tokenAddress = getStablecoinAddress(symbol, "MAINNET");
  const token = await ethers.getContractAt("ERC20", tokenAddress);
  await acquireToken(
    STABLECOIN_POOLS[symbol],
    recipient,
    token,
    amount,
    ethFunder
  );
}

describe("Contract: Erc20Allocation", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let lpSafe;
  let poolManager;

  /* contract factories */
  let Erc20Allocation;

  /* deployed contracts */
  let erc20Allocation;
  let tvlManager;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, emergencySafe, lpSafe, poolManager] = await ethers.getSigners();

    const addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    /* These registered addresses are setup for roles in the
     * constructor for TvlManager:
     * - poolManager (contract role)
     * - lpSafe (LP role)
     * - emergencySafe (emergency role, default admin role)
     */
    await addressRegistry.mock.poolManagerAddress.returns(poolManager.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    /* These registered addresses are setup for roles in the
     * constructor for Erc20Allocation:
     * - poolManager (contract role)
     * - lpSafe (contract role)
     * - emergencySafe (default admin role)
     */
    Erc20Allocation = await ethers.getContractFactory(
      "Erc20Allocation",
      lpSafe
    );
    erc20Allocation = await Erc20Allocation.deploy(addressRegistry.address);

    const TvlManager = await ethers.getContractFactory("TvlManager");
    tvlManager = await TvlManager.deploy(
      addressRegistry.address,
      erc20Allocation.address
    );
  });

  it("registerErc20Token(address)", async () => {
    const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
    await erc20Allocation["registerErc20Token(address)"](usdcAddress);
    expect(await erc20Allocation.tokens()).to.deep.equal([
      [usdcAddress, "USDC", 6],
    ]);

    const allocationId = tvlManager.getAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
    expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

    expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
    const amount = tokenAmountToBigNumber(100, 6);
    await sendErc20Tokens("USDC", amount, lpSafe, deployer);
    expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
  });

  it("registerErc20Token(address,string)", async () => {
    const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
    await erc20Allocation["registerErc20Token(address,string)"](
      usdcAddress,
      "USDC"
    );
    expect(await erc20Allocation.tokens()).to.deep.equal([
      [usdcAddress, "USDC", 6],
    ]);

    const allocationId = tvlManager.getAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
    expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

    expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
    const amount = tokenAmountToBigNumber(100, 6);
    await sendErc20Tokens("USDC", amount, lpSafe, deployer);
    expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
  });

  it("registerErc20Token(address,string,uint8)", async () => {
    const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
    await erc20Allocation["registerErc20Token(address,string,uint8)"](
      usdcAddress,
      "USDC",
      6
    );
    expect(await erc20Allocation.tokens()).to.deep.equal([
      [usdcAddress, "USDC", 6],
    ]);

    const allocationId = tvlManager.getAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
    expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

    expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
    const amount = tokenAmountToBigNumber(100, 6);
    await sendErc20Tokens("USDC", amount, lpSafe, deployer);
    expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
  });

  it("removeErc20Token", async () => {
    const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
    const daiAddress = getStablecoinAddress("DAI", "MAINNET");

    await erc20Allocation["registerErc20Token(address)"](usdcAddress);
    await erc20Allocation["registerErc20Token(address)"](daiAddress);
    expect(await erc20Allocation.tokens()).to.have.lengthOf(2);

    const usdcId = tvlManager.getAssetAllocationId(erc20Allocation.address, 0);
    expect(await tvlManager.symbolOf(usdcId)).to.equal("USDC");
    const daiId = tvlManager.getAssetAllocationId(erc20Allocation.address, 1);
    expect(await tvlManager.symbolOf(daiId)).to.equal("DAI");

    await erc20Allocation.removeErc20Token(usdcAddress);
    expect(await erc20Allocation.tokens()).to.deep.equal([
      [daiAddress, "DAI", 18],
    ]);

    const allocationId = tvlManager.getAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(allocationId)).to.equal("DAI");
  });
});
