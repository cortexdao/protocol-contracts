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
const AddressRegistry = artifacts.require("IAddressRegistryV2");
const MetaPoolToken = artifacts.require("MetaPoolToken");

describe("Contract: PoolToken", () => {
  // signers
  let deployer;
  let randomUser;
  let anotherUser;

  // contract factories
  let ProxyAdmin;
  let PoolTokenProxy;
  let PoolToken;
  let PoolTokenV2;

  // mocks
  let underlyerMock;
  let priceAggMock;
  let addressRegistryMock;
  let mAptMock;

  // pool
  let proxyAdmin;
  let poolToken;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, randomUser, anotherUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    PoolTokenProxy = await ethers.getContractFactory("PoolTokenProxy");
    PoolToken = await ethers.getContractFactory("TestPoolToken");
    PoolTokenV2 = await ethers.getContractFactory("TestPoolTokenV2");

    underlyerMock = await deployMockContract(deployer, IDetailedERC20.abi);
    priceAggMock = await deployMockContract(
      deployer,
      AggregatorV3Interface.abi
    );
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    const logic = await PoolToken.deploy();
    await logic.deployed();
    const proxy = await PoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      underlyerMock.address,
      priceAggMock.address
    );
    await proxy.deployed();

    const logicV2 = await PoolTokenV2.deploy();
    await logicV2.deployed();

    mAptMock = await deployMockContract(deployer, MetaPoolToken.abi);
    addressRegistryMock = await deployMockContract(
      deployer,
      AddressRegistry.abi
    );
    await addressRegistryMock.mock.mAptAddress.returns(mAptMock.address);

    const initData = PoolTokenV2.interface.encodeFunctionData(
      "initializeUpgrade(address)",
      [addressRegistryMock.address]
    );
    await proxyAdmin
      .connect(deployer)
      .upgradeAndCall(proxy.address, logicV2.address, initData);
    poolToken = await PoolTokenV2.attach(proxy.address);
  });

  describe("Constructor", () => {
    it("Revert when admin address is zero ", async () => {
      const logicMock = await deployMockContract(deployer, []);
      await expect(
        PoolTokenProxy.deploy(
          logicMock.address,
          ZERO_ADDRESS,
          underlyerMock.address,
          priceAggMock.address
        )
      ).to.be.reverted;
    });

    it("Revert when token address is zero", async () => {
      const logicMock = await deployMockContract(deployer, []);
      await expect(
        PoolTokenProxy.deploy(
          logicMock.address,
          proxyAdmin.address,
          ZERO_ADDRESS,
          priceAggMock.address
        )
      ).to.be.reverted;
    });

    it("Revert when agg address is zero", async () => {
      const logicMock = await deployMockContract(deployer, []);
      await expect(
        PoolTokenProxy.deploy(
          logicMock.address,
          proxyAdmin.address,
          underlyerMock.address,
          ZERO_ADDRESS
        )
      ).to.be.reverted;
    });
  });

  describe("Defaults", () => {
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
      ).to.be.reverted;
    });

    it("feePeriod set to correct value", async () => {
      expect(await poolToken.feePeriod()).to.equal(24 * 60 * 60);
    });

    it("feePercentage set to correct value", async () => {
      expect(await poolToken.feePercentage()).to.equal(5);
    });
  });

  describe("Set admin address", () => {
    it("Owner can set admin", async () => {
      await poolToken.connect(deployer).setAdminAddress(FAKE_ADDRESS);
      assert.equal(await poolToken.proxyAdmin(), FAKE_ADDRESS);
    });

    it("Revert on setting to zero address", async () => {
      await expect(poolToken.connect(deployer).setAdminAddress(ZERO_ADDRESS)).to
        .be.reverted;
    });

    it("Revert when non-owner attempts to set address", async () => {
      await expect(
        poolToken.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Set price aggregator address", () => {
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

      const priceAgg = await poolToken.priceAgg();

      assert.equal(priceAgg, FAKE_ADDRESS);
      await expect(setPromise)
        .to.emit(poolToken, "PriceAggregatorChanged")
        .withArgs(FAKE_ADDRESS);
    });
  });

  describe("getUnderlyerPrice", () => {
    it("Revert when price agg returns non-positive price", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 0, 0, 0, 0);
      await expect(poolToken.getUnderlyerPrice()).to.be.revertedWith(
        "UNABLE_TO_RETRIEVE_USD_PRICE"
      );
    });

    it("Returns value when price agg returns positive price", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      expect(await poolToken.getUnderlyerPrice()).to.equal(100);
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
      await expect(poolToken.connect(randomUser).unlock()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Revert when calling addLiquidity/redeem on locked pool", async () => {
      await poolToken.connect(deployer).lock();

      await expect(
        poolToken.connect(randomUser).addLiquidity(50)
      ).to.revertedWith("Pausable: paused");

      await expect(poolToken.connect(randomUser).redeem(50)).to.revertedWith(
        "Pausable: paused"
      );
    });

    it("Revert when calling infiniteApprove on locked pool", async () => {
      await poolToken.connect(deployer).lock();

      await expect(
        poolToken.connect(deployer).infiniteApprove(FAKE_ADDRESS)
      ).to.revertedWith("Pausable: paused");
    });

    it("Allow calling revokeApprove on locked pool", async () => {
      await underlyerMock.mock.approve.returns(true);

      await poolToken.connect(deployer).lock();

      await expect(poolToken.connect(deployer).revokeApprove(FAKE_ADDRESS)).to
        .not.be.reverted;
    });
  });

  describe("Approvals", () => {
    beforeEach(async () => {
      await underlyerMock.mock.allowance.returns(0); // needed for `safeApprove`
      await underlyerMock.mock.approve.returns(true);
    });

    it("Owner can call infiniteApprove", async () => {
      await expect(poolToken.connect(deployer).infiniteApprove(FAKE_ADDRESS)).to
        .not.be.reverted;
    });

    it("Revert when non-owner calls infiniteApprove", async () => {
      await expect(poolToken.connect(randomUser).infiniteApprove(FAKE_ADDRESS))
        .to.be.reverted;
    });

    it("Owner can call revokeApprove", async () => {
      await expect(poolToken.connect(deployer).revokeApprove(FAKE_ADDRESS)).to
        .not.be.reverted;
    });

    it("Revert when non-owner calls revokeApprove", async () => {
      await expect(poolToken.connect(randomUser).revokeApprove(FAKE_ADDRESS)).to
        .be.reverted;
    });
  });

  describe("Set feePeriod", () => {
    it("Owner can set", async () => {
      const newFeePeriod = 12 * 60 * 60;
      await expect(poolToken.connect(deployer).setFeePeriod(newFeePeriod)).to
        .not.be.reverted;
      expect(await poolToken.feePeriod()).to.equal(newFeePeriod);
    });
    it("Revert if non-owner attempts to set", async () => {
      await expect(poolToken.connect(randomUser).setFeePeriod(12 * 60 * 60)).to
        .be.reverted;
    });
  });

  describe("Set feePercentage", () => {
    it("Owner can set", async () => {
      const newFeePercentage = 12;
      await expect(
        poolToken.connect(deployer).setFeePercentage(newFeePercentage)
      ).to.not.be.reverted;
      expect(await poolToken.feePercentage()).to.equal(newFeePercentage);
    });

    it("Revert if non-owner attempts to set", async () => {
      await expect(poolToken.connect(randomUser).setFeePercentage(12)).to.be
        .reverted;
    });
  });

  describe("Set reservePercentage", () => {
    it("Owner can set", async () => {
      const newPercentage = 10;
      await expect(
        poolToken.connect(deployer).setReservePercentage(newPercentage)
      ).to.not.be.reverted;
      expect(await poolToken.reservePercentage()).to.equal(newPercentage);
    });

    it("Revert if non-owner attempts to set", async () => {
      await expect(poolToken.connect(randomUser).setReservePercentage(10)).to.be
        .reverted;
    });
  });

  describe("getUnderlyerAmountFromValue", () => {
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
      expect(await poolToken.getUnderlyerAmountFromValue(ethValue)).to.equal(
        expectedUnderlyerAmount
      );
    });
  });

  describe("getValueFromUnderlyerAmount", () => {
    it("Return 0 for zero amount", async () => {
      expect(await poolToken.getValueFromUnderlyerAmount(0)).to.equal(0);
    });

    it("Returns correct value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      const underlyerAmount = tokenAmountToBigNumber(5, decimals);
      // 50 * 2 / 10 ^ 1
      const expectedValue = underlyerAmount.mul(price).div(10 ** decimals);
      expect(
        await poolToken.getValueFromUnderlyerAmount(underlyerAmount)
      ).to.equal(expectedValue);
    });
  });

  describe("getPoolUnderlyerValue", () => {
    it("Returns correct value regardless of deployed value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const balance = tokenAmountToBigNumber("7.5", decimals);
      await underlyerMock.mock.balanceOf.returns(balance);

      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      // 75 * 2 / 10^1
      const expectedValue = balance.mul(price).div(10 ** decimals);

      // force zero deployed value
      await mAptMock.mock.getDeployedValue.returns(0);
      expect(await poolToken.getDeployedValue()).to.equal(0);
      expect(await poolToken.getPoolUnderlyerValue()).to.equal(expectedValue);

      // force non-zero deployed value
      await mAptMock.mock.getDeployedValue.returns(1234);
      expect(await poolToken.getDeployedValue()).to.be.gt(0);
      expect(await poolToken.getPoolUnderlyerValue()).to.equal(expectedValue);
    });
  });

  describe("getDeployedValue", () => {
    it("Delegates properly to mAPT contract", async () => {
      await mAptMock.mock.getDeployedValue.returns(0);
      expect(await poolToken.getDeployedValue()).to.equal(0);

      const deployedValue = tokenAmountToBigNumber(12345);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);
      expect(await poolToken.getDeployedValue()).to.equal(deployedValue);
    });
  });

  describe("getPoolTotalValue", () => {
    it("Returns correct value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const underlyerBalance = tokenAmountToBigNumber("7.5", decimals);
      await underlyerMock.mock.balanceOf.returns(underlyerBalance);

      const deployedValue = tokenAmountToBigNumber(1234);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);

      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      // Underlyer ETH value: 75 * 2 / 10^1 = 15
      const underlyerValue = underlyerBalance.mul(price).div(10 ** decimals);
      const expectedValue = underlyerValue.add(deployedValue);
      expect(await poolToken.getPoolTotalValue()).to.equal(expectedValue);
    });
  });

  describe("getAPTValue", () => {
    it("Revert when zero APT supply", async () => {
      expect(await poolToken.totalSupply()).to.equal(0);
      await expect(poolToken.getAPTValue(10)).to.be.revertedWith(
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
      await mAptMock.mock.getDeployedValue.returns(0);
      let poolTotalValue = await poolToken.getPoolTotalValue();
      let expectedValue = poolTotalValue.mul(aptAmount).div(aptSupply);
      expect(await poolToken.getAPTValue(aptAmount)).to.equal(expectedValue);

      // non-zero deployed value
      const deployedValue = tokenAmountToBigNumber(1234);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);
      poolTotalValue = await poolToken.getPoolTotalValue();
      expectedValue = poolTotalValue.mul(aptAmount).div(aptSupply);
      expect(await poolToken.getAPTValue(aptAmount)).to.equal(expectedValue);
    });
  });

  describe("getReserveTopUpAmount", () => {
    it("Returns 0 when pool has zero total value", async () => {
      // set pool total ETH value to 0
      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);
      await mAptMock.mock.getDeployedValue.returns(0);
      await underlyerMock.mock.balanceOf.returns(0);
      await underlyerMock.mock.decimals.returns(6);

      expect(await poolToken.getReserveTopUpValue()).to.equal(0);
    });

    it("Returns correctly calculated value when zero deployed value", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);
      await mAptMock.mock.getDeployedValue.returns(0);
      // set positive pool underlyer ETH value,
      // which should result in negative reserve top-up
      const decimals = 6;
      await underlyerMock.mock.decimals.returns(decimals);
      const poolBalance = tokenAmountToBigNumber(105e10, decimals);
      await underlyerMock.mock.balanceOf.returns(poolBalance);

      const aptSupply = tokenAmountToBigNumber(10000);
      await poolToken.testMint(deployer.address, aptSupply);

      const poolUnderlyerValue = await poolToken.getPoolUnderlyerValue();
      const topUpValue = await poolToken.getReserveTopUpValue();
      expect(topUpValue).to.be.lt(0);

      // assuming we add the top-up absolute value as the deployed
      // capital, the reserve percentage of resulting deployed value
      // is what we are targeting
      const reservePercentage = await poolToken.reservePercentage();
      const targetValue = topUpValue.mul(-1).mul(reservePercentage).div(100);
      expect(poolUnderlyerValue.add(topUpValue)).to.equal(targetValue);
    });

    it("Returns reservePercentage of post deployed value when zero balance", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);
      await underlyerMock.mock.balanceOf.returns(0);
      const decimals = 6;
      await underlyerMock.mock.decimals.returns(decimals);

      const aptSupply = tokenAmountToBigNumber(10000);
      await poolToken.testMint(deployer.address, aptSupply);

      const deployedValue = tokenAmountToBigNumber(1000);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);

      const topUpValue = await poolToken.getReserveTopUpValue();

      // assuming we unwind the top-up value from the pool's deployed
      // capital, the reserve percentage of resulting deployed value
      // is what we are targetting
      const reservePercentage = await poolToken.reservePercentage();
      const targetValue = deployedValue
        .sub(topUpValue)
        .mul(reservePercentage)
        .div(100);
      expect(topUpValue).to.equal(targetValue);
    });

    it("Returns correctly calculated value when top-up is positive", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);
      const decimals = 6;
      const poolBalance = tokenAmountToBigNumber(1e10, decimals);
      await underlyerMock.mock.balanceOf.returns(poolBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      const aptSupply = tokenAmountToBigNumber(10000);
      await poolToken.testMint(deployer.address, aptSupply);

      const deployedValue = tokenAmountToBigNumber(500);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);

      const poolUnderlyerValue = await poolToken.getPoolUnderlyerValue();
      const topUpValue = await poolToken.getReserveTopUpValue();
      expect(topUpValue).to.be.gt(0);

      // assuming we unwind the top-up value from the pool's deployed
      // capital, the reserve percentage of resulting deployed value
      // is what we are targeting
      const reservePercentage = await poolToken.reservePercentage();
      const targetValue = deployedValue
        .sub(topUpValue)
        .mul(reservePercentage)
        .div(100);
      expect(poolUnderlyerValue.add(topUpValue)).to.equal(targetValue);
    });

    it("Returns correctly calculated value when top-up is negative", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);
      const decimals = 0;
      const poolBalance = tokenAmountToBigNumber(2.05e18, decimals);
      await underlyerMock.mock.balanceOf.returns(poolBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      const aptSupply = tokenAmountToBigNumber(10000);
      await poolToken.testMint(deployer.address, aptSupply);

      const deployedValue = tokenAmountToBigNumber(20);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);

      const poolUnderlyerValue = await poolToken.getPoolUnderlyerValue();
      const topUpValue = await poolToken.getReserveTopUpValue();
      expect(topUpValue).to.be.lt(0);

      // assuming we deploy the top-up (abs) value to the pool's deployed
      // capital, the reserve percentage of resulting deployed value
      // is what we are targeting
      const reservePercentage = await poolToken.reservePercentage();
      const targetValue = deployedValue
        .sub(topUpValue)
        .mul(reservePercentage)
        .div(100);
      expect(poolUnderlyerValue.add(topUpValue)).to.equal(targetValue);
    });
  });

  describe("calculateMintAmount", () => {
    beforeEach(async () => {
      await mAptMock.mock.getDeployedValue.returns(0);
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
      await mAptMock.mock.getDeployedValue.returns(10000000);
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
      const poolTotalValue = await poolToken.getPoolTotalValue();
      const expectedMintAmount = aptTotalSupply
        .mul(depositValue)
        .div(poolTotalValue);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        expectedMintAmount
      );
    });
  });

  describe("getUnderlyerAmount", () => {
    beforeEach(async () => {
      await mAptMock.mock.getDeployedValue.returns(0);
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

  describe("addLiquidity", () => {
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

    describe("Last deposit time", () => {
      beforeEach(async () => {
        // These get rollbacked due to snapshotting.
        // Just enough mocking to get `addLiquidity` to not revert.
        await mAptMock.mock.getDeployedValue.returns(0);
        await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);
        await underlyerMock.mock.decimals.returns(6);
        await underlyerMock.mock.allowance.returns(1);
        await underlyerMock.mock.balanceOf.returns(1);
        await underlyerMock.mock.transferFrom.returns(true);
      });

      it("Save deposit time for user", async () => {
        await poolToken.connect(randomUser).addLiquidity(1);

        const blockTimestamp = (await ethers.provider.getBlock()).timestamp;
        expect(await poolToken.lastDepositTime(randomUser.address)).to.equal(
          blockTimestamp
        );
      });

      it("isEarlyRedeem is false before first deposit", async () => {
        // functional test to make sure first deposit will not be penalized
        expect(await poolToken.lastDepositTime(randomUser.address)).to.equal(0);
        expect(await poolToken.connect(randomUser).isEarlyRedeem()).to.be.false;
      });

      it("isEarlyRedeem returns correctly when called after deposit", async () => {
        await poolToken.connect(randomUser).addLiquidity(1);

        expect(await poolToken.connect(randomUser).isEarlyRedeem()).to.be.true;

        const feePeriod = await poolToken.feePeriod();
        await ethers.provider.send("evm_increaseTime", [feePeriod.toNumber()]); // add feePeriod seconds
        await ethers.provider.send("evm_mine"); // mine the next block
        expect(await poolToken.connect(randomUser).isEarlyRedeem()).to.be.false;
      });

      it("getUnderlyerAmountWithFee returns expected amount", async () => {
        const decimals = 1;
        await underlyerMock.mock.decimals.returns(decimals);
        const depositAmount = tokenAmountToBigNumber("1", decimals);
        await underlyerMock.mock.allowance.returns(depositAmount);
        await underlyerMock.mock.balanceOf.returns(depositAmount);
        await poolToken.testMint(
          deployer.address,
          tokenAmountToBigNumber("1000")
        );

        // make a desposit to update saved time
        await poolToken.connect(randomUser).addLiquidity(depositAmount);

        // calculate expected underlyer amount and fee
        const aptAmount = tokenAmountToBigNumber(1);
        const underlyerAmount = await poolToken.getUnderlyerAmount(aptAmount);
        const feePercentage = await poolToken.feePercentage();
        const fee = underlyerAmount.mul(feePercentage).div(100);

        // advance time not quite enough, so there is a fee
        const feePeriod = await poolToken.feePeriod();
        await ethers.provider.send("evm_increaseTime", [
          feePeriod.div(2).toNumber(),
        ]); // add feePeriod seconds
        await ethers.provider.send("evm_mine"); // mine the next block
        expect(await poolToken.getUnderlyerAmountWithFee(aptAmount)).to.equal(
          underlyerAmount.sub(fee)
        );

        // advance by just enough time; now there is no fee
        await ethers.provider.send("evm_increaseTime", [
          feePeriod.div(2).toNumber(),
        ]); // add feePeriod seconds
        await ethers.provider.send("evm_mine"); // mine the next block
        expect(await poolToken.getUnderlyerAmountWithFee(aptAmount)).to.equal(
          underlyerAmount
        );
      });
    });

    /* 
      Test with range of deployed TVL values.  Using 0 as
      deployed value forces old code paths without mAPT since
      the pool's total ETH value comes purely from its underlyer
      holdings.
    */
    const deployedValues = [
      tokenAmountToBigNumber(0),
      tokenAmountToBigNumber(2193389),
      tokenAmountToBigNumber(187892873),
    ];
    deployedValues.forEach(function (deployedValue) {
      describe(`  deployed value: ${deployedValue}`, () => {
        const decimals = 6;
        const depositAmount = tokenAmountToBigNumber(1, decimals);
        const poolBalance = tokenAmountToBigNumber(1000, decimals);

        // use EVM snapshots for test isolation
        let snapshotId;

        before(async () => {
          const snapshot = await timeMachine.takeSnapshot();
          snapshotId = snapshot["result"];

          await mAptMock.mock.getDeployedValue.returns(deployedValue);

          const price = 1;
          await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

          await underlyerMock.mock.decimals.returns(decimals);
          await underlyerMock.mock.allowance.returns(depositAmount);
          await underlyerMock.mock.balanceOf
            .withArgs(poolToken.address)
            .returns(poolBalance);
          await underlyerMock.mock.transferFrom.returns(true);
        });

        after(async () => {
          await timeMachine.revertToSnapshot(snapshotId);
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
          const expectedMintAmount = await poolToken.calculateMintAmount(
            depositAmount
          );
          const depositValue = await poolToken.getValueFromUnderlyerAmount(
            depositAmount
          );

          // mock the underlyer transfer to the pool, so we can
          // check deposit event has the post-deposit pool ETH value
          await underlyerMock.mock.balanceOf
            .withArgs(poolToken.address)
            .returns(poolBalance.add(depositAmount));
          const poolValue = await poolToken.getPoolTotalValue();
          // Technically this is a hack.  `getPoolTotalValue` gets called twice
          // in `addLiquidity`: before and after the transfer.  If APT total supply
          // were not zero, the pool eth value would be calculated and used both
          // times.  This would give inconsistent values to check against the event
          // and the test should fail (`expectedMintAmount` and `poolValue`
          // would be inconsistent.)
          //
          // See similar, but more extensive comments in the corresponding test
          // for `redeem`.

          const addLiquidityPromise = poolToken
            .connect(randomUser)
            .addLiquidity(depositAmount);

          await expect(addLiquidityPromise)
            .to.emit(poolToken, "Transfer")
            .withArgs(ZERO_ADDRESS, randomUser.address, expectedMintAmount);

          await expect(addLiquidityPromise)
            .to.emit(poolToken, "DepositedAPT")
            .withArgs(
              randomUser.address,
              underlyerMock.address,
              depositAmount,
              expectedMintAmount,
              depositValue,
              poolValue
            );
        });

        it("transferFrom called on underlyer", async () => {
          /* https://github.com/nomiclabs/hardhat/issues/1135
           * Due to the above issue, we can't simply do:
           *
           *  expect("transferFrom")
           *    .to.be.calledOnContract(underlyerMock)
           *    .withArgs(randomUser.address, poolToken.address, depositAmount);
           *
           *  Instead, we have to do some hacky revert-check logic.
           */
          await underlyerMock.mock.transferFrom.reverts();
          await expect(
            poolToken.connect(randomUser).addLiquidity(depositAmount)
          ).to.be.reverted;
          await underlyerMock.mock.transferFrom
            .withArgs(randomUser.address, poolToken.address, depositAmount)
            .returns(true);
          await expect(
            poolToken.connect(randomUser).addLiquidity(depositAmount)
          ).to.not.be.reverted;
        });

        it("Deposit should work after unlock", async () => {
          await poolToken.connect(deployer).lockAddLiquidity();
          await poolToken.connect(deployer).unlockAddLiquidity();

          await expect(
            poolToken.connect(randomUser).addLiquidity(depositAmount)
          ).to.not.be.reverted;
        });
      });
    });

    describe("Locking", () => {
      it("Owner can lock", async () => {
        await expect(poolToken.connect(deployer).lockAddLiquidity()).to.emit(
          poolToken,
          "AddLiquidityLocked"
        );
      });

      it("Owner can unlock", async () => {
        await expect(poolToken.connect(deployer).unlockAddLiquidity()).to.emit(
          poolToken,
          "AddLiquidityUnlocked"
        );
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
      await expect(poolToken.connect(randomUser).redeem(2)).to.be.revertedWith(
        "BALANCE_INSUFFICIENT"
      );
    });

    /* 
      Test with range of deployed TVL values.  Using 0 as
      deployed value forces old code paths without mAPT since
      the pool's total ETH value comes purely from its underlyer
      holdings.
    */
    const deployedValues = [
      tokenAmountToBigNumber(0),
      tokenAmountToBigNumber(2193389),
      tokenAmountToBigNumber(187892873),
    ];
    deployedValues.forEach(function (deployedValue) {
      describe(`  deployed value: ${deployedValue}`, () => {
        const decimals = 6;
        const poolBalance = tokenAmountToBigNumber(1000, decimals);
        const aptSupply = tokenAmountToBigNumber(1000000);
        let reserveAptAmount;
        let aptAmount;

        // use EVM snapshots for test isolation
        let snapshotId;

        before(async () => {
          const snapshot = await timeMachine.takeSnapshot();
          snapshotId = snapshot["result"];

          await mAptMock.mock.getDeployedValue.returns(deployedValue);

          const price = 1;
          await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

          await underlyerMock.mock.decimals.returns(decimals);
          await underlyerMock.mock.allowance.returns(poolBalance);
          await underlyerMock.mock.balanceOf
            .withArgs(poolToken.address)
            .returns(poolBalance);
          await underlyerMock.mock.transfer.returns(true);

          // Mint APT supply to go along with pool's total ETH value.
          await poolToken.mint(deployer.address, aptSupply);
          // Transfer reserve APT amount to user; must do a burn and mint
          // since inter-user transfer is blocked.
          reserveAptAmount = await poolToken.calculateMintAmount(poolBalance);
          await poolToken.burn(deployer.address, reserveAptAmount);
          await poolToken.mint(randomUser.address, reserveAptAmount);
          aptAmount = reserveAptAmount;
        });

        after(async () => {
          await timeMachine.revertToSnapshot(snapshotId);
        });

        it("Decrease APT balance by redeem amount", async () => {
          await expect(() =>
            poolToken.connect(randomUser).redeem(aptAmount)
          ).to.changeTokenBalance(poolToken, randomUser, aptAmount.mul(-1));
        });

        it("Emit correct APT events", async () => {
          const underlyerAmount = await poolToken.getUnderlyerAmount(aptAmount);
          const depositValue = await poolToken.getValueFromUnderlyerAmount(
            underlyerAmount
          );

          const poolValue = await poolToken.getPoolTotalValue();
          // This is wrong, as it is the value prior to the underlyer transfer.
          // However, it is the only way to get the test to pass with mocking.
          //
          // What we *should* do is mock the underlyer transfer from the pool, so we can
          // check redeem event has the post-redeem pool ETH value:
          //
          // await underlyerMock.mock.balanceOf
          //   .withArgs(poolToken.address)
          //   .returns(poolBalance.sub(underlyerAmount));
          //
          // The problem is that `getPoolTotalValue` gets called twice
          // in `redeem`: before (inside `getAPTValue`) and after the transfer,
          // in the event.  This gives inconsistent values between underlyerAmount
          // and poolTotalValue in the event args and we can't fix it by mocking
          // since it is all done in one transaction.
          //
          // If the mock contract allowed us to return different values on
          // consecutive calls, we could fix the test.
          //
          // The best option right now is to explicitly check the event is correct
          // in the integration tests.

          const redeemPromise = poolToken.connect(randomUser).redeem(aptAmount);

          await expect(redeemPromise)
            .to.emit(poolToken, "Transfer")
            .withArgs(randomUser.address, ZERO_ADDRESS, aptAmount);

          await expect(redeemPromise)
            .to.emit(poolToken, "RedeemedAPT")
            .withArgs(
              randomUser.address,
              underlyerMock.address,
              underlyerAmount,
              aptAmount,
              depositValue,
              poolValue
            );
        });

        it("transfer called on underlyer", async () => {
          /* https://github.com/nomiclabs/hardhat/issues/1135
           * Due to the above issue, we can't simply do:
           *
           *  expect("transfer")
           *    .to.be.calledOnContract(underlyerMock)
           *    .withArgs(randomUser.address, underlyerAmount);
           *
           *  Instead, we have to do some hacky revert-check logic.
           */
          const underlyerAmount = await poolToken.getUnderlyerAmount(aptAmount);
          await underlyerMock.mock.transfer.reverts();
          await expect(poolToken.connect(randomUser).redeem(aptAmount)).to.be
            .reverted;
          await underlyerMock.mock.transfer
            .withArgs(randomUser.address, underlyerAmount)
            .returns(true);
          await expect(poolToken.connect(randomUser).redeem(aptAmount)).to.not
            .be.reverted;
        });

        it("Redeem should work after unlock", async () => {
          await poolToken.connect(deployer).lockRedeem();
          await poolToken.connect(deployer).unlockRedeem();

          await expect(poolToken.connect(randomUser).redeem(aptAmount)).to.not
            .be.reverted;
        });

        it("Revert when underlyer amount exceeds reserve", async () => {
          // when zero deployed value, APT share gives ownership of only
          // underlyer amount, and this amount will be fully in the reserve
          // so there is nothing to test.
          if (deployedValue == 0) return;
          // this "transfer" pushes the user's corresponding underlyer amount
          // for his APT higher than the reserve balance.
          const smallAptAmount = 10;
          await poolToken.burn(deployer.address, smallAptAmount);
          await poolToken.mint(randomUser.address, smallAptAmount);

          await expect(
            poolToken
              .connect(randomUser)
              .redeem(reserveAptAmount.add(smallAptAmount))
          ).to.be.revertedWith("RESERVE_INSUFFICIENT");
        });
      });
    });

    describe("Locking", () => {
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
});
