const _ = require("lodash");
const hre = require("hardhat");
const { expect } = require("chai");
const { ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const { deploy } = require("../scripts/deploy/deployer.js");
const { FARM_TOKENS, WHALE_POOLS } = require("../utils/constants");
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

const depositTokens = ethers.BigNumber.from("1000000");

const poolTests = [
  {
    name: "curve-3pool",
    nCoins: 3,
    decimals: [18, 6, 6],
    ignoreIndexes: [],
    gaugeAddress: "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A",
  },
  {
    name: "curve-aave",
    nCoins: 3,
    decimals: [18, 6, 6],
    ignoreIndexes: [],
    gaugeAddress: "0xd662908ADA2Ea1916B3318327A97eB18aD588b5d",
  },
  {
    name: "curve-alusd",
    nCoins: 4,
    decimals: [18, 18, 6, 6],
    ignoreIndexes: [0],
    gaugeAddress: "0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477",
  },
  {
    name: "curve-busdv2",
    nCoins: 4,
    decimals: [18, 18, 6, 6],
    ignoreIndexes: [0],
    gaugeAddress: "0xd4B22fEdcA85E684919955061fDf353b9d38389b",
  },
  {
    name: "curve-compound",
    nCoins: 2,
    decimals: [18, 6],
    ignoreIndexes: [],
    gaugeAddress: "0x7ca5b0a2910B33e9759DC7dDB0413949071D7575",
  },
  {
    name: "curve-frax",
    nCoins: 4,
    decimals: [18, 18, 6, 6],
    ignoreIndexes: [0],
    gaugeAddress: "0x72E158d38dbd50A483501c24f792bDAAA3e7D55C",
  },
  {
    name: "curve-ironbank",
    nCoins: 3,
    decimals: [18, 6, 6],
    gaugeAddress: "0xF5194c3325202F456c95c1Cf0cA36f8475C1949F",
  },
  {
    name: "curve-lusd",
    nCoins: 4,
    decimals: [18, 18, 6, 6],
    ignoreIndexes: [0],
    gaugeAddress: "0x9B8519A9a00100720CCdC8a120fBeD319cA47a14",
  },
  {
    name: "curve-musd",
    nCoins: 4,
    decimals: [18, 18, 6, 6],
    ignoreIndexes: [0],
    gaugeAddress: "0x5f626c30EC1215f4EdCc9982265E8b1F411D1352",
  },
  //{
  //  name: "curve-saave",
  //  nCoins: 2,
  //  decimals: [18, 18],
  //  ignoreIndexes: [1],
  //  gaugeAddress: "0x462253b8F74B72304c145DB0e4Eebd326B22ca39",
  //},
  {
    name: "curve-susdv2",
    nCoins: 4,
    decimals: [18, 6, 6, 18],
    ignoreIndexes: [3],
    gaugeAddress: "0xA90996896660DEcC6E997655E065b23788857849",
  },
  {
    name: "curve-usdn",
    nCoins: 4,
    decimals: [18, 18, 6, 6],
    ignoreIndexes: [0],
    gaugeAddress: "0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4",
  },
  {
    name: "curve-usdp",
    nCoins: 4,
    decimals: [18, 18, 6, 6],
    ignoreIndexes: [0],
    gaugeAddress: "0x055be5DDB7A925BfEF3417FC157f53CA77cA7222",
  },
  {
    name: "curve-ust",
    nCoins: 4,
    decimals: [18, 18, 6, 6],
    ignoreIndexes: [0],
    gaugeAddress: "0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855",
  },
];

const swapTests = [
  //{ name: "aave-to-dai", symbol: "AAVE", outToken: "DAI" },
  //{ name: "aave-to-usdc", symbol: "AAVE", outToken: "USDC" },
  //{ name: "aave-to-usdt", symbol: "AAVE", outToken: "USDT" },
  { name: "crv-to-dai", symbol: "CRV", outToken: "DAI" },
  { name: "crv-to-usdc", symbol: "CRV", outToken: "USDC" },
  { name: "crv-to-usdt", symbol: "CRV", outToken: "USDT" },
];

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

  let underlyerPools;
  let underlyerTokens = {};

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
      underlyerPools,
      tvlManager,
      lpAccount,
      oracleAdapter,
    } = await deploy());

    await oracleAdapter.connect(emergencySafe).emergencyUnlock();
  });

  before("Attach to Mainnet stablecoin contracts", async () => {
    underlyerTokens.daiToken = await ethers.getContractAt(
      "IDetailedERC20",
      DAI_TOKEN
    );
    underlyerTokens.usdcToken = await ethers.getContractAt(
      "IDetailedERC20",
      USDC_TOKEN
    );
    underlyerTokens.usdtToken = await ethers.getContractAt(
      "IDetailedERC20",
      USDT_TOKEN
    );
  });

  before("Fund accounts with stables", async () => {
    // fund deployer with stablecoins
    await acquireToken(
      WHALE_POOLS["DAI"],
      deployer,
      underlyerTokens.daiToken,
      depositTokens.toString(),
      deployer
    );

    await acquireToken(
      WHALE_POOLS["USDC"],
      deployer,
      underlyerTokens.usdcToken,
      depositTokens.toString(),
      deployer
    );

    await acquireToken(
      WHALE_POOLS["USDT"],
      deployer,
      underlyerTokens.usdtToken,
      depositTokens.toString(),
      deployer
    );
  });

  describe("Normal funding", async () => {
    let fundingSnapshot;

    const fundingTests = [
      { tokenKey: "daiToken", poolKey: "daiPool" },
      { tokenKey: "usdcToken", poolKey: "usdcPool" },
      { tokenKey: "usdtToken", poolKey: "usdtPool" },
    ];

    fundingTests.forEach(({ tokenKey, poolKey }) => {
      it(`Should add liquidity to a pool`, async () => {
        const underlyer = underlyerTokens[tokenKey];
        const underlyerPool = underlyerPools[poolKey];

        const amount = tokenAmountToBigNumber(
          depositTokens.toString(),
          await underlyer.decimals()
        );
        const prevUserBalance = await underlyer.balanceOf(deployer.address);
        const prevPoolBalance = await underlyer.balanceOf(
          underlyerPool.address
        );

        const prevUserApt = await underlyerPool.balanceOf(deployer.address);
        expect(prevUserApt).to.equal(0);

        await underlyer.approve(underlyerPool.address, amount);
        await underlyerPool.addLiquidity(amount);

        const newUserBalance = await underlyer.balanceOf(deployer.address);
        const newPoolBalance = await underlyer.balanceOf(underlyerPool.address);

        expect(prevUserBalance.sub(newUserBalance)).to.equal(amount);
        expect(newPoolBalance.sub(prevPoolBalance)).to.equal(amount);

        const newUserApt = await underlyerPool.balanceOf(deployer.address);
        expect(newUserApt).to.be.gt(0);

        const snapshot = await timeMachine.takeSnapshot();
        fundingSnapshot = snapshot["result"];
      });
    });

    fundingTests.forEach(({ tokenKey, poolKey }) => {
      it("Should remove liquidity from a pool", async () => {
        const underlyer = underlyerTokens[tokenKey];
        const underlyerPool = underlyerPools[poolKey];

        const prevUserBalance = await underlyer.balanceOf(deployer.address);
        const prevPoolBalance = await underlyer.balanceOf(
          underlyerPool.address
        );

        const prevUserApt = await underlyerPool.balanceOf(deployer.address);
        const aptAmount = prevUserApt.div(5);
        // Make sure to add early withdrawal fee
        const amount = prevPoolBalance.div(5).mul(95).div(100);

        await underlyerPool.redeem(aptAmount);

        const newUserBalance = await underlyer.balanceOf(deployer.address);
        const newPoolBalance = await underlyer.balanceOf(underlyerPool.address);

        expect(newUserBalance.sub(prevUserBalance)).to.equal(amount);
        expect(prevPoolBalance.sub(newPoolBalance)).to.equal(amount);

        const newUserApt = await underlyerPool.balanceOf(deployer.address);
        expect(prevUserApt.sub(newUserApt)).to.equal(aptAmount);
      });
    });

    it("Should lend pool liquidity to the LP Account", async () => {
      await timeMachine.revertToSnapshot(fundingSnapshot);

      const daiToken = underlyerTokens.daiToken;
      const daiPool = underlyerPools.daiPool;

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

      const pools = [
        bytes32("daiPool"),
        bytes32("usdcPool"),
        bytes32("usdtPool"),
      ];
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
        .sub(prevLpBalance)
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
      function testDeploy(name, nCoins, decimals, ignoreIndexes) {
        return _.range(nCoins).forEach((index) => {
          if (!_.includes(ignoreIndexes, index)) {
            it(`Should deploy to token ${index} the pool`, async () => {
              const amounts = _.times(nCoins, _.constant(0));
              const amountToDeploy = depositTokens.div(poolTests.length + 1);
              amounts[index] = tokenAmountToBigNumber(
                amountToDeploy.toString(),
                decimals[index]
              );
              await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
            });
          }
        });
      }

      function testUnwind(name, nCoins, gaugeAddress) {
        _.range(nCoins).forEach((index) => {
          it(`token ${index}`, async () => {
            const gauge = await ethers.getContractAt(
              "ILiquidityGauge",
              gaugeAddress
            );

            const amount = await gauge.balanceOf(lpAccount.address);

            await lpAccount.connect(lpSafe).unwindStrategy(name, amount, index);
          });
        });
      }

      poolTests.forEach(
        ({ name, nCoins, decimals, ignoreIndexes, gaugeAddress }) => {
          describe(`${name} liquidity`, () => {
            testDeploy(name, nCoins, decimals, ignoreIndexes);

            describe("Should unwind each token from the pool", () => {
              let testSnapshotId;

              beforeEach(async () => {
                const snapshot = await timeMachine.takeSnapshot();
                testSnapshotId = snapshot["result"];
              });

              afterEach(async () => {
                await timeMachine.revertToSnapshot(testSnapshotId);
              });

              testUnwind(name, nCoins, gaugeAddress);
            });
          });
        }
      );

      describe("Farming for 1 month / 10 blocks...", async () => {
        let crv;
        let stkAave;
        let snx;

        before(async () => {
          const stakeTime = 60 * 60 * 24 * 30; // 1 month
          await hre.network.provider.send("evm_increaseTime", [stakeTime]);
          // advance a few blocks just in case
          await Promise.all(
            _.range(10).map(() => hre.network.provider.send("evm_mine"))
          );
        });

        before(async () => {
          crv = await ethers.getContractAt(
            "IDetailedERC20",
            FARM_TOKENS["CRV"]
          );

          stkAave = await ethers.getContractAt(
            "IDetailedERC20",
            FARM_TOKENS["stkAAVE"]
          );

          snx = await ethers.getContractAt(
            "IDetailedERC20",
            FARM_TOKENS["SNX"]
          );
        });

        poolTests.forEach(({ name }) => {
          if (
            !_.includes(["curve-aave", "curve-saave", "curve-susdv2"], name)
          ) {
            it(`Should claim CRV from ${name}`, async () => {
              const prevBalance = await crv.balanceOf(lpAccount.address);
              await lpAccount.connect(lpSafe).claim(name);
              const newBalance = await crv.balanceOf(lpAccount.address);

              expect(newBalance.sub(prevBalance)).to.be.gt(0);
            });
          } else if (!_.includes(["curve-susdv2"], name)) {
            it(`Should claim CRV and stkAAVE from ${name}`, async () => {
              const prevCrvBalance = await crv.balanceOf(lpAccount.address);
              const prevStkAaveBalance = await stkAave.balanceOf(
                lpAccount.address
              );
              await lpAccount.connect(lpSafe).claim(name);
              const newCrvBalance = await crv.balanceOf(lpAccount.address);
              const newStkAaveBalance = await stkAave.balanceOf(
                lpAccount.address
              );

              expect(newStkAaveBalance.sub(prevStkAaveBalance)).to.be.gt(0);
              expect(newCrvBalance.sub(prevCrvBalance)).to.be.gt(0);
            });
          } else {
            it(`Should claim CRV and SNX from ${name}`, async () => {
              const prevCrvBalance = await crv.balanceOf(lpAccount.address);
              const prevSnxBalance = await snx.balanceOf(lpAccount.address);
              await lpAccount.connect(lpSafe).claim(name);
              const newCrvBalance = await crv.balanceOf(lpAccount.address);
              const newSnxBalance = await snx.balanceOf(lpAccount.address);

              expect(newSnxBalance.sub(prevSnxBalance)).to.be.gt(0);
              expect(newCrvBalance.sub(prevCrvBalance)).to.be.gt(0);
            });
          }
        });

        swapTests.forEach(({ name, symbol }) => {
          it(`Should swap ${symbol} with ${name}`, async () => {
            const balance = await crv.balanceOf(lpAccount.address);
            const amount = balance.div(swapTests.length);
            await lpAccount.connect(lpSafe).swap(name, amount, 0);
          });
        });
      });
    });
  });
});
