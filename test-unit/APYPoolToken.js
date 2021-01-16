const { assert, expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
const { BigNumber } = ethers;

const timeMachine = require("ganache-time-traveler");

const {
  ZERO_ADDRESS,
  FAKE_ADDRESS,
  tokenAmountToBigNumber,
} = require("../utils/helpers");

const AggregatorV3Interface = artifacts.require("AggregatorV3Interface");
const IDetailedERC20 = artifacts.require("IDetailedERC20");
const APYMetaPoolToken = artifacts.require("APYMetaPoolToken");

describe.only("Contract: APYPoolToken", () => {
  // signers
  let deployer;
  let admin;
  let randomUser;

  // contract factories
  let MockContract;
  let ProxyAdmin;
  let APYPoolTokenProxy;
  let APYPoolToken;

  // mocks
  let underlyerMock;
  let priceAggMock;
  let mAptMock;

  // pool
  let proxyAdmin;
  let logic;
  let proxy;
  let poolToken;

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
    [deployer, admin, randomUser] = await ethers.getSigners();

    MockContract = await ethers.getContractFactory("MockContract");
    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYPoolTokenProxy = await ethers.getContractFactory("APYPoolTokenProxy");
    APYPoolToken = await ethers.getContractFactory("TestAPYPoolToken");

    underlyerMock = await deployMockContract(deployer, IDetailedERC20.abi);
    priceAggMock = await deployMockContract(
      deployer,
      AggregatorV3Interface.abi
    );
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await APYPoolToken.deploy();
    await logic.deployed();
    proxy = await APYPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      underlyerMock.address,
      priceAggMock.address
    );
    await proxy.deployed();
    poolToken = await APYPoolToken.attach(proxy.address);

    mAptMock = await deployMockContract(deployer, APYMetaPoolToken.abi);
    await poolToken.setMetaPoolToken(mAptMock.address);
  });

  describe("Constructor", async () => {
    it("Revert when admin address is zero ", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          ZERO_ADDRESS,
          underlyerMock.address,
          priceAggMock.address
        )
      ).to.be.reverted;
    });

    it("Revert when token address is zero", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          ZERO_ADDRESS,
          priceAggMock.address
        )
      ).to.be.reverted;
    });

    it("Revert when agg address is zero", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          underlyerMock.address,
          ZERO_ADDRESS
        )
      ).to.be.reverted;
    });
  });

  describe("Defaults", async () => {
    it("Owner set to deployer", async () => {
      assert.equal(await poolToken.owner(), deployer.address);
    });

    it("DEFAULT_APT_TO_UNDERLYER_FACTOR set to correct value", async () => {
      assert.equal(await poolToken.DEFAULT_APT_TO_UNDERLYER_FACTOR(), 1000);
    });

    it("Name set to correct value", async () => {
      assert.equal(await poolToken.name(), "APY Pool Token");
    });

    it("Symbol set to correct value", async () => {
      assert.equal(await poolToken.symbol(), "APT");
    });

    it("Decimals set to correct value", async () => {
      assert.equal(await poolToken.decimals(), 18);
    });

    it("Block ether transfer", async () => {
      await expect(
        deployer.sendTransaction({ to: poolToken.address, value: "10" })
      ).to.be.revertedWith("DONT_SEND_ETHER");
    });
  });

  describe("Admin setting", async () => {
    it("Owner can set admin", async () => {
      await poolToken.connect(deployer).setAdminAddress(admin.address);
      assert.equal(await poolToken.proxyAdmin(), admin.address);
    });

    it("Revert on setting to zero address", async () => {
      await expect(poolToken.connect(deployer).setAdminAddress(ZERO_ADDRESS)).to
        .be.reverted;
    });

    it("Revert when non-owner attempts to set address", async () => {
      await expect(poolToken.connect(randomUser).setAdminAddress(admin.address))
        .to.be.reverted;
    });
  });

  describe("Price aggregator setting", async () => {
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
      const trx = await setPromise;
      await trx.wait();

      const priceAgg = await poolToken.priceAgg();

      assert.equal(priceAgg, FAKE_ADDRESS);
      await expect(setPromise)
        .to.emit(poolToken, "PriceAggregatorChanged")
        .withArgs(FAKE_ADDRESS);
    });
  });

  describe("mAPT setting", async () => {
    it("Owner can set admin address", async () => {
      const mockContract = await deployMockContract(deployer, []);
      const mockContractAddress = mockContract.address;
      await poolToken.connect(deployer).setMetaPoolToken(mockContractAddress);
      assert.equal(await poolToken.mApt(), mockContractAddress);
    });

    it("Revert on setting to non-contract address", async () => {
      await expect(poolToken.connect(deployer).setMetaPoolToken(FAKE_ADDRESS))
        .to.be.reverted;
    });

    it("Revert when non-owner attempts to set address", async () => {
      await expect(
        poolToken.connect(randomUser).setMetaPoolToken(admin.address)
      ).to.be.reverted;
    });
  });

  describe("getTokenEthPrice", async () => {
    it("Revert when price agg returns non-positive price", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 0, 0, 0, 0);
      await expect(poolToken.getTokenEthPrice.call()).to.be.revertedWith(
        "UNABLE_TO_RETRIEVE_ETH_PRICE"
      );
    });

    it("Returns value when price agg returns positive price", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      expect(await poolToken.getTokenEthPrice()).to.equal(100);
    });
  });

  describe("getTokenAmountFromEthValue", async () => {
    it("Returns correct value", async () => {
      const decimals = 0;
      await underlyerMock.mock.decimals.returns(decimals);
      const price = 25;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);
      const ethValue = 100;
      // ((10 ^ 0) * 100) / 25
      const expectedUnderlyerAmount = BigNumber.from(10 ** decimals)
        .mul(ethValue)
        .div(price);
      expect(await poolToken.getTokenAmountFromEthValue(ethValue)).to.equal(
        expectedUnderlyerAmount
      );
    });
  });

  describe("getEthValueFromTokenAmount", async () => {
    it("Return 0 for zero amount", async () => {
      expect(await poolToken.getEthValueFromTokenAmount(0)).to.equal(0);
    });

    it("Returns correct value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      const underlyerAmount = tokenAmountToBigNumber(5, decimals);
      // 50 * 2 / 10 ^ 1
      const expectedEthValue = underlyerAmount.mul(price).div(10 ** decimals);
      expect(
        await poolToken.getEthValueFromTokenAmount(underlyerAmount)
      ).to.equal(expectedEthValue);
    });
  });

  describe("getPoolUnderlyerEthValue", async () => {
    it("Returns correct value regardless of deployed value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const balance = tokenAmountToBigNumber("7.5", decimals);
      await underlyerMock.mock.balanceOf.returns(balance);

      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      // 75 * 2 / 10^1
      const expectedEthValue = balance.mul(price).div(10 ** decimals);

      // force zero deployed value
      await mAptMock.mock.getDeployedEthValue.returns(0);
      expect(await poolToken.getDeployedEthValue()).to.equal(0);
      expect(await poolToken.getPoolUnderlyerEthValue()).to.equal(
        expectedEthValue
      );

      // force non-zero deployed value
      await mAptMock.mock.getDeployedEthValue.returns(1234);
      expect(await poolToken.getDeployedEthValue()).to.be.gt(0);
      expect(await poolToken.getPoolUnderlyerEthValue()).to.equal(
        expectedEthValue
      );
    });
  });

  describe("getDeployedEthValue", async () => {
    // it("Return 0 if zero mAPT supply", async () => {
    //   await mAptMock.mock.totalSupply.returns(0);
    //   await mAptMock.mock.balanceOf.withArgs(poolToken.address).returns(0);
    //   expect(await poolToken.getDeployedEthValue()).to.equal(0);
    // });

    // it("Return 0 if zero mAPT balance", async () => {
    //   await mAptMock.mock.totalSupply.returns(1000);
    //   await mAptMock.mock.balanceOf.withArgs(poolToken.address).returns(0);
    //   expect(await poolToken.getDeployedEthValue()).to.equal(0);
    // });

    it("Delegates properly to mAPT contract", async () => {
      await mAptMock.mock.getDeployedEthValue.returns(0);
      expect(await poolToken.getDeployedEthValue()).to.equal(0);

      const deployedValue = tokenAmountToBigNumber(12345);
      await mAptMock.mock.getDeployedEthValue.returns(deployedValue);
      expect(await poolToken.getDeployedEthValue()).to.equal(deployedValue);
    });
  });

  describe("getPoolTotalEthValue", async () => {
    it("Returns correct value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const underlyerBalance = tokenAmountToBigNumber("7.5", decimals);
      await underlyerMock.mock.balanceOf.returns(underlyerBalance);

      const deployedValue = tokenAmountToBigNumber(1234);
      await mAptMock.mock.getDeployedEthValue.returns(deployedValue);

      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      // Underlyer ETH value: 75 * 2 / 10^1 = 15
      const underlyerValue = underlyerBalance.mul(price).div(10 ** decimals);
      const expectedEthValue = underlyerValue.add(deployedValue);
      expect(await poolToken.getPoolTotalEthValue()).to.equal(expectedEthValue);
    });
  });

  describe("getAPTEthValue", async () => {
    it("Revert when zero APT supply", async () => {
      expect(await poolToken.totalSupply()).to.equal(0);
      await expect(poolToken.getAPTEthValue(10)).to.be.revertedWith(
        "INSUFFICIENT_TOTAL_SUPPLY"
      );
    });

    it("Returns correct value", async () => {
      await poolToken.mint(randomUser.address, 100);
      await underlyerMock.mock.decimals.returns(0);
      await underlyerMock.mock.balanceOf.returns(100);

      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      const aptSupply = await poolToken.totalSupply();
      const aptAmount = tokenAmountToBigNumber(10);

      // zero deployed value
      await mAptMock.mock.getDeployedEthValue.returns(0);
      let poolTotalValue = await poolToken.getPoolTotalEthValue();
      let expectedEthValue = poolTotalValue.mul(aptAmount).div(aptSupply);
      expect(await poolToken.getAPTEthValue(aptAmount)).to.equal(
        expectedEthValue
      );

      // non-zero deployed value
      const deployedValue = tokenAmountToBigNumber(1234);
      await mAptMock.mock.getDeployedEthValue.returns(deployedValue);
      poolTotalValue = await poolToken.getPoolTotalEthValue();
      expectedEthValue = poolTotalValue.mul(aptAmount).div(aptSupply);
      expect(await poolToken.getAPTEthValue(aptAmount)).to.equal(
        expectedEthValue
      );
    });
  });

  describe("calculateMintAmount", async () => {
    beforeEach(async () => {
      await mAptMock.mock.getDeployedEthValue.returns(0);
    });

    it("Uses fixed ratio with zero total supply", async () => {
      expect(await poolToken.totalSupply()).to.equal(0);

      await underlyerMock.mock.decimals.returns("0");
      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);

      const DEPOSIT_FACTOR = await poolToken.DEFAULT_APT_TO_UNDERLYER_FACTOR();
      const depositAmount = tokenAmountToBigNumber("123");

      await underlyerMock.mock.balanceOf.returns(9999);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        depositAmount.mul(DEPOSIT_FACTOR)
      );

      // result doesn't depend on pool's underlyer balance
      await underlyerMock.mock.balanceOf.withArgs(poolToken.address).returns(0);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        depositAmount.mul(DEPOSIT_FACTOR)
      );

      // result doesn't depend on pool's deployed value
      await mAptMock.mock.getDeployedEthValue.returns(10000000);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        depositAmount.mul(DEPOSIT_FACTOR)
      );
    });

    it("Returns calculated value with non-zero total supply", async () => {
      const decimals = "0";

      const aptTotalSupply = tokenAmountToBigNumber("900", "18");
      const depositAmount = tokenAmountToBigNumber("1000", decimals);
      const poolBalance = tokenAmountToBigNumber("9999", decimals);

      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);
      await underlyerMock.mock.balanceOf.returns(poolBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      await poolToken.mint(poolToken.address, aptTotalSupply);
      const expectedMintAmount = aptTotalSupply
        .mul(depositAmount)
        .div(poolBalance);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        expectedMintAmount
      );
    });

    it("Returns calculated value with non-zero total supply and deployed value", async () => {
      const decimals = "0";

      const aptTotalSupply = tokenAmountToBigNumber("900", "18");
      const depositAmount = tokenAmountToBigNumber("1000", decimals);
      const poolUnderlyerBalance = tokenAmountToBigNumber("9999", decimals);

      const aggMock = await deployMockContract(
        deployer,
        AggregatorV3Interface.abi
      );
      const price = 1;
      await aggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);
      await poolToken.setPriceAggregator(aggMock.address);
      await underlyerMock.mock.balanceOf.returns(poolUnderlyerBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      await mAptMock.mock.balanceOf.returns(tokenAmountToBigNumber(10));
      await mAptMock.mock.totalSupply.returns(tokenAmountToBigNumber(1000));
      await mAptMock.mock.getTVL.returns(tokenAmountToBigNumber(271828));

      await poolToken.mint(poolToken.address, aptTotalSupply);

      const depositValue = depositAmount.mul(price).div(10 ** decimals);
      const poolTotalValue = await poolToken.getPoolTotalEthValue();
      const expectedMintAmount = aptTotalSupply
        .mul(depositValue)
        .div(poolTotalValue);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        expectedMintAmount
      );
    });
  });

  describe("getUnderlyerAmount", async () => {
    beforeEach(async () => {
      await mAptMock.mock.getDeployedEthValue.returns(0);
    });

    it("Test getUnderlyerAmount when divide by zero", async () => {
      await expect(poolToken.getUnderlyerAmount(100)).to.be.revertedWith(
        "INSUFFICIENT_TOTAL_SUPPLY"
      );
    });

    it("Test getUnderlyerAmount returns expected amount", async () => {
      await underlyerMock.mock.balanceOf.returns("1");
      await underlyerMock.mock.decimals.returns("1");
      await priceAggMock.mock.latestRoundData.returns(0, 10, 0, 0, 0);

      await poolToken.mint(randomUser.address, 1);
      const underlyerAmount = await poolToken.getUnderlyerAmount("1");
      expect(underlyerAmount).to.equal("1");
    });
  });

  describe("addLiquidity", async () => {
    it("Revert if deposit is zero", async () => {
      await expect(poolToken.addLiquidity(0)).to.be.revertedWith(
        "AMOUNT_INSUFFICIENT"
      );
    });

    it("Revert if allowance is less than deposit", async () => {
      await underlyerMock.mock.allowance.returns(0);
      await expect(poolToken.addLiquidity(1)).to.be.revertedWith(
        "ALLOWANCE_INSUFFICIENT"
      );
    });

    describe("Deployed value is zero", () => {
      const decimals = 0;
      const depositAmount = tokenAmountToBigNumber(1, decimals);

      before(async () => {
        // Test the old code paths without mAPT:
        // forces `getDeployedEthValue` to return 0, meaning the pool's
        // total ETH value comes purely from its underlyer holdings
        await mAptMock.mock.getDeployedEthValue.returns(0);

        const price = 1;
        await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

        await underlyerMock.mock.decimals.returns(decimals);
        await underlyerMock.mock.allowance.returns(depositAmount);
        await underlyerMock.mock.balanceOf.returns(depositAmount);
        await underlyerMock.mock.transferFrom.returns(true);
      });

      it("Increase APT balance by calculated amount", async () => {
        const expectedMintAmount = await poolToken.calculateMintAmount(
          depositAmount
        );

        await expect(() =>
          poolToken.connect(randomUser).addLiquidity(depositAmount)
        ).to.changeTokenBalance(poolToken, randomUser, expectedMintAmount);
      });

      it("Emit correct APT events", async () => {
        const addLiquidityPromise = poolToken
          .connect(randomUser)
          .addLiquidity(depositAmount);
        const trx = await addLiquidityPromise;
        await trx.wait();

        await expect(addLiquidityPromise)
          .to.emit(poolToken, "Transfer")
          .withArgs(ZERO_ADDRESS, randomUser.address, depositAmount);

        await expect(addLiquidityPromise)
          .to.emit(poolToken, "DepositedAPT")
          .withArgs(
            randomUser.address,
            underlyerMock.address,
            BigNumber.from(1),
            depositAmount,
            BigNumber.from(1),
            BigNumber.from(1)
          );
      });

      it("safeTransferFrom called on underlyer", async () => {
        const trx = await poolToken
          .connect(randomUser)
          .addLiquidity(depositAmount);
        await trx.wait();

        /* https://github.com/nomiclabs/hardhat/issues/1135
         * Due to the above issue, we can't simply do:
         *
         *  expect("safeTransferFrom")
         *    .to.be.calledOnContract(underlyerMock)
         *    .withArgs(randomUser.address, poolToken.address, BigNumber.from(1000));
         *
         *  Instead, we have to do some hacky revert-check logic.
         */
      });

      it("Owner can lock and unlock addLiquidity", async () => {
        await expect(poolToken.connect(deployer).lockAddLiquidity()).to.emit(
          poolToken,
          "AddLiquidityLocked"
        );

        await expect(
          poolToken.connect(randomUser).addLiquidity(1)
        ).to.be.revertedWith("LOCKED");

        await expect(poolToken.connect(deployer).unlockAddLiquidity()).to.emit(
          poolToken,
          "AddLiquidityUnlocked"
        );

        await poolToken.connect(randomUser).addLiquidity(1);
      });

      it("Revert if non-owner attempts to lock or unlock", async () => {
        await expect(
          poolToken.connect(randomUser).lockAddLiquidity()
        ).to.be.revertedWith("Ownable: caller is not the owner");
        await expect(
          poolToken.connect(randomUser).unlockAddLiquidity()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("redeem", async () => {
    it("Test redeem insufficient amount", async () => {
      await expect(poolToken.redeem(0)).to.be.revertedWith(
        "AMOUNT_INSUFFICIENT"
      );
    });

    it("Test redeem insufficient balance", async () => {
      await poolToken.mint(randomUser.address, 1);
      await expect(poolToken.connect(randomUser).redeem(2)).to.be.revertedWith(
        "BALANCE_INSUFFICIENT"
      );
    });

    describe("Deployed value is zero", () => {
      before(async () => {
        // Test the old code paths without mAPT:
        // forces `getDeployedEthValue` to return 0, meaning the pool's
        // total ETH value comes purely from its underlyer holdings
        await mAptMock.mock.getDeployedEthValue.returns(0);
      });

      it("Test redeem pass", async () => {
        const aptAmount = tokenAmountToBigNumber("1000");
        await poolToken.mint(randomUser.address, aptAmount);

        await underlyerMock.mock.decimals.returns(0);
        await underlyerMock.mock.allowance.returns(1);
        await underlyerMock.mock.balanceOf.returns(1);
        await underlyerMock.mock.transfer.returns(true);

        await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);

        const redeemPromise = poolToken.connect(randomUser).redeem(aptAmount);
        await (await redeemPromise).wait();

        const bal = await poolToken.balanceOf(randomUser.address);
        expect(bal).to.equal("0");
        await expect(redeemPromise)
          .to.emit(poolToken, "Transfer")
          .withArgs(randomUser.address, ZERO_ADDRESS, aptAmount);
        await expect(redeemPromise).to.emit(poolToken, "RedeemedAPT").withArgs(
          randomUser.address,
          underlyerMock.address,
          BigNumber.from(1),
          aptAmount,
          BigNumber.from(1),
          BigNumber.from(1)
          //this value is a lie, but it's due to token.balance() = 1 and aggMock.getLastRound() = 1
        );
      });

      it("Test locking/unlocking redeem by owner", async () => {
        await poolToken.mint(randomUser.address, 100);
        const aggMock = await MockContract.deploy();
        await poolToken.setPriceAggregator(aggMock.address);

        await expect(poolToken.connect(deployer).lockRedeem()).to.emit(
          poolToken,
          "RedeemLocked"
        );

        await expect(
          poolToken.connect(randomUser).redeem(50)
        ).to.be.revertedWith("LOCKED");

        await expect(poolToken.connect(deployer).unlockRedeem()).to.emit(
          poolToken,
          "RedeemUnlocked"
        );
      });

      it("Test locking/unlocking contract by not owner", async () => {
        await poolToken.mint(randomUser.address, 100);
        const aggMock = await MockContract.deploy();
        await poolToken.setPriceAggregator(aggMock.address);

        await expect(poolToken.connect(deployer).lock()).to.emit(
          poolToken,
          "Paused"
        );

        await expect(poolToken.connect(randomUser).redeem(50)).to.revertedWith(
          "Pausable: paused"
        );

        await expect(poolToken.connect(deployer).unlock()).to.emit(
          poolToken,
          "Unpaused"
        );
      });

      it("Test locking/unlocking redeem by not owner", async () => {
        await expect(
          poolToken.connect(randomUser).lockRedeem()
        ).to.be.revertedWith("Ownable: caller is not the owner");
        await expect(
          poolToken.connect(randomUser).unlockRedeem()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
