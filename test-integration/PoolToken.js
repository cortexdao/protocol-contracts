const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero: ZERO_ADDRESS, MaxUint256: MAX_UINT256 } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const { STABLECOIN_POOLS } = require("../utils/constants");
const {
  acquireToken,
  console,
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
  expectEventInTransaction,
  deployAggregator,
} = require("../utils/helpers");

const link = (amount) => tokenAmountToBigNumber(amount, "18");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Contract: PoolToken", () => {
  let deployer;
  let manager;
  let oracle;
  let randomUser;
  let anotherUser;

  let ProxyAdmin;
  let PoolTokenProxy;
  let PoolToken;
  let PoolTokenV2;

  let MetaPoolToken;
  let MetaPoolTokenProxy;
  let TransparentUpgradeableProxy;

  before(async () => {
    [
      deployer,
      manager,
      oracle,
      randomUser,
      anotherUser,
    ] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    PoolTokenProxy = await ethers.getContractFactory("PoolTokenProxy");
    PoolToken = await ethers.getContractFactory("TestPoolToken");
    PoolTokenV2 = await ethers.getContractFactory("TestPoolTokenV2");
    MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");
    TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
  });

  // for Chainlink aggregator (price feed) addresses, see the Mainnet
  // section of: https://docs.chain.link/docs/ethereum-addresses
  const tokenParams = [
    {
      symbol: "USDC",
      tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      aggAddress: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    },
    {
      symbol: "DAI",
      tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      aggAddress: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
    },
    {
      symbol: "USDT",
      tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      aggAddress: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    },
  ];

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  tokenParams.forEach(function (params) {
    const { symbol, tokenAddress, aggAddress } = params;

    describe(`\n    **** ${symbol} as underlyer ****\n`, () => {
      let tvlAgg;
      let underlyer;
      let mApt;
      let addressRegistry;

      let poolToken;

      before("Setup", async () => {
        const agg = await ethers.getContractAt(
          "AggregatorV3Interface",
          aggAddress
        );
        underlyer = await ethers.getContractAt("IDetailedERC20", tokenAddress);

        const paymentAmount = link("1");
        const maxSubmissionValue = tokenAmountToBigNumber("1", "20");
        const tvlAggConfig = {
          paymentAmount, // payment amount (price paid for each oracle submission, in wei)
          minSubmissionValue: 0,
          maxSubmissionValue,
          decimals: 8, // decimal offset for answer
          description: "TVL aggregator",
        };
        tvlAgg = await deployAggregator(
          tvlAggConfig,
          oracle.address,
          deployer.address, // oracle owner
          deployer.address // ETH funder
        );

        ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
        MetaPoolTokenProxy = await ethers.getContractFactory(
          "MetaPoolTokenProxy"
        );
        MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");

        const proxyAdmin = await ProxyAdmin.deploy();
        await proxyAdmin.deployed();

        const mAptLogic = await MetaPoolToken.deploy();
        await mAptLogic.deployed();
        const mAptProxy = await MetaPoolTokenProxy.deploy(
          mAptLogic.address,
          proxyAdmin.address,
          tvlAgg.address,
          14400
        );
        await mAptProxy.deployed();
        mApt = await MetaPoolToken.attach(mAptProxy.address);
        await mApt.connect(deployer).setManagerAddress(manager.address);

        const AddressRegistryV2 = await ethers.getContractFactory(
          "AddressRegistryV2"
        );
        const AddressRegistryLogic = await AddressRegistryV2.deploy();
        const addressRegistryProxyAdmin = await ProxyAdmin.deploy();
        await addressRegistryProxyAdmin.deployed();

        const encodedParamData = AddressRegistryV2.interface.encodeFunctionData(
          "initialize(address)",
          [addressRegistryProxyAdmin.address]
        );

        const addressRegistryProxy = await TransparentUpgradeableProxy.deploy(
          AddressRegistryLogic.address,
          addressRegistryProxyAdmin.address,
          encodedParamData
        );

        addressRegistry = await AddressRegistryV2.attach(
          addressRegistryProxy.address
        );

        await addressRegistry.registerAddress(
          ethers.utils.formatBytes32String("mAPT"),
          mApt.address
        );

        const logic = await PoolToken.deploy();
        await logic.deployed();
        const proxy = await PoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          underlyer.address,
          agg.address
        );
        await proxy.deployed();

        const logicV2 = await PoolTokenV2.deploy();
        await logicV2.deployed();

        const initData = PoolTokenV2.interface.encodeFunctionData(
          "initializeUpgrade(address)",
          [addressRegistry.address]
        );
        await proxyAdmin
          .connect(deployer)
          .upgradeAndCall(proxy.address, logicV2.address, initData);

        poolToken = await PoolTokenV2.attach(proxy.address);

        await acquireToken(
          STABLECOIN_POOLS[symbol],
          randomUser.address,
          underlyer,
          "1000000",
          randomUser.address
        );

        //handle allownaces
        await underlyer
          .connect(randomUser)
          .approve(poolToken.address, MAX_UINT256);
        await underlyer
          .connect(anotherUser)
          .approve(poolToken.address, MAX_UINT256);

        console.debug(`Proxy Admin: ${proxyAdmin.address}`);
        console.debug(`Logic: ${logic.address}`);
        console.debug(`Proxy: ${proxy.address}`);
      });

      describe("Defaults", () => {
        it("Owner is set to deployer", async () => {
          assert.equal(await poolToken.owner(), deployer.address);
        });

        it("DEFAULT_APT_TO_UNDERLYER_FACTOR has correct value", async () => {
          assert.equal(await poolToken.DEFAULT_APT_TO_UNDERLYER_FACTOR(), 1000);
        });

        it("Name has correct value", async () => {
          assert.equal(await poolToken.name(), "APY Pool Token");
        });

        it("Symbol has correct value", async () => {
          assert.equal(await poolToken.symbol(), "APT");
        });

        it("Decimals has correct value", async () => {
          assert.equal(await poolToken.decimals(), 18);
        });
      });

      describe("Set admin address", async () => {
        it("Owner can set admin", async () => {
          await poolToken.connect(deployer).setAdminAddress(FAKE_ADDRESS);
          expect(await poolToken.proxyAdmin()).to.equal(FAKE_ADDRESS);
        });

        it("Revert on setting to zero address", async () => {
          await expect(
            poolToken.connect(deployer).setAdminAddress(ZERO_ADDRESS)
          ).to.be.revertedWith("INVALID_ADMIN");
        });

        it("Revert when non-owner attempts to set address", async () => {
          await expect(
            poolToken.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      describe("Set price aggregator address", async () => {
        it("Revert when agg address is zero", async () => {
          await expect(
            poolToken.setPriceAggregator(ZERO_ADDRESS)
          ).to.be.revertedWith("INVALID_AGG");
        });

        it("Revert when non-owner attempts to set agg", async () => {
          await expect(
            poolToken.connect(randomUser).setPriceAggregator(FAKE_ADDRESS)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Owner can set agg", async () => {
          const setPromise = poolToken
            .connect(deployer)
            .setPriceAggregator(FAKE_ADDRESS);
          await setPromise;

          const priceAgg = await poolToken.priceAgg();
          assert.equal(priceAgg, FAKE_ADDRESS);

          await expect(setPromise)
            .to.emit(poolToken, "PriceAggregatorChanged")
            .withArgs(FAKE_ADDRESS);
        });
      });

      describe("Approvals", () => {
        it("Owner can call infiniteApprove", async () => {
          await expect(
            poolToken.connect(deployer).infiniteApprove(FAKE_ADDRESS)
          ).to.not.be.reverted;
        });

        it("Revert when non-owner calls infiniteApprove", async () => {
          await expect(
            poolToken.connect(randomUser).infiniteApprove(FAKE_ADDRESS)
          ).to.be.reverted;
        });

        it("Owner can call revokeApprove", async () => {
          await expect(poolToken.connect(deployer).revokeApprove(FAKE_ADDRESS))
            .to.not.be.reverted;
        });

        it("Revert when non-owner calls revokeApprove", async () => {
          await expect(
            poolToken.connect(randomUser).revokeApprove(FAKE_ADDRESS)
          ).to.be.reverted;
        });
      });

      describe("Lock pool", () => {
        it("Owner can lock and unlock pool", async () => {
          await expect(poolToken.connect(deployer).lock()).to.emit(
            poolToken,
            "Paused"
          );
          await expect(poolToken.connect(deployer).unlock()).to.emit(
            poolToken,
            "Unpaused"
          );
        });

        it("Revert when non-owner attempts to lock", async () => {
          await expect(poolToken.connect(randomUser).lock()).to.be.revertedWith(
            "Ownable: caller is not the owner"
          );
        });

        it("Revert when non-owner attempts to unlock", async () => {
          await expect(
            poolToken.connect(randomUser).unlock()
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Revert when calling addLiquidity/redeem on locked pool", async () => {
          await poolToken.connect(deployer).lock();

          await expect(
            poolToken.connect(randomUser).addLiquidity(50)
          ).to.revertedWith("Pausable: paused");

          await expect(
            poolToken.connect(randomUser).redeem(50)
          ).to.revertedWith("Pausable: paused");
        });

        it("Revert when calling infiniteApprove on locked pool", async () => {
          await poolToken.connect(deployer).lock();

          await expect(
            poolToken.connect(deployer).infiniteApprove(FAKE_ADDRESS)
          ).to.revertedWith("Pausable: paused");
        });

        it("Allow calling revokeApprove on locked pool", async () => {
          await poolToken.connect(deployer).lock();

          await expect(poolToken.connect(deployer).revokeApprove(FAKE_ADDRESS))
            .to.not.be.reverted;
        });
      });

      describe("Lock addLiquidity", () => {
        it("Owner can lock", async () => {
          await expect(poolToken.connect(deployer).lockAddLiquidity()).to.emit(
            poolToken,
            "AddLiquidityLocked"
          );
        });

        it("Owner can unlock", async () => {
          await expect(
            poolToken.connect(deployer).unlockAddLiquidity()
          ).to.emit(poolToken, "AddLiquidityUnlocked");
        });

        it("Revert if non-owner attempts to lock", async () => {
          await expect(
            poolToken.connect(randomUser).lockAddLiquidity()
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Revert if non-owner attempts to unlock", async () => {
          await expect(
            poolToken.connect(randomUser).unlockAddLiquidity()
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Revert deposit when pool is locked", async () => {
          await poolToken.connect(deployer).lockAddLiquidity();

          await expect(
            poolToken.connect(randomUser).addLiquidity(1)
          ).to.be.revertedWith("LOCKED");
        });

        it("Deposit should work after unlock", async () => {
          await poolToken.connect(deployer).lockAddLiquidity();
          await poolToken.connect(deployer).unlockAddLiquidity();

          await expect(poolToken.connect(randomUser).addLiquidity(1)).to.not.be
            .reverted;
        });
      });

      describe("Lock redeem", () => {
        it("Owner can lock", async () => {
          await expect(poolToken.connect(deployer).lockRedeem()).to.emit(
            poolToken,
            "RedeemLocked"
          );
        });

        it("Owner can unlock", async () => {
          await expect(poolToken.connect(deployer).unlockRedeem()).to.emit(
            poolToken,
            "RedeemUnlocked"
          );
        });

        it("Revert if non-owner attempts to lock", async () => {
          await expect(
            poolToken.connect(randomUser).lockRedeem()
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Revert if non-owner attempts to unlock", async () => {
          await expect(
            poolToken.connect(randomUser).unlockRedeem()
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Revert redeem when pool is locked", async () => {
          await poolToken.connect(deployer).lockRedeem();

          await expect(
            poolToken.connect(randomUser).redeem(1)
          ).to.be.revertedWith("LOCKED");
        });

        it("Redeem should work after unlock", async () => {
          await poolToken.connect(deployer).lockRedeem();
          await poolToken.connect(deployer).unlockRedeem();

          await poolToken.mint(randomUser.address, 1);
          await expect(poolToken.connect(randomUser).redeem(1)).to.not.be
            .reverted;
        });
      });

      describe("Block inter-user APT transfers", () => {
        it("Revert APT transfer", async () => {
          const decimals = await poolToken.decimals();
          const amount = tokenAmountToBigNumber("1", decimals);
          await expect(
            poolToken.connect(randomUser).transfer(anotherUser.address, amount)
          ).to.be.revertedWith("INVALID_TRANSFER");
        });

        it("Revert APT transferFrom", async () => {
          const decimals = await poolToken.decimals();
          const amount = tokenAmountToBigNumber("1", decimals);
          await expect(
            poolToken
              .connect(deployer)
              .transferFrom(randomUser.address, anotherUser.address, amount)
          ).to.be.revertedWith("INVALID_TRANSFER");
        });
      });

      const usdDecimals = 8;
      const deployedValues = [
        tokenAmountToBigNumber(0, usdDecimals),
        tokenAmountToBigNumber(837290, usdDecimals),
        tokenAmountToBigNumber(32283729, usdDecimals),
      ];
      deployedValues.forEach(function (deployedValue) {
        describe(`deployed value: ${deployedValue}`, () => {
          const mAptSupply = tokenAmountToBigNumber("100");

          async function updateTvlAgg(usdDeployedValue) {
            const lastRoundId = await tvlAgg.latestRound();
            const newRoundId = lastRoundId.add(1);
            await tvlAgg.connect(oracle).submit(newRoundId, usdDeployedValue);
          }

          beforeEach(async () => {
            /* these get rollbacked after each test due to snapshotting */

            // default to giving entire deployed value to the pool
            await mApt.connect(manager).mint(poolToken.address, mAptSupply);
            await updateTvlAgg(deployedValue);
          });

          describe("Underlyer and mAPT integration with calculations", () => {
            beforeEach(async () => {
              /* these get rollbacked after each test due to snapshotting */
              const aptAmount = tokenAmountToBigNumber("1000000000", "18");
              await poolToken.mint(deployer.address, aptAmount);
              const symbol = await underlyer.symbol();
              await acquireToken(
                STABLECOIN_POOLS[symbol],
                poolToken.address,
                underlyer,
                "10000",
                deployer.address
              );
            });

            it("calculateMintAmount returns value", async () => {
              const depositAmount = tokenAmountToBigNumber(
                1,
                await underlyer.decimals()
              );
              const expectedAptMinted = await poolToken.calculateMintAmount(
                depositAmount
              );
              console.debug(
                `\tExpected APT Minted: ${expectedAptMinted.toString()}`
              );
              assert(expectedAptMinted.gt(0));
            });

            it("getPoolTotalValue returns value", async () => {
              const val = await poolToken.getPoolTotalValue();
              console.debug(`\tPool Total Eth Value ${val.toString()}`);
              assert(val.gt(0));
            });

            it("getAPTValue returns value", async () => {
              const aptAmount = tokenAmountToBigNumber("100", "18");
              const val = await poolToken.getAPTValue(aptAmount);
              console.debug(`\tAPT Eth Value: ${val.toString()}`);
              assert(val.gt(0));
            });

            it("getUnderlyerAmountFromValue returns value", async () => {
              const usdValue = tokenAmountToBigNumber("500", "8");
              const tokenAmount = await poolToken.getUnderlyerAmountFromValue(
                usdValue
              );
              console.debug(
                `\tToken Amount from Eth Value: ${tokenAmount.toString()}`
              );
              assert(tokenAmount.gt(0));
            });

            it("getValueFromUnderlyerAmount returns value", async () => {
              const amount = tokenAmountToBigNumber(
                5000,
                await underlyer.decimals()
              );
              const val = await poolToken.getValueFromUnderlyerAmount(amount);
              console.debug(`\tEth Value from Token Amount ${val.toString()}`);
              assert(val.gt(0));
            });

            it("getUnderlyerPrice returns value", async () => {
              const price = await poolToken.getUnderlyerPrice();
              console.debug(`\tToken Eth Price: ${price.toString()}`);
              assert(price.gt(0));
            });

            it("getUnderlyerAmount returns value", async () => {
              const aptAmount = tokenAmountToBigNumber("100", "18");
              const underlyerAmount = await poolToken.getUnderlyerAmount(
                aptAmount
              );
              console.debug(
                `\tUnderlyer Amount: ${underlyerAmount.toString()}`
              );
              assert(underlyerAmount.gt(0));
            });

            it("getUnderlyerValue returns correct value", async () => {
              let underlyerBalance = await underlyer.balanceOf(
                poolToken.address
              );
              let expectedUnderlyerValue = await poolToken.getValueFromUnderlyerAmount(
                underlyerBalance
              );
              expect(await poolToken.getPoolUnderlyerValue()).to.equal(
                expectedUnderlyerValue
              );

              const underlyerAmount = tokenAmountToBigNumber(
                "1553",
                await underlyer.decimals()
              );
              await underlyer
                .connect(randomUser)
                .transfer(poolToken.address, underlyerAmount);

              underlyerBalance = await underlyer.balanceOf(poolToken.address);
              expectedUnderlyerValue = await poolToken.getValueFromUnderlyerAmount(
                underlyerBalance
              );
              expect(await poolToken.getPoolUnderlyerValue()).to.equal(
                expectedUnderlyerValue
              );
            });

            it("getDeployedValue returns correct value", async () => {
              expect(await poolToken.getDeployedValue()).to.equal(
                deployedValue
              );

              // transfer quarter of mAPT to another pool
              await mApt.connect(manager).mint(FAKE_ADDRESS, mAptSupply.div(4));
              await mApt
                .connect(manager)
                .burn(poolToken.address, mAptSupply.div(4));
              // must update agg so staleness check passes
              await updateTvlAgg(deployedValue);
              expect(await poolToken.getDeployedValue()).to.equal(
                deployedValue.mul(3).div(4)
              );

              // transfer same amount again
              await mApt.connect(manager).mint(FAKE_ADDRESS, mAptSupply.div(4));
              await mApt
                .connect(manager)
                .burn(poolToken.address, mAptSupply.div(4));
              // must update agg so staleness check passes
              await updateTvlAgg(deployedValue);
              expect(await poolToken.getDeployedValue()).to.equal(
                deployedValue.div(2)
              );
            });

            it("getReserveTopUpValue returns correct value", async () => {
              const topUpValue = await poolToken.getReserveTopUpValue();
              if (deployedValue == 0) {
                expect(topUpValue).to.be.lt(0);
              } else {
                // it's possible to be negative, but not for the current
                // values we picked where underlyer amount is very small
                // compared to the deployed values
                expect(topUpValue).to.be.gt(0);
              }

              const poolUnderlyerValue = await poolToken.getPoolUnderlyerValue();
              // assuming we unwind the top-up value from the pool's deployed
              // capital, the reserve percentage of resulting deployed value
              // is what we are targeting
              const reservePercentage = await poolToken.reservePercentage();
              const targetValue = deployedValue
                .sub(topUpValue)
                .mul(reservePercentage)
                .div(100);
              const tolerance = Math.ceil((await underlyer.decimals()) / 4);
              const allowedDeviation = tokenAmountToBigNumber(5, tolerance);
              expect(
                poolUnderlyerValue.add(topUpValue).sub(targetValue)
              ).to.be.lt(allowedDeviation);
            });
          });

          describe("addLiquidity", () => {
            it("Revert if deposit is zero", async () => {
              await expect(poolToken.addLiquidity(0)).to.be.revertedWith(
                "AMOUNT_INSUFFICIENT"
              );
            });

            it("Revert if allowance is less than deposit", async () => {
              await expect(poolToken.addLiquidity(1)).to.be.revertedWith(
                "ALLOWANCE_INSUFFICIENT"
              );
            });

            it("Test addLiquidity pass", async () => {
              const underlyerBalanceBefore = await underlyer.balanceOf(
                randomUser.address
              );
              console.debug(
                `\tUnderlyer Balance Before Mint: ${underlyerBalanceBefore.toString()}`
              );

              const depositAmount = tokenAmountToBigNumber(
                1000,
                await underlyer.decimals()
              );
              const mintAmount = await poolToken.calculateMintAmount(
                depositAmount
              );

              const addLiquidityPromise = poolToken
                .connect(randomUser)
                .addLiquidity(depositAmount);
              const trx = await addLiquidityPromise;

              let underlyerBalanceAfter = await underlyer.balanceOf(
                randomUser.address
              );
              console.debug(
                `\tUnderlyer Balance After Mint: ${underlyerBalanceAfter.toString()}`
              );

              expect(await underlyer.balanceOf(poolToken.address)).to.equal(
                depositAmount
              );
              expect(await underlyer.balanceOf(randomUser.address)).to.equal(
                underlyerBalanceBefore.sub(depositAmount)
              );
              expect(await poolToken.balanceOf(randomUser.address)).to.equal(
                mintAmount
              );

              // APT transfer event
              await expectEventInTransaction(trx.hash, underlyer, "Transfer", {
                from: randomUser.address,
                to: poolToken.address,
                value: depositAmount,
              });

              // APT transfer event
              await expect(addLiquidityPromise)
                .to.emit(poolToken, "Transfer")
                .withArgs(ZERO_ADDRESS, randomUser.address, mintAmount);

              // DepositedAPT event:
              // check the values reflect post-interaction state
              const depositValue = await poolToken.getValueFromUnderlyerAmount(
                depositAmount
              );
              const poolValue = await poolToken.getPoolTotalValue();
              await expect(addLiquidityPromise)
                .to.emit(poolToken, "DepositedAPT")
                .withArgs(
                  randomUser.address,
                  underlyer.address,
                  depositAmount,
                  mintAmount,
                  depositValue,
                  poolValue
                );
            });
          });

          describe("redeem", () => {
            it("Revert if withdraw is zero", async () => {
              await expect(poolToken.redeem(0)).to.be.revertedWith(
                "AMOUNT_INSUFFICIENT"
              );
            });

            it("Revert if APT balance is less than withdraw", async () => {
              await poolToken.mint(randomUser.address, 1);
              await expect(
                poolToken.connect(randomUser).redeem(2)
              ).to.be.revertedWith("BALANCE_INSUFFICIENT");
            });

            it("Revert when underlyer amount is greater than reserve", async () => {
              // When zero deployed value, APT share gives ownership of only
              // underlyer amount, and this amount will be fully in the reserve
              // so there is nothing to test.
              if (deployedValue == 0) return;

              const decimals = await underlyer.decimals();

              // mint the APT supply
              const aptSupply = tokenAmountToBigNumber("100000");
              await poolToken.mint(deployer.address, aptSupply);

              // seed the pool with underlyer
              const reserveBalance = tokenAmountToBigNumber("150000", decimals);
              await underlyer
                .connect(randomUser)
                .transfer(poolToken.address, reserveBalance);

              // calculate slightly more than APT amount corresponding to the reserve
              const extraAmount = tokenAmountToBigNumber("1", decimals);
              const reserveAptAmountPlusExtra = await poolToken.calculateMintAmount(
                reserveBalance.add(extraAmount)
              );

              // "transfer" slightly more than reserve's APT amount to the user
              // (direct transfer between users is blocked)
              await poolToken.burn(deployer.address, reserveAptAmountPlusExtra);
              await poolToken.mint(
                randomUser.address,
                reserveAptAmountPlusExtra
              );

              await expect(
                poolToken.connect(randomUser).redeem(reserveAptAmountPlusExtra)
              ).to.be.revertedWith("RESERVE_INSUFFICIENT");
            });

            it("Test redeem pass", async () => {
              // mint APT supply
              const aptSupply = tokenAmountToBigNumber("10000");
              await poolToken.mint(deployer.address, aptSupply);

              /* Setup pool and user APT amounts:
                 1) give pool an underlyer reserve balance
                 2) calculate the reserve's APT amount
                 3) transfer APT amount less than that to the user
              */
              await underlyer
                .connect(randomUser)
                .transfer(
                  poolToken.address,
                  tokenAmountToBigNumber("1000", await underlyer.decimals())
                );
              const reserveBalance = await underlyer.balanceOf(
                poolToken.address
              );
              const reserveAptAmount = await poolToken.calculateMintAmount(
                reserveBalance
              );
              const redeemAptAmount = reserveAptAmount.div(2);
              const underlyerAmount = await poolToken.getUnderlyerAmount(
                redeemAptAmount
              );
              await poolToken.mint(randomUser.address, redeemAptAmount);
              await poolToken.burn(deployer.address, redeemAptAmount);

              let underlyerBalance = await underlyer.balanceOf(
                randomUser.address
              );

              // execute the redeem
              const redeemPromise = poolToken
                .connect(randomUser)
                .redeem(redeemAptAmount);
              const trx = await redeemPromise;

              /* ------ START THE ASSERTS -------------- */

              // underlyer balances
              let underlyerBalanceAfter = await underlyer.balanceOf(
                randomUser.address
              );
              const underlyerTransferAmount = underlyerBalanceAfter.sub(
                underlyerBalance
              );
              expect(underlyerTransferAmount).to.equal(underlyerAmount);
              expect(await underlyer.balanceOf(poolToken.address)).to.equal(
                reserveBalance.sub(underlyerAmount)
              );

              // APT balances
              expect(await poolToken.balanceOf(randomUser.address)).to.equal(0);
              expect(await poolToken.totalSupply()).to.equal(
                aptSupply.sub(redeemAptAmount)
              );

              // underlyer transfer event
              await expectEventInTransaction(trx.hash, underlyer, "Transfer", {
                from: poolToken.address,
                to: randomUser.address,
                value: underlyerTransferAmount,
              });

              // APT transfer event
              await expect(redeemPromise)
                .to.emit(poolToken, "Transfer")
                .withArgs(randomUser.address, ZERO_ADDRESS, redeemAptAmount);

              // RedeemedAPT event:
              // check the values reflect post-interaction state
              const tokenValue = await poolToken.getValueFromUnderlyerAmount(
                underlyerTransferAmount
              );
              const poolValue = await poolToken.getPoolTotalValue();
              await expect(redeemPromise)
                .to.emit(poolToken, "RedeemedAPT")
                .withArgs(
                  randomUser.address,
                  underlyer.address,
                  underlyerTransferAmount,
                  redeemAptAmount,
                  tokenValue,
                  poolValue
                );
            });
          });

          describe("Test for dust", () => {
            it("getUnderlyerAmount after calculateMintAmount results in small dust", async () => {
              // increase APT total supply
              await poolToken.mint(
                deployer.address,
                tokenAmountToBigNumber("100000")
              );
              // seed pool with stablecoin
              await acquireToken(
                STABLECOIN_POOLS[symbol],
                poolToken.address,
                underlyer,
                "12000000", // 12 MM
                deployer.address
              );

              const depositAmount = tokenAmountToBigNumber(
                "1",
                await underlyer.decimals()
              );
              const mintAmount = await poolToken.calculateMintAmount(
                depositAmount
              );
              await poolToken.connect(randomUser).addLiquidity(depositAmount);
              const underlyerAmount = await poolToken.getUnderlyerAmount(
                mintAmount
              );
              expect(underlyerAmount).to.be.lt(depositAmount);
              const tolerance = Math.ceil((await underlyer.decimals()) / 4);
              const allowedDeviation = tokenAmountToBigNumber(5, tolerance);
              expect(Math.abs(underlyerAmount.sub(depositAmount))).to.be.lt(
                allowedDeviation
              );
            });
          });

          describe("Test early withdrawal fee", () => {
            let underlyerAmount;
            let aptAmount;

            beforeEach(async () => {
              // increase APT total supply
              await poolToken.mint(
                deployer.address,
                tokenAmountToBigNumber("100000")
              );
              // seed pool with stablecoin
              await acquireToken(
                STABLECOIN_POOLS[symbol],
                poolToken.address,
                underlyer,
                "12000000", // 12 MM
                deployer.address
              );

              underlyerAmount = tokenAmountToBigNumber(
                "1",
                await underlyer.decimals()
              );
              aptAmount = await poolToken.calculateMintAmount(underlyerAmount);
              await poolToken.connect(randomUser).addLiquidity(underlyerAmount);
            });

            it("Deduct fee if redeem is during fee period", async () => {
              const fee = underlyerAmount
                .mul(await poolToken.feePercentage())
                .div(100);
              const underlyerAmountMinusFee = underlyerAmount.sub(fee);

              const beforeBalance = await underlyer.balanceOf(
                randomUser.address
              );
              await poolToken.connect(randomUser).redeem(aptAmount);
              const afterBalance = await underlyer.balanceOf(
                randomUser.address
              );
              const transferAmount = afterBalance.sub(beforeBalance);

              const tolerance = Math.ceil((await underlyer.decimals()) / 4);
              const allowedDeviation = tokenAmountToBigNumber(5, tolerance);
              expect(
                Math.abs(underlyerAmountMinusFee.sub(transferAmount))
              ).to.be.lt(allowedDeviation);
            });

            it("No fee if redeem is after fee period", async () => {
              const feePeriod = await poolToken.feePeriod();
              // advance time by feePeriod seconds and mine next block
              await ethers.provider.send("evm_increaseTime", [
                feePeriod.toNumber(),
              ]);
              await ethers.provider.send("evm_mine");
              // effectively disable staleness check
              await mApt.setAggStalePeriod(MAX_UINT256);

              const beforeBalance = await underlyer.balanceOf(
                randomUser.address
              );
              await poolToken.connect(randomUser).redeem(aptAmount);
              const afterBalance = await underlyer.balanceOf(
                randomUser.address
              );
              const transferAmount = afterBalance.sub(beforeBalance);

              const tolerance = Math.ceil((await underlyer.decimals()) / 4);
              const allowedDeviation = tokenAmountToBigNumber(5, tolerance);
              expect(Math.abs(underlyerAmount.sub(transferAmount))).to.be.lt(
                allowedDeviation
              );
            });
          });
        });
      });
    });
  });
});
