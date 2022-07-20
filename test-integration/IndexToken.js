const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero: ZERO_ADDRESS, MaxUint256: MAX_UINT256 } = ethers.constants;
const { impersonateAccount, bytes32 } = require("../utils/helpers");
const timeMachine = require("ganache-time-traveler");
const { WHALE_POOLS, FARM_TOKENS } = require("../utils/constants");
const {
  acquireToken,
  console,
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
  deployAggregator,
  generateContractAddress,
} = require("../utils/helpers");

const link = (amount) => tokenAmountToBigNumber(amount, "18");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe.only("Contract: IndexToken", () => {
  let deployer;
  let oracle;
  let adminSafe;
  let emergencySafe;
  let randomUser;
  let anotherUser;
  let receiver;

  before(async () => {
    [
      deployer,
      oracle,
      adminSafe,
      emergencySafe,
      randomUser,
      anotherUser,
      receiver,
    ] = await ethers.getSigners();
  });

  // use EVM snapshots for test isolation
  let testSnapshotId;
  let suiteSnapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    testSnapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(testSnapshotId);
  });

  before(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  const symbol = "USDC";
  const tokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const USDC_AGG_ADDRESS = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

  let tvlAgg;
  let underlyer;
  let oracleAdapter;
  let mApt;
  let addressRegistry;
  let indexToken;

  before("Setup", async () => {
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

    const erc20AllocationAddress = await generateContractAddress(deployer);
    await addressRegistry.registerAddress(
      bytes32("erc20Allocation"),
      erc20AllocationAddress
    );

    const tvlManagerAddress = await generateContractAddress(deployer);
    await addressRegistry.registerAddress(
      bytes32("tvlManager"),
      tvlManagerAddress
    );

    const lpAccountAddress = await generateContractAddress(deployer);
    await addressRegistry.registerAddress(
      bytes32("lpAccount"),
      lpAccountAddress
    );

    await addressRegistry.registerAddress(
      bytes32("adminSafe"),
      adminSafe.address
    );

    await addressRegistry.registerAddress(
      bytes32("emergencySafe"),
      emergencySafe.address
    );

    const lpSafeAddress = await generateContractAddress(deployer);
    await addressRegistry.registerAddress(bytes32("lpSafe"), lpSafeAddress);

    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const MetaPoolToken = await ethers.getContractFactory("TestMetaPoolToken");
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
      [USDC_AGG_ADDRESS],
      86400,
      86400
    );
    await oracleAdapter.deployed();
    await addressRegistry.registerAddress(
      bytes32("oracleAdapter"),
      oracleAdapter.address
    );

    const IndexToken = await ethers.getContractFactory("TestIndexToken");
    const logic = await IndexToken.deploy();
    await logic.deployed();

    const initData = IndexToken.interface.encodeFunctionData(
      "initialize(address,address)",
      [addressRegistry.address, underlyer.address]
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      initData
    );
    await proxy.deployed();

    indexToken = await IndexToken.attach(proxy.address);

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
      .approve(indexToken.address, MAX_UINT256);
    await underlyer
      .connect(anotherUser)
      .approve(indexToken.address, MAX_UINT256);

    console.debug(`Proxy Admin: ${proxyAdmin.address}`);
    console.debug(`Logic: ${logic.address}`);
    console.debug(`Proxy: ${proxy.address}`);
  });

  describe("Defaults", () => {
    it("Emergency role is set to Emergency Safe", async () => {
      assert.isTrue(
        await indexToken.hasRole(
          await indexToken.EMERGENCY_ROLE(),
          emergencySafe.address
        )
      );
    });

    it("Name has correct value", async () => {
      assert.equal(await indexToken.name(), "Convex Index Token");
    });

    it("Symbol has correct value", async () => {
      assert.equal(await indexToken.symbol(), "idxCVX");
    });

    it("Decimals has correct value", async () => {
      assert.equal(await indexToken.decimals(), 18);
    });
  });

  describe("Lock pool", () => {
    it("Emergency Safe can lock and unlock pool", async () => {
      await expect(indexToken.connect(emergencySafe).emergencyLock()).to.emit(
        indexToken,
        "Paused"
      );
      await expect(indexToken.connect(emergencySafe).emergencyUnlock()).to.emit(
        indexToken,
        "Unpaused"
      );
    });

    it("Revert when unpermissioned account attempts to lock", async () => {
      await expect(
        indexToken.connect(randomUser).emergencyLock()
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert when unpermissioned account attempts to unlock", async () => {
      await expect(
        indexToken.connect(randomUser).emergencyUnlock()
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert when calling deposit/redeem on locked pool", async () => {
      await indexToken.connect(emergencySafe).emergencyLock();

      await expect(
        indexToken.connect(randomUser).deposit(50, receiver.address)
      ).to.revertedWith("Pausable: paused");

      await expect(
        indexToken
          .connect(randomUser)
          .redeem(50, receiver.address, randomUser.address)
      ).to.revertedWith("Pausable: paused");
    });

    it("Revert when calling transferToLpAccount on locked pool", async () => {
      await indexToken.connect(emergencySafe).emergencyLock();

      await expect(
        indexToken.connect(emergencySafe).transferToLpAccount(FAKE_ADDRESS)
      ).to.revertedWith("Pausable: paused");
    });
  });

  describe("Lock deposit", () => {
    it("Emergency Safe can lock", async () => {
      await expect(
        indexToken.connect(emergencySafe).emergencyLockDeposit()
      ).to.emit(indexToken, "DepositLocked");
    });

    it("Emergency Safe can unlock", async () => {
      await expect(
        indexToken.connect(emergencySafe).emergencyUnlockDeposit()
      ).to.emit(indexToken, "DepositUnlocked");
    });

    it("Revert if unpermissioned account attempts to lock", async () => {
      await expect(
        indexToken.connect(randomUser).emergencyLockDeposit()
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert if unpermissioned account attempts to unlock", async () => {
      await expect(
        indexToken.connect(randomUser).emergencyUnlockDeposit()
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert deposit when pool is locked", async () => {
      await indexToken.connect(emergencySafe).emergencyLockDeposit();

      await expect(
        indexToken.connect(randomUser).deposit(1, receiver.address)
      ).to.be.revertedWith("LOCKED");
    });

    it("Deposit should work after unlock", async () => {
      await indexToken.connect(emergencySafe).emergencyLockDeposit();
      await indexToken.connect(emergencySafe).emergencyUnlockDeposit();

      await expect(indexToken.connect(randomUser).deposit(1, receiver.address))
        .to.not.be.reverted;
    });
  });

  describe("Transfer to LP Account", () => {
    it("mAPT can call transferToLpAccount", async () => {
      // need to impersonate the mAPT contract and fund it, since its
      // address was set as CONTRACT_ROLE upon PoolTokenV2 deployment
      const mAptSigner = await impersonateAccount(mApt.address);

      await indexToken.connect(randomUser).deposit(100, receiver.address);
      await expect(indexToken.connect(mAptSigner).transferToLpAccount(100)).to
        .not.be.reverted;
    });

    it("Revert when unpermissioned account calls transferToLpAccount", async () => {
      await expect(indexToken.connect(randomUser).transferToLpAccount(100)).to
        .be.reverted;
    });
  });

  describe("Lock redeem", () => {
    it("Emergency Safe can lock", async () => {
      await expect(
        indexToken.connect(emergencySafe).emergencyLockRedeem()
      ).to.emit(indexToken, "RedeemLocked");
    });

    it("Emergency Safe can unlock", async () => {
      await expect(
        indexToken.connect(emergencySafe).emergencyUnlockRedeem()
      ).to.emit(indexToken, "RedeemUnlocked");
    });

    it("Revert if unpermissioned account attempts to lock", async () => {
      await expect(
        indexToken.connect(randomUser).emergencyLockRedeem()
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert if unpermissioned account attempts to unlock", async () => {
      await expect(
        indexToken.connect(randomUser).emergencyUnlockRedeem()
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert redeem when pool is locked", async () => {
      await indexToken.connect(emergencySafe).emergencyLockRedeem();

      await expect(
        indexToken
          .connect(randomUser)
          .redeem(1, receiver.address, randomUser.address)
      ).to.be.revertedWith("LOCKED");
    });

    it("Redeem should work after unlock", async () => {
      await indexToken.connect(emergencySafe).emergencyLockRedeem();
      await indexToken.connect(emergencySafe).emergencyUnlockRedeem();

      await indexToken.testMint(randomUser.address, 1);
      await expect(
        indexToken
          .connect(randomUser)
          .redeem(1, receiver.address, randomUser.address)
      ).to.not.be.reverted;
    });
  });

  describe("emergencyExit", () => {
    it("Should only be callable by the emergencySafe", async () => {
      await expect(
        indexToken.connect(randomUser).emergencyExit(underlyer.address)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");

      await expect(
        indexToken.connect(emergencySafe).emergencyExit(underlyer.address)
      ).to.not.be.reverted;
    });

    it("Should transfer all deposited tokens to the emergencySafe", async () => {
      await indexToken.connect(randomUser).deposit(100000, receiver.address);

      const prevPoolBalance = await underlyer.balanceOf(indexToken.address);
      const prevSafeBalance = await underlyer.balanceOf(emergencySafe.address);

      await indexToken.connect(emergencySafe).emergencyExit(underlyer.address);

      const nextPoolBalance = await underlyer.balanceOf(indexToken.address);
      const nextSafeBalance = await underlyer.balanceOf(emergencySafe.address);

      expect(nextPoolBalance).to.equal(0);
      expect(nextSafeBalance.sub(prevSafeBalance)).to.equal(prevPoolBalance);
    });

    it("Should transfer tokens airdropped to the pool", async () => {
      const symbol = "AAVE";
      const token = await ethers.getContractAt(
        "IDetailedERC20",
        FARM_TOKENS[symbol]
      );

      await acquireToken(
        WHALE_POOLS[symbol],
        indexToken.address,
        token,
        "10000",
        deployer.address
      );

      const prevPoolBalance = await token.balanceOf(indexToken.address);
      const prevSafeBalance = await token.balanceOf(emergencySafe.address);

      await indexToken.connect(emergencySafe).emergencyExit(token.address);

      const nextPoolBalance = await token.balanceOf(indexToken.address);
      const nextSafeBalance = await token.balanceOf(emergencySafe.address);

      expect(nextPoolBalance).to.equal(0);
      expect(nextSafeBalance.sub(prevSafeBalance)).to.equal(prevPoolBalance);
    });

    it("Should emit the EmergencyExit event", async () => {
      await indexToken.connect(randomUser).deposit(100000, receiver.address);

      const balance = await underlyer.balanceOf(indexToken.address);

      await expect(
        indexToken.connect(emergencySafe).emergencyExit(underlyer.address)
      )
        .to.emit(indexToken, "EmergencyExit")
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
          await oracleAdapter.connect(emergencySafe).emergencySetTvl(0, 100);
        }
        const lastRoundId = await tvlAgg.latestRound();
        const newRoundId = lastRoundId.add(1);
        await tvlAgg.connect(oracle).submit(newRoundId, usdDeployedValue);
      }

      beforeEach(async () => {
        /* these get rollbacked after each test due to snapshotting */

        // default to giving entire deployed value to the pool
        await mApt.testMint(indexToken.address, mAptSupply);
        await updateTvlAgg(deployedValue);
        await oracleAdapter.connect(emergencySafe).emergencyUnlock();
      });

      describe("Underlyer and mAPT integration with calculations", () => {
        beforeEach(async () => {
          /* these get rollbacked after each test due to snapshotting */
          const aptAmount = tokenAmountToBigNumber("1000000000", "18");
          await indexToken.testMint(deployer.address, aptAmount);
          const symbol = await underlyer.symbol();
          await acquireToken(
            WHALE_POOLS[symbol],
            indexToken.address,
            underlyer,
            "10000",
            deployer.address
          );
        });

        it("convertToShares returns value", async () => {
          const depositAmount = tokenAmountToBigNumber(
            1,
            await underlyer.decimals()
          );
          const expectedAptMinted = await indexToken.convertToShares(
            depositAmount
          );
          console.debug(
            `\tExpected APT Minted: ${expectedAptMinted.toString()}`
          );
          assert(expectedAptMinted.gt(0));
        });

        it("getPoolTotalValue returns value", async () => {
          const val = await indexToken.getPoolTotalValue();
          console.debug(`\tPool Total Eth Value ${val.toString()}`);
          assert(val.gt(0));
        });

        it("getUsdValue returns value", async () => {
          const aptAmount = tokenAmountToBigNumber("100", "18");
          const val = await indexToken.getUsdValue(aptAmount);
          console.debug(`\tUSD Value: ${val.toString()}`);
          assert(val.gt(0));
        });

        it("getValueFromUnderlyerAmount returns value", async () => {
          const amount = tokenAmountToBigNumber(
            5000,
            await underlyer.decimals()
          );
          const val = await indexToken.getValueFromUnderlyerAmount(amount);
          console.debug(`\tEth Value from Token Amount ${val.toString()}`);
          assert(val.gt(0));
        });

        it("getUnderlyerPrice returns value", async () => {
          const price = await indexToken.getUnderlyerPrice();
          console.debug(`\tToken Eth Price: ${price.toString()}`);
          assert(price.gt(0));
        });

        it("convertToAssets returns value", async () => {
          const aptAmount = tokenAmountToBigNumber("100", "18");
          const underlyerAmount = await indexToken["previewRedeem(uint256)"](
            aptAmount
          );
          console.debug(`\tUnderlyer Amount: ${underlyerAmount.toString()}`);
          assert(underlyerAmount.gt(0));
        });

        it("_getPoolUnderlyerValue returns correct value", async () => {
          let underlyerBalance = await underlyer.balanceOf(indexToken.address);
          let expectedUnderlyerValue =
            await indexToken.getValueFromUnderlyerAmount(underlyerBalance);
          expect(await indexToken.testGetPoolUnderlyerValue()).to.equal(
            expectedUnderlyerValue
          );

          const underlyerAmount = tokenAmountToBigNumber(
            "1553",
            await underlyer.decimals()
          );
          await underlyer
            .connect(randomUser)
            .transfer(indexToken.address, underlyerAmount);

          underlyerBalance = await underlyer.balanceOf(indexToken.address);
          expectedUnderlyerValue = await indexToken.getValueFromUnderlyerAmount(
            underlyerBalance
          );
          expect(await indexToken.testGetPoolUnderlyerValue()).to.equal(
            expectedUnderlyerValue
          );
        });

        it("_getDeployedValue returns correct value", async () => {
          expect(await indexToken.testGetDeployedValue()).to.equal(
            deployedValue
          );

          // transfer quarter of mAPT to another pool
          await mApt.testMint(FAKE_ADDRESS, mAptSupply.div(4));
          await mApt.testBurn(indexToken.address, mAptSupply.div(4));
          // unlock oracle adapter after mint/burn
          await oracleAdapter.connect(emergencySafe).emergencyUnlock();
          // must update agg so staleness check passes
          await updateTvlAgg(deployedValue);
          expect(await indexToken.testGetDeployedValue()).to.equal(
            deployedValue.mul(3).div(4)
          );

          // transfer same amount again
          await mApt.testMint(FAKE_ADDRESS, mAptSupply.div(4));
          await mApt.testBurn(indexToken.address, mAptSupply.div(4));
          // unlock oracle adapter after mint/burn
          await oracleAdapter.connect(emergencySafe).emergencyUnlock();
          // must update agg so staleness check passes
          await updateTvlAgg(deployedValue);
          expect(await indexToken.testGetDeployedValue()).to.equal(
            deployedValue.div(2)
          );
        });

        it("getReserveTopUpValue returns correct value", async () => {
          const price = await indexToken.getUnderlyerPrice();
          const decimals = await underlyer.decimals();
          const topUpAmount = await indexToken.getReserveTopUpValue();
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

          const poolUnderlyerValue =
            await indexToken.testGetPoolUnderlyerValue();
          // assuming we unwind the top-up value from the pool's deployed
          // capital, the reserve percentage of resulting deployed value
          // is what we are targeting
          const reservePercentage = await indexToken.reservePercentage();
          const targetValue = deployedValue
            .sub(topUpValue)
            .mul(reservePercentage)
            .div(100);
          const tolerance = Math.ceil((await underlyer.decimals()) / 4);
          const allowedDeviation = tokenAmountToBigNumber(5, tolerance);
          expect(poolUnderlyerValue.add(topUpValue).sub(targetValue)).to.be.lt(
            allowedDeviation
          );
        });
      });

      describe("deposit", () => {
        it("Revert if deposit is zero", async () => {
          await expect(
            indexToken.deposit(0, receiver.address)
          ).to.be.revertedWith("AMOUNT_INSUFFICIENT");
        });

        it("Revert if allowance is less than deposit", async () => {
          await expect(
            indexToken.deposit(1, receiver.address)
          ).to.be.revertedWith("ALLOWANCE_INSUFFICIENT");
        });

        it("Test deposit pass", async () => {
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
          const mintAmount = await indexToken.convertToShares(depositAmount);

          const depositPromise = indexToken
            .connect(randomUser)
            .deposit(depositAmount, receiver.address);
          await depositPromise;

          let underlyerBalanceAfter = await underlyer.balanceOf(
            randomUser.address
          );
          console.debug(
            `\tUnderlyer Balance After Mint: ${underlyerBalanceAfter.toString()}`
          );

          expect(await underlyer.balanceOf(indexToken.address)).to.equal(
            depositAmount
          );
          expect(await underlyer.balanceOf(randomUser.address)).to.equal(
            underlyerBalanceBefore.sub(depositAmount)
          );
          expect(await indexToken.balanceOf(receiver.address)).to.equal(
            mintAmount
          );

          // Underlyer transfer event
          await expect(depositPromise)
            .to.emit(underlyer, "Transfer")
            .withArgs(randomUser.address, indexToken.address, depositAmount);

          // Index token transfer event
          await expect(depositPromise)
            .to.emit(indexToken, "Transfer")
            .withArgs(ZERO_ADDRESS, receiver.address, mintAmount);

          // Deposit event:
          await expect(depositPromise)
            .to.emit(indexToken, "Deposit")
            .withArgs(
              randomUser.address,
              receiver.address,
              depositAmount,
              mintAmount
            );
        });
      });

      describe("redeem", () => {
        it("Revert if withdraw is zero", async () => {
          await expect(
            indexToken.redeem(0, receiver.address, randomUser.address)
          ).to.be.revertedWith("AMOUNT_INSUFFICIENT");
        });

        it("Revert if APT balance is less than withdraw", async () => {
          await indexToken.testMint(randomUser.address, 1);
          await expect(
            indexToken
              .connect(randomUser)
              .redeem(2, receiver.address, randomUser.address)
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
          await indexToken.testMint(deployer.address, aptSupply);

          // seed the pool with underlyer
          const reserveBalance = tokenAmountToBigNumber("150000", decimals);
          await underlyer
            .connect(randomUser)
            .transfer(indexToken.address, reserveBalance);

          // calculate slightly more than APT amount corresponding to the reserve;
          // need to account for the withdraw fee
          const extraAmount = tokenAmountToBigNumber("151", decimals);
          const reserveAptAmountPlusExtra = await indexToken.convertToShares(
            reserveBalance.add(extraAmount)
          );

          // transfer slightly more than reserve's APT amount to the user
          await indexToken
            .connect(deployer)
            .transfer(randomUser.address, reserveAptAmountPlusExtra);

          await expect(
            indexToken
              .connect(randomUser)
              .redeem(
                reserveAptAmountPlusExtra,
                receiver.address,
                randomUser.address
              )
          ).to.be.revertedWith("RESERVE_INSUFFICIENT");
        });

        it("Test redeem pass", async () => {
          // mint APT supply
          const aptSupply = tokenAmountToBigNumber("10000");
          await indexToken.testMint(deployer.address, aptSupply);

          /* Setup pool and user APT amounts:
                 1. give pool an underlyer reserve balance
                 2. calculate the reserve's APT amount
                 3. transfer APT amount less than that to the user
          */
          await underlyer
            .connect(randomUser)
            .transfer(
              indexToken.address,
              tokenAmountToBigNumber("1000", await underlyer.decimals())
            );
          const reserveBalance = await underlyer.balanceOf(indexToken.address);
          const reserveAptAmount = await indexToken.convertToShares(
            reserveBalance
          );
          const redeemAptAmount = reserveAptAmount.div(2);
          const underlyerAmount = await indexToken[
            "previewRedeem(uint256,address)"
          ](redeemAptAmount, randomUser.address);
          await indexToken
            .connect(deployer)
            .transfer(randomUser.address, redeemAptAmount);

          const underlyerBalance = await underlyer.balanceOf(receiver.address);

          // execute the redeem
          const redeemPromise = indexToken
            .connect(randomUser)
            .redeem(redeemAptAmount, receiver.address, randomUser.address);
          await redeemPromise;

          /* ------ START THE ASSERTS -------------- */

          // underlyer balances
          const underlyerBalanceAfter = await underlyer.balanceOf(
            receiver.address
          );
          const underlyerTransferAmount =
            underlyerBalanceAfter.sub(underlyerBalance);
          expect(underlyerTransferAmount).to.equal(underlyerAmount);
          expect(await underlyer.balanceOf(indexToken.address)).to.equal(
            reserveBalance.sub(underlyerAmount)
          );

          // APT balances
          expect(await indexToken.balanceOf(randomUser.address)).to.equal(0);
          expect(await indexToken.totalSupply()).to.equal(
            aptSupply.sub(redeemAptAmount)
          );

          // underlyer transfer event
          await expect(redeemPromise)
            .to.emit(underlyer, "Transfer")
            .withArgs(
              indexToken.address,
              receiver.address,
              underlyerTransferAmount
            );

          // APT transfer event
          await expect(redeemPromise)
            .to.emit(indexToken, "Transfer")
            .withArgs(randomUser.address, ZERO_ADDRESS, redeemAptAmount);

          // Withdraw event:
          await expect(redeemPromise)
            .to.emit(indexToken, "Withdraw")
            .withArgs(
              randomUser.address,
              receiver.address,
              randomUser.address,
              underlyerTransferAmount,
              redeemAptAmount
            );
        });
      });

      describe("withdraw", () => {
        it("Revert if withdraw amount is zero", async () => {
          await expect(
            indexToken.withdraw(0, receiver.address, randomUser.address)
          ).to.be.revertedWith("AMOUNT_INSUFFICIENT");
        });

        it("Revert if share balance is insufficient for withdraw amount", async () => {
          const symbol = await underlyer.symbol();
          await acquireToken(
            WHALE_POOLS[symbol],
            indexToken.address,
            underlyer,
            "10000",
            deployer.address
          );
          await indexToken.testMint(
            anotherUser.address,
            tokenAmountToBigNumber(1000000)
          );
          const shareAmount = (await indexToken.totalSupply())
            .mul(1)
            .div(10000);
          await indexToken.testMint(randomUser.address, shareAmount);
          const assetAmount = await indexToken[
            "previewRedeem(uint256,address)"
          ](shareAmount, randomUser.address);
          await expect(
            indexToken
              .connect(randomUser)
              .withdraw(
                assetAmount.add(1),
                receiver.address,
                randomUser.address
              )
          ).to.be.revertedWith("BALANCE_INSUFFICIENT");
        });

        it("Revert when asset amount is greater than reserve", async () => {
          const decimals = await underlyer.decimals();

          // seed the pool with underlyer
          const reserveBalance = tokenAmountToBigNumber("150000", decimals);
          await underlyer
            .connect(randomUser)
            .transfer(indexToken.address, reserveBalance);

          await expect(
            indexToken
              .connect(randomUser)
              .withdraw(
                reserveBalance.add(1),
                receiver.address,
                randomUser.address
              )
          ).to.be.revertedWith("RESERVE_INSUFFICIENT");
        });

        it("Test withdraw pass", async () => {
          // mint index token supply
          const indexSupply = tokenAmountToBigNumber("10000");
          await indexToken.testMint(deployer.address, indexSupply);

          /* Setup pool and user share amounts:
                 1. give pool an underlyer reserve balance
                 2. calculate the reserve's share amount
                 3. transfer share amount less than that to the user
          */
          await underlyer
            .connect(randomUser)
            .transfer(
              indexToken.address,
              tokenAmountToBigNumber("1000", await underlyer.decimals())
            );
          const reserveBalance = await underlyer.balanceOf(indexToken.address);
          const withdrawAssetAmount = reserveBalance.div(2);
          const withdrawShareAmount = await indexToken[
            "previewWithdraw(uint256,address)"
          ](withdrawAssetAmount, randomUser.address);
          await indexToken
            .connect(deployer)
            .transfer(randomUser.address, withdrawShareAmount);

          const underlyerBalance = await underlyer.balanceOf(receiver.address);
          const shareBalance = await indexToken.balanceOf(randomUser.address);

          // execute the withdraw
          const withdrawPromise = indexToken
            .connect(randomUser)
            .withdraw(
              withdrawAssetAmount,
              receiver.address,
              randomUser.address
            );
          await withdrawPromise;

          /* ------ START THE ASSERTS -------------- */

          // underlyer balances
          const underlyerBalanceAfter = await underlyer.balanceOf(
            receiver.address
          );
          const underlyerTransferAmount =
            underlyerBalanceAfter.sub(underlyerBalance);
          expect(underlyerTransferAmount).to.equal(withdrawAssetAmount);
          expect(await underlyer.balanceOf(indexToken.address)).to.equal(
            reserveBalance.sub(withdrawAssetAmount)
          );

          // Index token balances
          const shareBalanceAfter = await indexToken.balanceOf(
            randomUser.address
          );
          const shareBurnAmount = shareBalance.sub(shareBalanceAfter);
          expect(await indexToken.balanceOf(randomUser.address)).to.equal(0);
          expect(shareBurnAmount).to.equal(withdrawShareAmount);
          expect(await indexToken.totalSupply()).to.equal(
            indexSupply.sub(shareBurnAmount)
          );

          // underlyer transfer event
          await expect(withdrawPromise)
            .to.emit(underlyer, "Transfer")
            .withArgs(
              indexToken.address,
              receiver.address,
              underlyerTransferAmount
            );

          // APT transfer event
          await expect(withdrawPromise)
            .to.emit(indexToken, "Transfer")
            .withArgs(randomUser.address, ZERO_ADDRESS, withdrawShareAmount);

          // Withdraw event:
          await expect(withdrawPromise)
            .to.emit(indexToken, "Withdraw")
            .withArgs(
              randomUser.address,
              receiver.address,
              randomUser.address,
              underlyerTransferAmount,
              withdrawShareAmount
            );
        });
      });

      describe("Test for dust", () => {
        it("convertToAssets after convertToShares results in small dust", async () => {
          // increase APT total supply
          await indexToken.testMint(
            deployer.address,
            tokenAmountToBigNumber("100000")
          );
          // seed pool with stablecoin
          await acquireToken(
            WHALE_POOLS[symbol],
            indexToken.address,
            underlyer,
            "12000000", // 12 MM
            deployer.address
          );

          const depositAmount = tokenAmountToBigNumber(
            "1",
            await underlyer.decimals()
          );
          const mintAmount = await indexToken.convertToShares(depositAmount);
          await indexToken
            .connect(randomUser)
            .deposit(depositAmount, randomUser.address);
          const underlyerAmount = await indexToken.convertToAssets(mintAmount);
          expect(underlyerAmount).to.be.lt(depositAmount);
          const tolerance = Math.ceil((await underlyer.decimals()) / 4);
          const allowedDeviation = tokenAmountToBigNumber(5, tolerance);
          expect(depositAmount.sub(underlyerAmount)).to.be.lt(allowedDeviation);
        });
      });

      describe("Test withdraw and arbitrage fees", () => {
        let underlyerAmount;
        let aptAmount;
        let withdrawFee;

        beforeEach(async () => {
          // increase APT total supply
          await indexToken.testMint(
            deployer.address,
            tokenAmountToBigNumber("100000")
          );
          // seed pool with stablecoin
          await acquireToken(
            WHALE_POOLS[symbol],
            indexToken.address,
            underlyer,
            "12000000", // 12 MM
            deployer.address
          );

          underlyerAmount = tokenAmountToBigNumber(
            "1",
            await underlyer.decimals()
          );
          aptAmount = await indexToken.convertToShares(underlyerAmount);
          await indexToken
            .connect(randomUser)
            .deposit(underlyerAmount, randomUser.address);

          withdrawFee = underlyerAmount
            .mul(await indexToken.withdrawFee())
            .div(1000000);
        });

        it("Deduct arbitrage fee if redeem is during fee period", async () => {
          const arbitrageFee = underlyerAmount
            .mul(await indexToken.arbitrageFee())
            .div(100);
          const underlyerAmountMinusFee = underlyerAmount
            .sub(withdrawFee)
            .sub(arbitrageFee);

          const beforeBalance = await underlyer.balanceOf(randomUser.address);
          await indexToken
            .connect(randomUser)
            .redeem(aptAmount, randomUser.address, randomUser.address);
          const afterBalance = await underlyer.balanceOf(randomUser.address);
          const transferAmount = afterBalance.sub(beforeBalance);

          const tolerance = Math.ceil((await underlyer.decimals()) / 4);
          const allowedDeviation = tokenAmountToBigNumber(5, tolerance);
          expect(underlyerAmountMinusFee.sub(transferAmount).abs()).to.be.lt(
            allowedDeviation
          );
        });

        it("No arbitrage fee if redeem is after fee period", async () => {
          const arbitrageFeePeriod = await indexToken.arbitrageFeePeriod();
          // advance time by feePeriod seconds and mine next block
          await ethers.provider.send("evm_increaseTime", [
            arbitrageFeePeriod.toNumber(),
          ]);
          await ethers.provider.send("evm_mine");
          // effectively disable staleness check
          await oracleAdapter
            .connect(adminSafe)
            .setChainlinkStalePeriod(MAX_UINT256);

          const beforeBalance = await underlyer.balanceOf(randomUser.address);
          await indexToken
            .connect(randomUser)
            .redeem(aptAmount, randomUser.address, randomUser.address);
          const afterBalance = await underlyer.balanceOf(randomUser.address);
          const transferAmount = afterBalance.sub(beforeBalance);

          const tolerance = Math.ceil((await underlyer.decimals()) / 4);
          const allowedDeviation = tokenAmountToBigNumber(5, tolerance);
          expect(
            underlyerAmount.sub(withdrawFee).sub(transferAmount).abs()
          ).to.be.lt(allowedDeviation);
        });
      });
    });
  });
});
