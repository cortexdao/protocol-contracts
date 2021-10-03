const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { deploy } = require("../scripts/deploy/deployer.js");
const { WHALE_POOLS } = require("../utils/constants");
const {
  tokenAmountToBigNumber,
  bytes32,
  acquireToken,
  getStablecoinAddress,
} = require("../utils/helpers");

/****************************/
/* set DEBUG log level here */
/****************************/
console.debugging = false;
/****************************/

const NETWORK = "MAINNET";
const SYMBOLS = ["DAI", "USDC", "USDT"];
const TOKEN_ADDRESSES = SYMBOLS.map((symbol) =>
  getStablecoinAddress(symbol, NETWORK)
);

const DAI_TOKEN = TOKEN_ADDRESSES[0];
const USDC_TOKEN = TOKEN_ADDRESSES[1];
const USDT_TOKEN = TOKEN_ADDRESSES[2];

describe("Funding scenarios", () => {
  let deployer;
  let randomUser;
  let lpSafe;
  let adminSafe;
  let emergencySafe;

  let addressRegistry;
  let metaPoolToken;
  let tvlManager;
  let oracleAdapter;
  let lpAccount;

  let daiPool;
  let usdcPool;
  let usdtPool;

  let daiToken;
  let usdcToken;
  let usdtToken;

  // use EVM snapshots for test isolation
  let suiteSnapshotId;

  before(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  before("Get signers", async () => {
    [deployer, randomUser] = await ethers.getSigners();
  });

  before("Deploy platform", async () => {
    ({
      lpSafe,
      adminSafe,
      emergencySafe,
      addressRegistry,
      metaPoolToken,
      daiPool,
      usdcPool,
      usdtPool,
      tvlManager,
      oracleAdapter,
      lpAccount,
    } = await deploy());

    await oracleAdapter.connect(emergencySafe).emergencyUnlock();
  });

  before("Attach to Mainnet stablecoin contracts", async () => {
    daiToken = await ethers.getContractAt("IDetailedERC20", DAI_TOKEN);
    usdcToken = await ethers.getContractAt("IDetailedERC20", USDC_TOKEN);
    usdtToken = await ethers.getContractAt("IDetailedERC20", USDT_TOKEN);
  });

  before("Fund accounts with stables", async () => {
    // fund deployer with stablecoins
    await acquireToken(
      WHALE_POOLS["DAI"],
      deployer,
      daiToken,
      "1000000",
      deployer
    );

    await acquireToken(
      WHALE_POOLS["USDC"],
      deployer,
      usdcToken,
      "1000000",
      deployer
    );

    await acquireToken(
      WHALE_POOLS["USDT"],
      deployer,
      usdtToken,
      "1000000",
      deployer
    );
  });

  describe("Normal funding", () => {
    it("Should add liquidity to a pool", async () => {
      const amount = tokenAmountToBigNumber("1000", await daiToken.decimals());
      const prevUserBalance = await daiToken.balanceOf(deployer.address);
      const prevPoolBalance = await daiToken.balanceOf(daiPool.address);

      const prevUserApt = await daiPool.balanceOf(deployer.address);
      expect(prevUserApt).to.equal(0);

      await daiToken.approve(daiPool.address, amount);
      await daiPool.addLiquidity(amount);

      const newUserBalance = await daiToken.balanceOf(deployer.address);
      const newPoolBalance = await daiToken.balanceOf(daiPool.address);

      expect(prevUserBalance.sub(newUserBalance)).to.equal(amount);
      expect(newPoolBalance.sub(prevPoolBalance)).to.equal(amount);

      const newUserApt = await daiPool.balanceOf(deployer.address);
      expect(newUserApt).to.be.gt(0);
    });

    it("Should remove liquidity from a pool", async () => {
      const prevUserBalance = await daiToken.balanceOf(deployer.address);
      const prevPoolBalance = await daiToken.balanceOf(daiPool.address);

      const prevUserApt = await daiPool.balanceOf(deployer.address);
      const aptAmount = prevUserApt.div(5);
      // Make sure to add early withdrawal fee
      const amount = prevPoolBalance.div(5).mul(95).div(100);

      await daiPool.redeem(aptAmount);

      const newUserBalance = await daiToken.balanceOf(deployer.address);
      const newPoolBalance = await daiToken.balanceOf(daiPool.address);

      expect(newUserBalance.sub(prevUserBalance)).to.equal(amount);
      expect(prevPoolBalance.sub(newPoolBalance)).to.equal(amount);

      const newUserApt = await daiPool.balanceOf(deployer.address);
      expect(prevUserApt.sub(newUserApt)).to.equal(aptAmount);
    });

    it("Should lend pool liquidity to the LP Account", async () => {
      // Cannot rely on Chainlink values during testing
      await oracleAdapter.connect(emergencySafe).emergencySetTvl(0, 50);

      const reservePercentage = await daiPool.reservePercentage();

      const prevPoolBalance = await daiToken.balanceOf(daiPool.address);
      const fundAmount = prevPoolBalance
        .mul(100)
        .div(reservePercentage.add(100));

      const prevLpBalance = await daiToken.balanceOf(lpAccount.address);

      const prevPoolMapt = await metaPoolToken.balanceOf(daiPool.address);
      expect(prevPoolMapt).to.equal(0);

      const pools = [bytes32("daiPool")];
      await metaPoolToken.connect(lpSafe).fundLpAccount(pools);

      const newPoolBalance = await daiToken.balanceOf(daiPool.address);
      const newLpBalance = await daiToken.balanceOf(lpAccount.address);

      const expectedReserveSize = newLpBalance
        .mul(reservePercentage)
        .div(ethers.BigNumber.from(100));
      expect(newPoolBalance).to.equal(expectedReserveSize);

      expect(prevPoolBalance.sub(newPoolBalance)).to.equal(fundAmount);

      const newPoolMapt = await metaPoolToken.balanceOf(daiPool.address);
      expect(newPoolMapt).to.be.gt(0);
    });
  });
});
