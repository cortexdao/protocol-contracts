const { assert, expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;

const timeMachine = require("ganache-time-traveler");

const {
  ZERO_ADDRESS,
  FAKE_ADDRESS,
  tokenAmountToBigNumber,
  impersonateAccount,
} = require("../utils/helpers");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const AddressRegistry = artifacts.require("IAddressRegistryV2");
const MetaPoolToken = artifacts.require("MetaPoolToken");
const OracleAdapter = artifacts.require("OracleAdapter");

describe.only("Contract: IndexToken", () => {
  // signers
  let deployer;
  let adminSafe;
  let emergencySafe;
  let mApt;
  let lpAccount;
  let lpSafe;
  let randomUser;
  let receiver;
  let anotherUser;

  // mocks
  let underlyerMock;
  let addressRegistryMock;
  let mAptMock;
  let oracleAdapterMock;

  // pool
  let proxyAdmin;
  let indexToken;
  let logic;

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
    [
      deployer,
      lpAccount,
      adminSafe,
      emergencySafe,
      lpSafe,
      randomUser,
      receiver,
      anotherUser,
    ] = await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    underlyerMock = await deployMockContract(deployer, IDetailedERC20.abi);

    addressRegistryMock = await deployMockContract(
      deployer,
      AddressRegistry.abi
    );

    mAptMock = await deployMockContract(deployer, MetaPoolToken.abi);
    await addressRegistryMock.mock.mAptAddress.returns(mAptMock.address);

    oracleAdapterMock = await deployMockContract(deployer, OracleAdapter.abi);
    await addressRegistryMock.mock.oracleAdapterAddress.returns(
      oracleAdapterMock.address
    );

    await addressRegistryMock.mock.lpAccountAddress.returns(lpAccount.address);
    await addressRegistryMock.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistryMock.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistryMock.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );

    mApt = await impersonateAccount(mAptMock.address, 10);

    const IndexToken = await ethers.getContractFactory("TestIndexToken");
    logic = await IndexToken.deploy();
    await logic.deployed();

    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const initData = IndexToken.interface.encodeFunctionData(
      "initialize(address,address)",
      [addressRegistryMock.address, underlyerMock.address]
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      initData
    );
    await proxy.deployed();

    indexToken = await IndexToken.attach(proxy.address);
  });

  describe("Initialize", () => {
    it("Revert when address registry address is non-contract", async () => {
      await expect(
        logic.initialize(FAKE_ADDRESS, underlyerMock.address)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });

    it("Revert when token address is zero address", async () => {
      await expect(
        logic.initialize(addressRegistryMock.address, ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_TOKEN");
    });
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await indexToken.DEFAULT_ADMIN_ROLE();
      const memberCount = await indexToken.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await indexToken.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("Admin role given to Admin Safe", async () => {
      const ADMIN_ROLE = await indexToken.ADMIN_ROLE();
      const memberCount = await indexToken.getRoleMemberCount(ADMIN_ROLE);
      expect(memberCount).to.equal(1);
      expect(await indexToken.hasRole(ADMIN_ROLE, adminSafe.address)).to.be
        .true;
    });

    it("Contract role given to mAPT", async () => {
      const CONTRACT_ROLE = await indexToken.CONTRACT_ROLE();
      const memberCount = await indexToken.getRoleMemberCount(CONTRACT_ROLE);
      expect(memberCount).to.equal(1);
      expect(await indexToken.hasRole(CONTRACT_ROLE, mApt.address)).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await indexToken.EMERGENCY_ROLE();
      const memberCount = await indexToken.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await indexToken.hasRole(EMERGENCY_ROLE, emergencySafe.address)).to
        .be.true;
    });

    it("Name set to correct value", async () => {
      expect(await indexToken.name()).to.equal("Convex Index Token");
    });

    it("Symbol set to correct value", async () => {
      expect(await indexToken.symbol()).to.equal("idxCVX");
    });

    it("Decimals set to correct value", async () => {
      expect(await indexToken.decimals()).to.equal(18);
    });

    it("Block ether transfer", async () => {
      await expect(
        deployer.sendTransaction({ to: indexToken.address, value: "10" })
      ).to.be.reverted;
    });

    it("Asset is set correctly", async () => {
      expect(await indexToken.asset()).to.equal(underlyerMock.address);
    });

    it("deposit is unlocked", async () => {
      expect(await indexToken.depositLock()).to.equal(false);
    });

    it("redeem is unlocked", async () => {
      expect(await indexToken.redeemLock()).to.equal(false);
    });

    it("arbitrageFeePeriod set to correct value", async () => {
      expect(await indexToken.arbitrageFeePeriod()).to.equal(24 * 60 * 60);
    });

    it("arbitrageFee set to correct value", async () => {
      expect(await indexToken.arbitrageFee()).to.equal(5);
    });

    it("withdrawFee set to correct value", async () => {
      expect(await indexToken.withdrawFee()).to.equal(1000);
    });
  });

  describe("Set address registry", () => {
    it("Emergency Safe can set", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await indexToken
        .connect(emergencySafe)
        .emergencySetAddressRegistry(dummyContract.address);
      assert.equal(await indexToken.addressRegistry(), dummyContract.address);
    });

    it("Revert on non-contract address", async () => {
      await expect(
        indexToken
          .connect(emergencySafe)
          .emergencySetAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });

    it("Revert when unpermissioned account attempts to set", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await expect(
        indexToken
          .connect(randomUser)
          .emergencySetAddressRegistry(dummyContract.address)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("getUnderlyerPrice", () => {
    it("Delegates to oracle adapter", async () => {
      const price = tokenAmountToBigNumber("1.02", 8);
      await oracleAdapterMock.mock.getAssetPrice.returns(price);
      expect(await indexToken.getUnderlyerPrice()).to.equal(price);
    });

    it("Reverts with same reason as oracle adapter", async () => {
      await oracleAdapterMock.mock.getAssetPrice.revertsWithReason(
        "SOMETHING_WRONG"
      );
      await expect(indexToken.getUnderlyerPrice()).to.be.revertedWith(
        "SOMETHING_WRONG"
      );
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
        indexToken.connect(randomUser).deposit(50, randomUser.address)
      ).to.revertedWith("Pausable: paused");

      await expect(
        indexToken
          .connect(randomUser)
          .redeem(50, randomUser.address, randomUser.address)
      ).to.revertedWith("Pausable: paused");
    });

    it("Revert when calling transferToLpAccount on locked pool from mAPT", async () => {
      await indexToken.connect(emergencySafe).emergencyLock();

      await expect(
        indexToken.connect(mApt).transferToLpAccount(100)
      ).to.revertedWith("Pausable: paused");
    });
  });

  describe("Transfer to LP Safe", () => {
    before(async () => {
      await underlyerMock.mock.transfer.returns(true);
    });

    it("mAPT can call transferToLpAccount", async () => {
      await expect(indexToken.connect(mApt).transferToLpAccount(100)).to.not.be
        .reverted;
    });

    it("Revert when unpermissioned account calls transferToLpAccount", async () => {
      await expect(indexToken.connect(randomUser).transferToLpAccount(100)).to
        .be.reverted;
    });
  });

  describe("Set arbitrageFee", () => {
    it("Admin Safe can set", async () => {
      const newArbitrageFee = 12;
      const newFeePeriod = 12 * 60 * 60;
      await expect(
        indexToken
          .connect(adminSafe)
          .setArbitrageFee(newArbitrageFee, newFeePeriod)
      ).to.not.be.reverted;
      expect(await indexToken.arbitrageFee()).to.equal(newArbitrageFee);
      expect(await indexToken.arbitrageFeePeriod()).to.equal(newFeePeriod);
    });

    it("Revert if unpermissioned account attempts to set", async () => {
      await expect(indexToken.connect(randomUser).setArbitrageFee(12, 84600)).to
        .be.reverted;
    });
  });

  describe("Set reservePercentage", () => {
    it("Admin Safe can set", async () => {
      const newPercentage = 10;
      await expect(
        indexToken.connect(adminSafe).setReservePercentage(newPercentage)
      ).to.not.be.reverted;
      expect(await indexToken.reservePercentage()).to.equal(newPercentage);
    });

    it("Revert if unpermissioned account attempts to set", async () => {
      await expect(indexToken.connect(randomUser).setReservePercentage(10)).to
        .be.reverted;
    });
  });

  describe("Set withdrawFee", () => {
    it("Admin Safe can set", async () => {
      const newWithdrawFee = 1200;
      await expect(indexToken.connect(adminSafe).setWithdrawFee(newWithdrawFee))
        .to.not.be.reverted;
      expect(await indexToken.withdrawFee()).to.equal(newWithdrawFee);
    });

    it("Revert if unpermissioned account attempts to set", async () => {
      await expect(indexToken.connect(randomUser).setWithdrawFee(1200)).to.be
        .reverted;
    });
  });

  describe("getValueFromUnderlyerAmount", () => {
    it("Return 0 for zero amount", async () => {
      expect(await indexToken.getValueFromUnderlyerAmount(0)).to.equal(0);
    });

    it("Returns correct value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const price = 2;
      await oracleAdapterMock.mock.getAssetPrice.returns(price);

      const underlyerAmount = tokenAmountToBigNumber(5, decimals);
      // 50 * 2 / 10 ^ 1
      const expectedValue = underlyerAmount.mul(price).div(10 ** decimals);
      expect(
        await indexToken.getValueFromUnderlyerAmount(underlyerAmount)
      ).to.equal(expectedValue);
    });
  });

  describe("_getPoolUnderlyerValue", () => {
    it("Returns correct value regardless of deployed value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const balance = tokenAmountToBigNumber("7.5", decimals);
      await underlyerMock.mock.balanceOf.returns(balance);

      const price = 2;
      await oracleAdapterMock.mock.getAssetPrice.returns(price);

      // 75 * 2 / 10^1
      const expectedValue = balance.mul(price).div(10 ** decimals);

      // force zero deployed value
      await mAptMock.mock.getDeployedValue.returns(0);
      expect(await indexToken.testGetDeployedValue()).to.equal(0);
      expect(await indexToken.testGetPoolUnderlyerValue()).to.equal(
        expectedValue
      );

      // force non-zero deployed value
      await mAptMock.mock.getDeployedValue.returns(1234);
      expect(await indexToken.testGetDeployedValue()).to.be.gt(0);
      expect(await indexToken.testGetPoolUnderlyerValue()).to.equal(
        expectedValue
      );
    });
  });

  describe("_getDeployedValue", () => {
    it("Delegates properly to mAPT contract", async () => {
      await mAptMock.mock.getDeployedValue
        .withArgs(indexToken.address)
        .returns(0);
      expect(await indexToken.testGetDeployedValue()).to.equal(0);

      const deployedValue = tokenAmountToBigNumber(12345);
      await mAptMock.mock.getDeployedValue
        .withArgs(indexToken.address)
        .returns(deployedValue);
      expect(await indexToken.testGetDeployedValue()).to.equal(deployedValue);
    });

    it("Reverts with same reason when mAPT reverts", async () => {
      await mAptMock.mock.getDeployedValue
        .withArgs(indexToken.address)
        .revertsWithReason("SOMETHING_WRONG");
      await expect(indexToken.testGetDeployedValue()).to.be.revertedWith(
        "SOMETHING_WRONG"
      );
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
      await oracleAdapterMock.mock.getAssetPrice.returns(price);

      // Underlyer ETH value: 75 * 2 / 10^1 = 15
      const underlyerValue = underlyerBalance.mul(price).div(10 ** decimals);
      const expectedValue = underlyerValue.add(deployedValue);
      expect(await indexToken.getPoolTotalValue()).to.equal(expectedValue);
    });
  });

  describe("getUsdValue", () => {
    it("Return zero on zero amount", async () => {
      expect(await indexToken.totalSupply()).to.equal(0);
      expect(await indexToken.getUsdValue(0)).to.equal(0);
    });

    it("Revert on nonzero amount when zero APT supply", async () => {
      expect(await indexToken.totalSupply()).to.equal(0);
      await expect(indexToken.getUsdValue(10)).to.be.revertedWith(
        "INSUFFICIENT_TOTAL_SUPPLY"
      );
    });

    it("Returns correct value", async () => {
      await indexToken.testMint(randomUser.address, 100);
      await underlyerMock.mock.decimals.returns(0);
      await underlyerMock.mock.balanceOf.returns(100);

      const price = 2;
      await oracleAdapterMock.mock.getAssetPrice.returns(price);

      const aptSupply = await indexToken.totalSupply();
      const aptAmount = tokenAmountToBigNumber(10);

      // zero deployed value
      await mAptMock.mock.getDeployedValue.returns(0);
      let poolTotalValue = await indexToken.getPoolTotalValue();
      let expectedValue = poolTotalValue.mul(aptAmount).div(aptSupply);
      expect(await indexToken.getUsdValue(aptAmount)).to.equal(expectedValue);

      // non-zero deployed value
      const deployedValue = tokenAmountToBigNumber(1234);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);
      poolTotalValue = await indexToken.getPoolTotalValue();
      expectedValue = poolTotalValue.mul(aptAmount).div(aptSupply);
      expect(await indexToken.getUsdValue(aptAmount)).to.equal(expectedValue);
    });
  });

  describe("getReserveTopUpValue", () => {
    it("Returns 0 when pool has zero total value", async () => {
      // set pool total ETH value to 0
      await oracleAdapterMock.mock.getAssetPrice.returns(1);
      await mAptMock.mock.getDeployedValue.returns(0);
      await underlyerMock.mock.balanceOf.returns(0);
      await underlyerMock.mock.decimals.returns(6);

      expect(await indexToken.getReserveTopUpValue()).to.equal(0);
    });

    it("Returns correctly calculated value when zero deployed value", async () => {
      await oracleAdapterMock.mock.getAssetPrice.returns(1);
      await mAptMock.mock.getDeployedValue.returns(0);
      // set positive pool underlyer ETH value,
      // which should result in negative reserve top-up
      const decimals = 6;
      await underlyerMock.mock.decimals.returns(decimals);
      const poolBalance = tokenAmountToBigNumber(105e10, decimals);
      await underlyerMock.mock.balanceOf.returns(poolBalance);

      const aptSupply = tokenAmountToBigNumber(10000);
      await indexToken.testMint(deployer.address, aptSupply);

      const topUpAmount = await indexToken.getReserveTopUpValue();
      expect(topUpAmount).to.be.lt(0);

      // assuming we add the top-up absolute value as the deployed
      // capital, the reserve percentage of resulting deployed value
      // is what we are targeting
      const reservePercentage = await indexToken.reservePercentage();
      const targetValue = topUpAmount.mul(-1).mul(reservePercentage).div(100);
      expect(poolBalance.add(topUpAmount)).to.equal(targetValue);
    });

    it("Returns reservePercentage of post deployed value when zero balance", async () => {
      const price = 1;
      await oracleAdapterMock.mock.getAssetPrice.returns(price);
      await underlyerMock.mock.balanceOf.returns(0);
      const decimals = 6;
      await underlyerMock.mock.decimals.returns(decimals);

      const aptSupply = tokenAmountToBigNumber(10000);
      await indexToken.testMint(deployer.address, aptSupply);

      const deployedValue = tokenAmountToBigNumber(1000);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);

      const topUpAmount = await indexToken.getReserveTopUpValue();
      const topUpValue = topUpAmount.mul(price).div(10 ** decimals);

      // assuming we unwind the top-up value from the pool's deployed
      // capital, the reserve percentage of resulting deployed value
      // is what we are targetting
      const reservePercentage = await indexToken.reservePercentage();
      const targetValue = deployedValue
        .sub(topUpValue)
        .mul(reservePercentage)
        .div(100);
      expect(topUpValue).to.equal(targetValue);
    });

    it("Returns correctly calculated value when top-up is positive", async () => {
      const price = 1;
      await oracleAdapterMock.mock.getAssetPrice.returns(price);
      const decimals = 6;
      const poolBalance = tokenAmountToBigNumber(1e10, decimals);
      await underlyerMock.mock.balanceOf.returns(poolBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      const aptSupply = tokenAmountToBigNumber(10000);
      await indexToken.testMint(deployer.address, aptSupply);

      const deployedValue = tokenAmountToBigNumber(500);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);

      const poolUnderlyerValue = await indexToken.testGetPoolUnderlyerValue();
      const topUpAmount = await indexToken.getReserveTopUpValue();
      expect(topUpAmount).to.be.gt(0);

      const topUpValue = topUpAmount.mul(price).div(10 ** decimals);

      // assuming we unwind the top-up value from the pool's deployed
      // capital, the reserve percentage of resulting deployed value
      // is what we are targeting
      const reservePercentage = await indexToken.reservePercentage();
      const targetValue = deployedValue
        .sub(topUpValue)
        .mul(reservePercentage)
        .div(100);
      expect(poolUnderlyerValue.add(topUpValue)).to.equal(targetValue);
    });

    it("Returns correctly calculated value when top-up is negative", async () => {
      const price = 1;
      await oracleAdapterMock.mock.getAssetPrice.returns(price);
      const decimals = 6;
      const poolBalance = tokenAmountToBigNumber(2.05e18, decimals);
      await underlyerMock.mock.balanceOf.returns(poolBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      const aptSupply = tokenAmountToBigNumber(10000);
      await indexToken.testMint(deployer.address, aptSupply);

      const deployedValue = tokenAmountToBigNumber(20);
      await mAptMock.mock.getDeployedValue.returns(deployedValue);

      const poolUnderlyerValue = await indexToken.testGetPoolUnderlyerValue();
      const topUpAmount = await indexToken.getReserveTopUpValue();
      expect(topUpAmount).to.be.lt(0);

      const topUpValue = topUpAmount.mul(price).div(10 ** decimals);

      // assuming we deploy the top-up (abs) value to the pool's deployed
      // capital, the reserve percentage of resulting deployed value
      // is what we are targeting
      const reservePercentage = await indexToken.reservePercentage();
      const targetValue = deployedValue
        .sub(topUpValue)
        .mul(reservePercentage)
        .div(100);
      expect(poolUnderlyerValue.add(topUpValue)).to.equal(targetValue);
    });
  });

  describe("convertToShares", () => {
    beforeEach(async () => {
      await mAptMock.mock.getDeployedValue.returns(0);
    });

    it("Uses 1:1 ratio with zero total supply", async () => {
      expect(await indexToken.totalSupply()).to.equal(0);

      await underlyerMock.mock.decimals.returns("0");
      await oracleAdapterMock.mock.getAssetPrice.returns(1);

      const depositAmount = tokenAmountToBigNumber("123");

      await underlyerMock.mock.balanceOf.returns(9999);
      expect(await indexToken.convertToShares(depositAmount)).to.equal(
        depositAmount
      );

      // result doesn't depend on pool's underlyer balance
      await underlyerMock.mock.balanceOf
        .withArgs(indexToken.address)
        .returns(0);
      expect(await indexToken.convertToShares(depositAmount)).to.equal(
        depositAmount
      );

      // result doesn't depend on pool's deployed value
      await mAptMock.mock.getDeployedValue.returns(10000000);
      expect(await indexToken.convertToShares(depositAmount)).to.equal(
        depositAmount
      );
    });

    it("Returns calculated value with non-zero total supply", async () => {
      const decimals = "0";

      const aptTotalSupply = tokenAmountToBigNumber("900", "18");
      const depositAmount = tokenAmountToBigNumber("1000", decimals);
      const poolBalance = tokenAmountToBigNumber("9999", decimals);

      await oracleAdapterMock.mock.getAssetPrice.returns(1);
      await underlyerMock.mock.balanceOf.returns(poolBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      await indexToken.testMint(indexToken.address, aptTotalSupply);
      const expectedMintAmount = aptTotalSupply
        .mul(depositAmount)
        .div(poolBalance);
      expect(await indexToken.convertToShares(depositAmount)).to.equal(
        expectedMintAmount
      );
    });

    it("Returns calculated value with non-zero total supply and deployed value", async () => {
      const decimals = "0";

      const aptTotalSupply = tokenAmountToBigNumber("900", "18");
      const depositAmount = tokenAmountToBigNumber("1000", decimals);
      const poolUnderlyerBalance = tokenAmountToBigNumber("9999", decimals);

      const price = 1;
      await oracleAdapterMock.mock.getAssetPrice.returns(price);
      await underlyerMock.mock.balanceOf.returns(poolUnderlyerBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      await mAptMock.mock.balanceOf.returns(tokenAmountToBigNumber(10));
      await mAptMock.mock.totalSupply.returns(tokenAmountToBigNumber(1000));
      await mAptMock.mock.getDeployedValue.returns(
        tokenAmountToBigNumber(10000000)
      );

      await indexToken.testMint(indexToken.address, aptTotalSupply);

      const depositValue = depositAmount.mul(price).div(10 ** decimals);
      const poolTotalValue = await indexToken.getPoolTotalValue();
      const expectedMintAmount = aptTotalSupply
        .mul(depositValue)
        .div(poolTotalValue);
      expect(await indexToken.convertToShares(depositAmount)).to.equal(
        expectedMintAmount
      );
    });
  });

  describe("convertToAssets", () => {
    beforeEach(async () => {
      await mAptMock.mock.getDeployedValue.returns(0);
    });

    it("Convert 1:1 on zero total supply", async () => {
      expect(await indexToken.totalSupply()).to.equal(0);
      expect(await indexToken.convertToAssets(100)).to.equal(100);
    });

    it("Always return zero on zero input", async () => {
      expect(await indexToken.totalSupply()).to.equal(0);
      expect(await indexToken.convertToAssets(0)).to.equal(0);
    });

    it("Returns expected amount", async () => {
      const decimals = 6;
      const underlyerBalance = tokenAmountToBigNumber(250, decimals);
      await underlyerMock.mock.balanceOf.returns(underlyerBalance);
      await underlyerMock.mock.decimals.returns(decimals);
      await oracleAdapterMock.mock.getAssetPrice.returns(
        tokenAmountToBigNumber("1.02", 8)
      );

      const aptAmount = tokenAmountToBigNumber(1, 18);
      await indexToken.testMint(randomUser.address, aptAmount);
      const totalSupply = await indexToken.totalSupply();
      const underlyerAmount = await indexToken.convertToAssets(aptAmount);

      // deployed value is zero so total value is only from underlyer, so after
      // price conversion result is just the APT share of underlyer balance
      const expectedAmount = underlyerBalance.mul(aptAmount).div(totalSupply);
      expect(underlyerAmount).to.equal(expectedAmount);
    });
  });

  describe("deposit", () => {
    it("Revert if deposit is zero", async () => {
      await expect(indexToken.deposit(0, receiver.address)).to.be.revertedWith(
        "AMOUNT_INSUFFICIENT"
      );
    });

    it("Revert if allowance is less than deposit", async () => {
      await underlyerMock.mock.allowance.returns(0);
      await expect(indexToken.deposit(1, receiver.address)).to.be.revertedWith(
        "ALLOWANCE_INSUFFICIENT"
      );
    });

    describe("Last deposit time", () => {
      beforeEach(async () => {
        // These get rollbacked due to snapshotting.
        // Just enough mocking to get `deposit` to not revert.
        await mAptMock.mock.getDeployedValue.returns(0);
        await oracleAdapterMock.mock.getAssetPrice.returns(1);
        await underlyerMock.mock.decimals.returns(6);
        await underlyerMock.mock.allowance.returns(1);
        await underlyerMock.mock.balanceOf.returns(1);
        await underlyerMock.mock.transferFrom.returns(true);
      });

      it("Save deposit time for receiver", async () => {
        await indexToken.connect(randomUser).deposit(1, receiver.address);

        const blockTimestamp = (await ethers.provider.getBlock()).timestamp;
        expect(await indexToken.lastDepositTime(receiver.address)).to.equal(
          blockTimestamp
        );
      });

      it("hasArbFee is false before first deposit", async () => {
        // functional test to make sure first deposit will not be penalized
        expect(await indexToken.lastDepositTime(receiver.address)).to.equal(0);
        expect(await indexToken.hasArbFee(receiver.address)).to.be.false;
      });

      it("hasArbFee returns correctly when called after deposit", async () => {
        await indexToken.connect(randomUser).deposit(1, receiver.address);

        expect(await indexToken.hasArbFee(receiver.address)).to.be.true;

        const arbitrageFeePeriod = await indexToken.arbitrageFeePeriod();
        await ethers.provider.send("evm_increaseTime", [
          arbitrageFeePeriod.toNumber(),
        ]); // add arbitrageFeePeriod seconds
        await ethers.provider.send("evm_mine"); // mine the next block
        expect(await indexToken.hasArbFee(receiver.address)).to.be.false;
      });

      it("getUnderlyerAmountWithFee returns expected amount", async () => {
        const decimals = 18;
        await underlyerMock.mock.decimals.returns(decimals);
        const depositAmount = tokenAmountToBigNumber("1", decimals);
        await underlyerMock.mock.allowance.returns(depositAmount);
        await underlyerMock.mock.balanceOf.returns(depositAmount);
        await indexToken.testMint(
          deployer.address,
          tokenAmountToBigNumber("1000")
        );

        // make a deposit to update saved time
        await indexToken
          .connect(randomUser)
          .deposit(depositAmount, receiver.address);

        // calculate expected underlyer amount after withdrawal fee
        const aptAmount = tokenAmountToBigNumber(1);
        const originalUnderlyerAmount = await indexToken.convertToAssets(
          aptAmount
        );
        const withdrawFee = await indexToken.withdrawFee();
        const withdrawFeeAmount = originalUnderlyerAmount
          .mul(withdrawFee)
          .div(1000000);
        const underlyerAmount = originalUnderlyerAmount.sub(withdrawFeeAmount);

        // calculate arbitrage fee
        const arbitrageFee = await indexToken.arbitrageFee();
        const fee = originalUnderlyerAmount.mul(arbitrageFee).div(100);

        // There is an arbitrage fee.
        // WARNING: need to call `getUnderlyerAmountWithFee` using depositor
        // since last deposit time needs to get set
        expect(
          await indexToken["previewRedeem(uint256,address)"](
            aptAmount,
            receiver.address
          )
        ).to.equal(underlyerAmount.sub(fee));

        // advance by just enough time; now there is no arbitrage fee
        const arbitrageFeePeriod = await indexToken.arbitrageFeePeriod();
        await ethers.provider.send("evm_increaseTime", [
          arbitrageFeePeriod.toNumber(),
        ]);
        await ethers.provider.send("evm_mine"); // mine the next block
        expect(
          await indexToken["previewRedeem(uint256,address)"](
            aptAmount,
            receiver.address
          )
        ).to.equal(underlyerAmount);
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
          await oracleAdapterMock.mock.getAssetPrice.returns(price);

          await underlyerMock.mock.decimals.returns(decimals);
          await underlyerMock.mock.allowance.returns(depositAmount);
          await underlyerMock.mock.balanceOf
            .withArgs(indexToken.address)
            .returns(poolBalance);
          await underlyerMock.mock.transferFrom.returns(true);
        });

        after(async () => {
          await timeMachine.revertToSnapshot(snapshotId);
        });

        it("Increase APT balance by calculated amount", async () => {
          const expectedMintAmount = await indexToken.convertToShares(
            depositAmount
          );

          await expect(() =>
            indexToken
              .connect(randomUser)
              .deposit(depositAmount, receiver.address)
          ).to.changeTokenBalance(indexToken, receiver, expectedMintAmount);
        });

        it("Emit correct APT events", async () => {
          const expectedMintAmount = await indexToken.convertToShares(
            depositAmount
          );

          // mock the underlyer transfer to the pool, so we can
          // check deposit event has the post-deposit pool ETH value
          await underlyerMock.mock.balanceOf
            .withArgs(indexToken.address)
            .returns(poolBalance.add(depositAmount));

          const depositPromise = indexToken
            .connect(randomUser)
            .deposit(depositAmount, receiver.address);

          await expect(depositPromise)
            .to.emit(indexToken, "Transfer")
            .withArgs(ZERO_ADDRESS, receiver.address, expectedMintAmount);

          await expect(depositPromise)
            .to.emit(indexToken, "Deposit")
            .withArgs(
              randomUser.address,
              receiver.address,
              depositAmount,
              expectedMintAmount
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
          await underlyerMock.mock.transferFrom.revertsWithReason("FAIL_TEST");
          await expect(
            indexToken
              .connect(randomUser)
              .deposit(depositAmount, receiver.address)
          ).to.be.revertedWith("FAIL_TEST");
          await underlyerMock.mock.transferFrom
            .withArgs(randomUser.address, indexToken.address, depositAmount)
            .returns(true);
          await expect(
            indexToken
              .connect(randomUser)
              .deposit(depositAmount, receiver.address)
          ).to.not.be.reverted;
        });

        it("Deposit should work after unlock", async () => {
          await indexToken.connect(emergencySafe).emergencyLockDeposit();
          await indexToken.connect(emergencySafe).emergencyUnlockDeposit();

          await expect(
            indexToken
              .connect(randomUser)
              .deposit(depositAmount, receiver.address)
          ).to.not.be.reverted;
        });
      });
    });

    describe("Locking", () => {
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
          await oracleAdapterMock.mock.getAssetPrice.returns(price);

          await underlyerMock.mock.decimals.returns(decimals);
          await underlyerMock.mock.allowance.returns(poolBalance);
          await underlyerMock.mock.balanceOf
            .withArgs(indexToken.address)
            .returns(poolBalance);
          await underlyerMock.mock.transfer.returns(true);

          // Mint APT supply to go along with pool's total ETH value.
          await indexToken.testMint(deployer.address, aptSupply);
          reserveAptAmount = await indexToken.convertToShares(poolBalance);
          await indexToken
            .connect(deployer)
            .transfer(randomUser.address, reserveAptAmount);
          aptAmount = reserveAptAmount;
        });

        after(async () => {
          await timeMachine.revertToSnapshot(snapshotId);
        });

        it("Decrease APT balance by redeem amount", async () => {
          await expect(() =>
            indexToken
              .connect(randomUser)
              .redeem(aptAmount, receiver.address, randomUser.address)
          ).to.changeTokenBalance(indexToken, randomUser, aptAmount.mul(-1));
        });

        it("Approved user can redeem", async () => {
          await indexToken
            .connect(randomUser)
            .approve(anotherUser.address, aptAmount);
          await expect(() =>
            indexToken
              .connect(anotherUser)
              .redeem(aptAmount, receiver.address, randomUser.address)
          ).to.changeTokenBalance(indexToken, randomUser, aptAmount.mul(-1));
        });

        it("Unapproved user cannot redeem", async () => {
          expect(
            await indexToken.allowance(randomUser.address, anotherUser.address)
          ).to.equal(0);
          await expect(
            indexToken
              .connect(anotherUser)
              .redeem(aptAmount, receiver.address, randomUser.address)
          ).to.be.revertedWith("ALLOWANCE_INSUFFICIENT");
        });

        it("Emit correct APT events", async () => {
          const underlyerAmount = await indexToken[
            "previewRedeem(uint256,address)"
          ](aptAmount, randomUser.address);

          const redeemPromise = indexToken
            .connect(randomUser)
            .redeem(aptAmount, randomUser.address, randomUser.address);

          await expect(redeemPromise)
            .to.emit(indexToken, "Transfer")
            .withArgs(randomUser.address, ZERO_ADDRESS, aptAmount);

          await expect(redeemPromise)
            .to.emit(indexToken, "Withdraw")
            .withArgs(
              randomUser.address,
              randomUser.address,
              randomUser.address,
              underlyerAmount,
              aptAmount
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
          const underlyerAmount = await indexToken[
            "previewRedeem(uint256,address)"
          ](aptAmount, randomUser.address);
          await underlyerMock.mock.transfer.reverts();
          await expect(
            indexToken
              .connect(randomUser)
              .redeem(aptAmount, randomUser.address, randomUser.address)
          ).to.be.reverted;
          await underlyerMock.mock.transfer
            .withArgs(randomUser.address, underlyerAmount)
            .returns(true);
          await expect(
            indexToken
              .connect(randomUser)
              .redeem(aptAmount, randomUser.address, randomUser.address)
          ).to.not.be.reverted;
        });

        it("Redeem should work after unlock", async () => {
          await indexToken.connect(emergencySafe).emergencyLockRedeem();
          await indexToken.connect(emergencySafe).emergencyUnlockRedeem();

          await expect(
            indexToken
              .connect(randomUser)
              .redeem(aptAmount, randomUser.address, randomUser.address)
          ).to.not.be.reverted;
        });

        it("Revert when underlyer amount exceeds reserve", async () => {
          // when zero deployed value, APT share gives ownership of only
          // underlyer amount, and this amount will be fully in the reserve
          // so there is nothing to test.
          if (deployedValue == 0) return;
          // this "transfer" pushes the user's corresponding underlyer amount
          // for his APT higher than the reserve balance.
          const smallAptAmount = tokenAmountToBigNumber("0.0000001");
          await indexToken.testBurn(deployer.address, smallAptAmount);
          await indexToken.testMint(randomUser.address, smallAptAmount);

          await expect(
            indexToken
              .connect(randomUser)
              .redeem(
                reserveAptAmount.add(smallAptAmount),
                randomUser.address,
                randomUser.address
              )
          ).to.be.revertedWith("RESERVE_INSUFFICIENT");
        });
      });
    });

    describe("Locking", () => {
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
            .redeem(1, randomUser.address, randomUser.address)
        ).to.be.revertedWith("LOCKED");
      });
    });
  });
});
