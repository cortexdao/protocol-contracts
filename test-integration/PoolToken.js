const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero: ZERO_ADDRESS, MaxUint256: MAX_UINT256 } = ethers.constants;
const {
  impersonateAccount,
  bytes32,
  getAggregatorAddress,
  getStablecoinAddress,
} = require("../utils/helpers");
const timeMachine = require("ganache-time-traveler");
const { WHALE_POOLS, FARM_TOKENS } = require("../utils/constants");
const {
  acquireToken,
  console,
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
  expectEventInTransaction,
  deployAggregator,
  forciblySendEth,
} = require("../utils/helpers");

const link = (amount) => tokenAmountToBigNumber(amount, "18");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Contract: PoolToken", () => {
  let deployer;
  let oracle;
  let lpAccount;
  let tvlManager;
  let lpSafe;
  let adminSafe;
  let emergencySafe;
  let randomUser;
  let anotherUser;

  before(async () => {
    [
      deployer,
      oracle,
      lpAccount,
      tvlManager,
      lpSafe,
      adminSafe,
      emergencySafe,
      randomUser,
      anotherUser,
    ] = await ethers.getSigners();
  });

  const NETWORK = "MAINNET";
  const SYMBOLS = ["DAI", "USDC", "USDT"];

  const tokenParams = SYMBOLS.map((symbol) => {
    return {
      symbol: symbol,
      tokenAddress: getStablecoinAddress(symbol, NETWORK),
      aggAddress: getAggregatorAddress(`${symbol}-USD`, NETWORK),
    };
  });

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
      let oracleAdapter;
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

        const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");

        const AddressRegistryV2 = await ethers.getContractFactory(
          "AddressRegistryV2"
        );
        const addressRegistryLogic = await AddressRegistryV2.deploy();
        const addressRegistryProxyAdmin = await ProxyAdmin.deploy();
        await addressRegistryProxyAdmin.deployed();

        const encodedParamData = AddressRegistryV2.interface.encodeFunctionData(
          "initialize(address)",
          [addressRegistryProxyAdmin.address]
        );

        const TransparentUpgradeableProxy = await ethers.getContractFactory(
          "TransparentUpgradeableProxy"
        );
        const addressRegistryProxy = await TransparentUpgradeableProxy.deploy(
          addressRegistryLogic.address,
          addressRegistryProxyAdmin.address,
          encodedParamData
        );

        addressRegistry = await AddressRegistryV2.attach(
          addressRegistryProxy.address
        );

        await addressRegistry.registerAddress(
          bytes32("tvlManager"),
          tvlManager.address
        );

        await addressRegistry.registerAddress(
          bytes32("lpAccount"),
          lpAccount.address
        );

        await addressRegistry.registerAddress(
          bytes32("adminSafe"),
          adminSafe.address
        );

        await addressRegistry.registerAddress(
          bytes32("emergencySafe"),
          emergencySafe.address
        );

        await addressRegistry.registerAddress(
          bytes32("lpSafe"),
          lpSafe.address
        );

        const proxyAdmin = await ProxyAdmin.deploy();
        await proxyAdmin.deployed();

        const MetaPoolToken = await ethers.getContractFactory(
          "TestMetaPoolToken"
        );
        const mAptLogic = await MetaPoolToken.deploy();
        await mAptLogic.deployed();

        const mAptInitData = MetaPoolToken.interface.encodeFunctionData(
          "initialize(address)",
          [addressRegistry.address]
        );
        const mAptProxy = await TransparentUpgradeableProxy.deploy(
          mAptLogic.address,
          proxyAdmin.address,
          mAptInitData
        );
        await mAptProxy.deployed();
        mApt = await MetaPoolToken.attach(mAptProxy.address);

        await addressRegistry.registerAddress(bytes32("mApt"), mApt.address);

        const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
        oracleAdapter = await OracleAdapter.deploy(
          addressRegistry.address,
          tvlAgg.address,
          [tokenAddress],
          [aggAddress],
          86400,
          86400
        );
        await oracleAdapter.deployed();
        await addressRegistry.registerAddress(
          bytes32("oracleAdapter"),
          oracleAdapter.address
        );

        const PoolToken = await ethers.getContractFactory("TestPoolToken");
        const logic = await PoolToken.deploy();
        await logic.deployed();

        const PoolTokenProxy = await ethers.getContractFactory(
          "PoolTokenProxy"
        );
        const proxy = await PoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          underlyer.address,
          agg.address
        );
        await proxy.deployed();

        const PoolTokenV2 = await ethers.getContractFactory("TestPoolTokenV2");
        const logicV2 = await PoolTokenV2.deploy();
        await logicV2.deployed();

        const poolTokenV2InitData = PoolTokenV2.interface.encodeFunctionData(
          "initializeUpgrade(address)",
          [addressRegistry.address]
        );
        await proxyAdmin
          .connect(deployer)
          .upgradeAndCall(proxy.address, logicV2.address, poolTokenV2InitData);

        poolToken = await PoolTokenV2.attach(proxy.address);

        await acquireToken(
          WHALE_POOLS[symbol],
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
        it("Emergency role is set to Emergency Safe", async () => {
          assert.isTrue(
            await poolToken.hasRole(
              await poolToken.EMERGENCY_ROLE(),
              emergencySafe.address
            )
          );
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
        it("Emergency Safe can set admin", async () => {
          await poolToken
            .connect(emergencySafe)
            .emergencySetAdminAddress(FAKE_ADDRESS);
          expect(await poolToken.proxyAdmin()).to.equal(FAKE_ADDRESS);
        });

        it("Revert on setting to zero address", async () => {
          await expect(
            poolToken
              .connect(emergencySafe)
              .emergencySetAdminAddress(ZERO_ADDRESS)
          ).to.be.revertedWith("INVALID_ADMIN");
        });

        it("Revert when unpermissioned account attempts to set address", async () => {
          await expect(
            poolToken.connect(randomUser).emergencySetAdminAddress(FAKE_ADDRESS)
          ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
        });
      });

      describe("Lock pool", () => {
        it("Emergency Safe can lock and unlock pool", async () => {
          await expect(
            poolToken.connect(emergencySafe).emergencyLock()
          ).to.emit(poolToken, "Paused");
          await expect(
            poolToken.connect(emergencySafe).emergencyUnlock()
          ).to.emit(poolToken, "Unpaused");
        });

        it("Revert when unpermissioned account attempts to lock", async () => {
          await expect(
            poolToken.connect(randomUser).emergencyLock()
          ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
        });

        it("Revert when unpermissioned account attempts to unlock", async () => {
          await expect(
            poolToken.connect(randomUser).emergencyUnlock()
          ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
        });

        it("Revert when calling addLiquidity/redeem on locked pool", async () => {
          await poolToken.connect(emergencySafe).emergencyLock();

          await expect(
            poolToken.connect(randomUser).addLiquidity(50)
          ).to.revertedWith("Pausable: paused");

          await expect(
            poolToken.connect(randomUser).redeem(50)
          ).to.revertedWith("Pausable: paused");
        });

        it("Revert when calling transferToLpAccount on locked pool", async () => {
          await poolToken.connect(emergencySafe).emergencyLock();

          await expect(
            poolToken.connect(emergencySafe).transferToLpAccount(FAKE_ADDRESS)
          ).to.revertedWith("Pausable: paused");
        });
      });

      describe("Lock addLiquidity", () => {
        it("Emergency Safe can lock", async () => {
          await expect(
            poolToken.connect(emergencySafe).emergencyLockAddLiquidity()
          ).to.emit(poolToken, "AddLiquidityLocked");
        });

        it("Emergency Safe can unlock", async () => {
          await expect(
            poolToken.connect(emergencySafe).emergencyUnlockAddLiquidity()
          ).to.emit(poolToken, "AddLiquidityUnlocked");
        });

        it("Revert if unpermissioned account attempts to lock", async () => {
          await expect(
            poolToken.connect(randomUser).emergencyLockAddLiquidity()
          ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
        });

        it("Revert if unpermissioned account attempts to unlock", async () => {
          await expect(
            poolToken.connect(randomUser).emergencyUnlockAddLiquidity()
          ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
        });

        it("Revert deposit when pool is locked", async () => {
          await poolToken.connect(emergencySafe).emergencyLockAddLiquidity();

          await expect(
            poolToken.connect(randomUser).addLiquidity(1)
          ).to.be.revertedWith("LOCKED");
        });

        it("Deposit should work after unlock", async () => {
          await poolToken.connect(emergencySafe).emergencyLockAddLiquidity();
          await poolToken.connect(emergencySafe).emergencyUnlockAddLiquidity();

          await expect(poolToken.connect(randomUser).addLiquidity(1)).to.not.be
            .reverted;
        });
      });

      describe("Transfer to LP Account", () => {
        it("mAPT can call transferToLpAccount", async () => {
          // need to impersonate the mAPT contract and fund it, since its
          // address was set as CONTRACT_ROLE upon PoolTokenV2 deployment
          const mAptSigner = await impersonateAccount(mApt.address);
          await forciblySendEth(
            mAptSigner.address,
            tokenAmountToBigNumber(1),
            deployer.address
          );

          await poolToken.connect(randomUser).addLiquidity(100);
          await expect(poolToken.connect(mAptSigner).transferToLpAccount(100))
            .to.not.be.reverted;
        });

        it("Revert when unpermissioned account calls transferToLpAccount", async () => {
          await expect(poolToken.connect(randomUser).transferToLpAccount(100))
            .to.be.reverted;
        });
      });

      describe("Lock redeem", () => {
        it("Emergency Safe can lock", async () => {
          await expect(
            poolToken.connect(emergencySafe).emergencyLockRedeem()
          ).to.emit(poolToken, "RedeemLocked");
        });

        it("Emergency Safe can unlock", async () => {
          await expect(
            poolToken.connect(emergencySafe).emergencyUnlockRedeem()
          ).to.emit(poolToken, "RedeemUnlocked");
        });

        it("Revert if unpermissioned account attempts to lock", async () => {
          await expect(
            poolToken.connect(randomUser).emergencyLockRedeem()
          ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
        });

        it("Revert if unpermissioned account attempts to unlock", async () => {
          await expect(
            poolToken.connect(randomUser).emergencyUnlockRedeem()
          ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
        });

        it("Revert redeem when pool is locked", async () => {
          await poolToken.connect(emergencySafe).emergencyLockRedeem();

          await expect(
            poolToken.connect(randomUser).redeem(1)
          ).to.be.revertedWith("LOCKED");
        });

        it("Redeem should work after unlock", async () => {
          await poolToken.connect(emergencySafe).emergencyLockRedeem();
          await poolToken.connect(emergencySafe).emergencyUnlockRedeem();

          await poolToken.testMint(randomUser.address, 1);
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

      describe("emergencyExit", () => {
        it("Should only be callable by the emergencySafe", async () => {
          await expect(
            poolToken.connect(randomUser).emergencyExit(underlyer.address)
          ).to.be.revertedWith("NOT_EMERGENCY_ROLE");

          await expect(
            poolToken.connect(emergencySafe).emergencyExit(underlyer.address)
          ).to.not.be.reverted;
        });

        it("Should transfer all deposited tokens to the emergencySafe", async () => {
          await poolToken.connect(randomUser).addLiquidity(100000);

          const prevPoolBalance = await underlyer.balanceOf(poolToken.address);
          const prevSafeBalance = await underlyer.balanceOf(
            emergencySafe.address
          );

          await poolToken
            .connect(emergencySafe)
            .emergencyExit(underlyer.address);

          const nextPoolBalance = await underlyer.balanceOf(poolToken.address);
          const nextSafeBalance = await underlyer.balanceOf(
            emergencySafe.address
          );

          expect(nextPoolBalance).to.equal(0);
          expect(nextSafeBalance.sub(prevSafeBalance)).to.equal(
            prevPoolBalance
          );
        });

        it("Should transfer tokens airdropped to the pool", async () => {
          const symbol = "AAVE";
          const token = await ethers.getContractAt(
            "IDetailedERC20",
            FARM_TOKENS[symbol]
          );

          await acquireToken(
            WHALE_POOLS[symbol],
            poolToken.address,
            token,
            "10000",
            deployer.address
          );

          const prevPoolBalance = await token.balanceOf(poolToken.address);
          const prevSafeBalance = await token.balanceOf(emergencySafe.address);

          await poolToken.connect(emergencySafe).emergencyExit(token.address);

          const nextPoolBalance = await token.balanceOf(poolToken.address);
          const nextSafeBalance = await token.balanceOf(emergencySafe.address);

          expect(nextPoolBalance).to.equal(0);
          expect(nextSafeBalance.sub(prevSafeBalance)).to.equal(
            prevPoolBalance
          );
        });

        it("Should emit the EmergencyExit event", async () => {
          await poolToken.connect(randomUser).addLiquidity(100000);

          const balance = await underlyer.balanceOf(poolToken.address);

          await expect(
            poolToken.connect(emergencySafe).emergencyExit(underlyer.address)
          )
            .to.emit(poolToken, "EmergencyExit")
            .withArgs(emergencySafe.address, underlyer.address, balance);
        });
      });

      const usdDecimals = 8;
      const deployedValues = [
        tokenAmountToBigNumber(0, usdDecimals),
        tokenAmountToBigNumber(837290, usdDecimals),
        tokenAmountToBigNumber(32283729, usdDecimals),
      ];
      deployedValues.forEach(function (deployedValue) {
        describe(`Deployed value: ${deployedValue}`, () => {
          const mAptSupply = tokenAmountToBigNumber("100");

          async function updateTvlAgg(usdDeployedValue) {
            if (usdDeployedValue.isZero()) {
              await oracleAdapter
                .connect(emergencySafe)
                .emergencySetTvl(0, 100);
            }
            const lastRoundId = await tvlAgg.latestRound();
            const newRoundId = lastRoundId.add(1);
            await tvlAgg.connect(oracle).submit(newRoundId, usdDeployedValue);
          }

          beforeEach(async () => {
            /* these get rollbacked after each test due to snapshotting */

            // default to giving entire deployed value to the pool
            await mApt.testMint(poolToken.address, mAptSupply);
            await updateTvlAgg(deployedValue);
            await oracleAdapter.connect(emergencySafe).emergencyUnlock();
          });

          describe("Underlyer and mAPT integration with calculations", () => {
            beforeEach(async () => {
              /* these get rollbacked after each test due to snapshotting */
              const aptAmount = tokenAmountToBigNumber("1000000000", "18");
              await poolToken.testMint(deployer.address, aptAmount);
              const symbol = await underlyer.symbol();
              await acquireToken(
                WHALE_POOLS[symbol],
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

            it("_getPoolUnderlyerValue returns correct value", async () => {
              let underlyerBalance = await underlyer.balanceOf(
                poolToken.address
              );
              let expectedUnderlyerValue = await poolToken.getValueFromUnderlyerAmount(
                underlyerBalance
              );
              expect(await poolToken.testGetPoolUnderlyerValue()).to.equal(
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
              expect(await poolToken.testGetPoolUnderlyerValue()).to.equal(
                expectedUnderlyerValue
              );
            });

            it("_getDeployedValue returns correct value", async () => {
              expect(await poolToken.testGetDeployedValue()).to.equal(
                deployedValue
              );

              // transfer quarter of mAPT to another pool
              await mApt.testMint(FAKE_ADDRESS, mAptSupply.div(4));
              await mApt.testBurn(poolToken.address, mAptSupply.div(4));
              // unlock oracle adapter after mint/burn
              await oracleAdapter.connect(emergencySafe).emergencyUnlock();
              // must update agg so staleness check passes
              await updateTvlAgg(deployedValue);
              expect(await poolToken.testGetDeployedValue()).to.equal(
                deployedValue.mul(3).div(4)
              );

              // transfer same amount again
              await mApt.testMint(FAKE_ADDRESS, mAptSupply.div(4));
              await mApt.testBurn(poolToken.address, mAptSupply.div(4));
              // unlock oracle adapter after mint/burn
              await oracleAdapter.connect(emergencySafe).emergencyUnlock();
              // must update agg so staleness check passes
              await updateTvlAgg(deployedValue);
              expect(await poolToken.testGetDeployedValue()).to.equal(
                deployedValue.div(2)
              );
            });

            it("getReserveTopUpValue returns correct value", async () => {
              const price = await poolToken.getUnderlyerPrice();
              const decimals = await underlyer.decimals();
              const topUpAmount = await poolToken.getReserveTopUpValue();
              const topUpValue = topUpAmount
                .mul(price)
                .div(ethers.BigNumber.from(10).pow(decimals));
              if (deployedValue == 0) {
                expect(topUpValue).to.be.lt(0);
              } else {
                // it's possible to be negative, but not for the current
                // values we picked where underlyer amount is very small
                // compared to the deployed values
                expect(topUpValue).to.be.gt(0);
              }

              const poolUnderlyerValue = await poolToken.testGetPoolUnderlyerValue();
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
              await poolToken.testMint(randomUser.address, 1);
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
              await poolToken.testMint(deployer.address, aptSupply);

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
              await poolToken.testBurn(
                deployer.address,
                reserveAptAmountPlusExtra
              );
              await poolToken.testMint(
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
              await poolToken.testMint(deployer.address, aptSupply);

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
              await poolToken.testMint(randomUser.address, redeemAptAmount);
              await poolToken.testBurn(deployer.address, redeemAptAmount);

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
              await poolToken.testMint(
                deployer.address,
                tokenAmountToBigNumber("100000")
              );
              // seed pool with stablecoin
              await acquireToken(
                WHALE_POOLS[symbol],
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
              await poolToken.testMint(
                deployer.address,
                tokenAmountToBigNumber("100000")
              );
              // seed pool with stablecoin
              await acquireToken(
                WHALE_POOLS[symbol],
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
              await oracleAdapter
                .connect(adminSafe)
                .setChainlinkStalePeriod(MAX_UINT256);

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
