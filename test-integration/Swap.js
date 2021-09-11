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

  const SwapConstants = [
    {
      contractName: "SwapCrvToDai",
      tokenSymbol: "DAI",
    },
    {
      contractName: "SwapCrvToUsdc",
      tokenSymbol: "USDC",
    },
    {
      contractName: "SwapCrvToUsdt",
      tokenSymbol: "USDT",
    },
  ];

  SwapConstants.forEach((swapConstant) => {
    const { contractName, tokenSymbol } = swapConstant;

    describe(contractName, () => {
      let swap;
      let crv;
      let stablecoin;

      let whaleAddress = FARM_TOKEN_POOLS["CRV"];

      before("Deploy swap contract", async () => {
        const Swap = await ethers.getContractFactory(contractName, lpSafe);
        swap = await Swap.deploy();
      });

      before("Fund swap with CRV", async () => {
        crv = await ethers.getContractAt("IDetailedERC20", FARM_TOKENS["CRV"]);

        const amount = tokenAmountToBigNumber(100000, await crv.decimals());
        const sender = whaleAddress;
        await acquireToken(sender, swap.address, crv, amount, deployer);
      });

      before(`Get ${tokenSymbol} contract`, async () => {
        const stablecoinAddress = getStablecoinAddress(tokenSymbol, NETWORK);
        stablecoin = await ethers.getContractAt(
          "IDetailedERC20",
          stablecoinAddress
        );
      });

      describe("swap", () => {
        it(`Should swap CRV for ${tokenSymbol}`, async () => {
          const beforeCrvBalance = await crv.balanceOf(swap.address);

          await swap.swap(beforeCrvBalance);

          const afterCrvBalance = await crv.balanceOf(swap.address);
          expect(afterCrvBalance).to.equal(0);

          const afterTokenBalance = await stablecoin.balanceOf(swap.address);
          expect(afterTokenBalance).to.be.gt(0);
        });
      });
    });
  });
});
