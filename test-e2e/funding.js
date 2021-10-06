const _ = require("lodash");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const { deploy } = require("../scripts/deploy/deployer.js");
const { WHALE_POOLS } = require("../utils/constants");
const {
  tokenAmountToBigNumber,
  bytes32,
  acquireToken,
  getStablecoinAddress,
  updateTvlAfterTransfer,
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
      lpAccount,
      oracleAdapter,
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
      const amount = tokenAmountToBigNumber(
        "100000",
        await daiToken.decimals()
      );
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
      await updateTvlAfterTransfer(
        daiPool,
        newPoolBalance,
        oracleAdapter,
        emergencySafe
      );

      const newLpBalance = await daiToken.balanceOf(lpAccount.address);

      const expectedReserveSize = newLpBalance
        .mul(reservePercentage)
        .div(ethers.BigNumber.from(100));

      expect(newPoolBalance).to.be.gt(
        expectedReserveSize.sub(tokenAmountToBigNumber("0.001"))
      );
      expect(newPoolBalance).to.be.lt(
        expectedReserveSize.add(tokenAmountToBigNumber("0.001"))
      );

      expect(prevPoolBalance.sub(newPoolBalance)).to.be.gt(
        fundAmount.sub(tokenAmountToBigNumber("0.001"))
      );
      expect(prevPoolBalance.sub(newPoolBalance)).to.be.lt(
        fundAmount.add(tokenAmountToBigNumber("0.001"))
      );

      const newPoolMapt = await metaPoolToken.balanceOf(daiPool.address);
      expect(newPoolMapt).to.be.gt(0);
    });

    describe("Run zaps", () => {
      const poolTests = [
        {
          name: "curve-3pool",
          amounts: [tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A",
        },
        {
          name: "curve-aave",
          amounts: [tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0xd662908ADA2Ea1916B3318327A97eB18aD588b5d",
        },
        {
          name: "curve-alusd",
          amounts: [0, tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477",
        },
        {
          name: "curve-busdv2",
          amounts: [0, tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0xd4B22fEdcA85E684919955061fDf353b9d38389b",
        },
        {
          name: "curve-compound",
          amounts: [tokenAmountToBigNumber("1000", 18), 0],
          gaugeAddress: "0x7ca5b0a2910B33e9759DC7dDB0413949071D7575",
        },
        {
          name: "curve-frax",
          amounts: [0, tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0x72E158d38dbd50A483501c24f792bDAAA3e7D55C",
        },
        {
          name: "curve-ironbank",
          amounts: [tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0xF5194c3325202F456c95c1Cf0cA36f8475C1949F",
        },
        {
          name: "curve-lusd",
          amounts: [0, tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0x9B8519A9a00100720CCdC8a120fBeD319cA47a14",
        },
        {
          name: "curve-musd",
          amounts: [0, tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0x5f626c30EC1215f4EdCc9982265E8b1F411D1352",
        },
        //{
        //  name: "curve-saave",
        //  amounts: [tokenAmountToBigNumber("1000", 18), 0],
        //  gaugeAddress: "0x462253b8F74B72304c145DB0e4Eebd326B22ca39",
        //},
        {
          name: "curve-susdv2",
          amounts: [tokenAmountToBigNumber("1000", 18), 0, 0, 0],
          gaugeAddress: "0xA90996896660DEcC6E997655E065b23788857849",
        },
        {
          name: "curve-usdn",
          amounts: [0, tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4",
        },
        {
          name: "curve-usdp",
          amounts: [0, tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0x055be5DDB7A925BfEF3417FC157f53CA77cA7222",
        },
        {
          name: "curve-ust",
          amounts: [0, tokenAmountToBigNumber("1000", 18), 0, 0],
          gaugeAddress: "0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855",
        },
      ];

      poolTests.forEach(({ name, amounts, gaugeAddress }) => {
        describe(name, () => {
          let subsuiteSnapshotId;

          before(async () => {
            const snapshot = await timeMachine.takeSnapshot();
            subsuiteSnapshotId = snapshot["result"];
          });

          after(async () => {
            await timeMachine.revertToSnapshot(subsuiteSnapshotId);
          });

          it("Should deploy to the pool", async () => {
            //const amounts = [tokenAmountToBigNumber("1000", 18), 0, 0];

            await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
          });

          describe("Should unwind each token from the pool", () => {
            let testSnapshotId;

            beforeEach(async () => {
              const snapshot = await timeMachine.takeSnapshot();
              testSnapshotId = snapshot["result"];
            });

            afterEach(async () => {
              await timeMachine.revertToSnapshot(testSnapshotId);
            });

            _.range(amounts.length).forEach((index) => {
              it(`token ${index}`, async () => {
                const gauge = await ethers.getContractAt(
                  "ILiquidityGauge",
                  gaugeAddress
                );

                const amount = await gauge.balanceOf(lpAccount.address);

                await lpAccount
                  .connect(lpSafe)
                  .unwindStrategy(name, amount, index);
              });
            });
          });
        });
      });
    });
  });
});
