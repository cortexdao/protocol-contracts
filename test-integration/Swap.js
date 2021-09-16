const hre = require("hardhat");
const { expect } = require("chai");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  getStablecoinAddress,
} = require("../utils/helpers");
const { FARM_TOKENS, FARM_TOKEN_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Swaps", () => {
  const NETWORK = "MAINNET";

  /* signers */
  let deployer;
  let emergencySafe;
  let lpSafe;
  let mApt;

  /* contract factories */
  let TvlManager;

  /* deployed contracts */
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
    [deployer, emergencySafe, lpSafe, mApt] = await ethers.getSigners();

    const addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );

    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.require("ILockingOracle").abi
    );
    await oracleAdapter.mock.lock.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for Erc20Allocation:
     * - emergencySafe (default admin role)
     * - lpSafe (LP role)
     * - mApt (contract role)
     */
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.mAptAddress.returns(mApt.address);

    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    const erc20Allocation = await Erc20Allocation.deploy(
      addressRegistry.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for TvlManager
     * - lpSafe (LP role)
     * - emergencySafe (emergency role, default admin role)
     */
    TvlManager = await ethers.getContractFactory("TvlManager");
    tvlManager = await TvlManager.deploy(addressRegistry.address);
    await tvlManager
      .connect(lpSafe)
      .registerAssetAllocation(erc20Allocation.address);
  });

  const swapParams = [
    {
      swapContractName: "CrvToDaiSwap",
      inTokenSymbol: "CRV",
      outTokenSymbol: "DAI",
    },
    {
      swapContractName: "CrvToUsdcSwap",
      inTokenSymbol: "CRV",
      outTokenSymbol: "USDC",
    },
    {
      swapContractName: "CrvToUsdtSwap",
      inTokenSymbol: "CRV",
      outTokenSymbol: "USDT",
    },
    {
      swapContractName: "AaveToDaiSwap",
      inTokenSymbol: "AAVE",
      outTokenSymbol: "DAI",
    },
    {
      swapContractName: "AaveToUsdcSwap",
      inTokenSymbol: "AAVE",
      outTokenSymbol: "USDC",
    },
    {
      swapContractName: "AaveToUsdtSwap",
      inTokenSymbol: "AAVE",
      outTokenSymbol: "USDT",
    },
  ];

  swapParams.forEach(function (params) {
    const { swapContractName, inTokenSymbol, outTokenSymbol } = params;

    describe(swapContractName, () => {
      let swap;
      let inToken;
      let outToken;

      let whaleAddress = FARM_TOKEN_POOLS[inTokenSymbol];

      before("Deploy swap contract", async () => {
        const SwapContract = await ethers.getContractFactory(
          swapContractName,
          lpSafe
        );
        swap = await SwapContract.deploy();
      });

      before("Fund swap with in-token", async () => {
        inToken = await ethers.getContractAt(
          "IDetailedERC20",
          FARM_TOKENS[inTokenSymbol]
        );

        const amount = tokenAmountToBigNumber(1000, await inToken.decimals());
        const sender = whaleAddress;
        await acquireToken(sender, swap.address, inToken, amount, deployer);
      });

      before("Attach to out-token", async () => {
        const outTokenAddress = getStablecoinAddress(outTokenSymbol, NETWORK);
        outToken = await ethers.getContractAt(
          "IDetailedERC20",
          outTokenAddress
        );
      });

      describe("swap", () => {
        it("Should swap in-token for out-token", async () => {
          const beforeInTokenBalance = await inToken.balanceOf(swap.address);

          await swap.swap(beforeInTokenBalance);

          const afterInTokenBalance = await inToken.balanceOf(swap.address);
          expect(afterInTokenBalance).to.equal(0);

          const afterOutTokenBalance = await outToken.balanceOf(swap.address);
          expect(afterOutTokenBalance).to.be.gt(0);
        });
      });
    });
  });
});
