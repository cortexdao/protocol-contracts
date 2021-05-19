const { expect, assert } = require("chai");
const { ethers, web3, artifacts, waffle } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const {
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  tokenAmountToBigNumber,
} = require("../utils/helpers");
const { deployMockContract } = waffle;
const AggregatorV3Interface = artifacts.require("AggregatorV3Interface");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

const usdc = (amount) => tokenAmountToBigNumber(amount, "6");
const dai = (amount) => tokenAmountToBigNumber(amount, "18");
const ether = (amount) => tokenAmountToBigNumber(amount, "18");

describe("Contract: MetaPoolToken", () => {
  // signers
  let deployer;
  let manager;
  let randomUser;
  let anotherUser;

  // contract factories
  // have to be set async in "before"
  let ProxyAdmin;
  let MetaPoolTokenProxy;
  let MetaPoolToken;

  // deployed contracts
  let proxyAdmin;
  let logic;
  let proxy;
  let mApt;

  // default settings
  // mocks have to be done async in "before"
  let tvlAggMock;
  let addressRegistryMock;

  const aggStalePeriod = 14400;

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
    [deployer, manager, randomUser, anotherUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    MetaPoolTokenProxy = await ethers.getContractFactory("MetaPoolTokenProxy");
    MetaPoolToken = await ethers.getContractFactory("TestMetaPoolToken");

    tvlAggMock = await deployMockContract(deployer, AggregatorV3Interface.abi);
    addressRegistryMock = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    await addressRegistryMock.mock.poolManagerAddress.returns(manager.address);

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await MetaPoolToken.deploy();
    await logic.deployed();
    proxy = await MetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      tvlAggMock.address,
      addressRegistryMock.address,
      aggStalePeriod
    );
    await proxy.deployed();
    mApt = await MetaPoolToken.attach(proxy.address);
  });

  describe("Constructor", () => {
    it("Revert when logic is not a contract address", async () => {
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          DUMMY_ADDRESS,
          proxyAdmin.address,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          120
        )
      ).to.be.revertedWith(
        "UpgradeableProxy: new implementation is not a contract"
      );
    });

    it("Revert when proxy admin is zero address", async () => {
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          ZERO_ADDRESS,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          120
        )
      ).to.be.reverted;
    });

    it("Revert when TVL aggregator is zero address", async () => {
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          DUMMY_ADDRESS,
          ZERO_ADDRESS,
          DUMMY_ADDRESS,
          120
        )
      ).to.be.reverted;
    });

    it("Revert when TVL address registry is zero address", async () => {
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          ZERO_ADDRESS,
          120
        )
      ).to.be.reverted;
    });

    it("Revert when aggStalePeriod is zero", async () => {
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          0
        )
      ).to.be.reverted;
    });
  });

  describe("Defaults", () => {
    it("Owner is set to deployer", async () => {
      expect(await mApt.owner()).to.equal(deployer.address);
    });

    it("Name set to correct value", async () => {
      expect(await mApt.name()).to.equal("APY MetaPool Token");
    });

    it("Symbol set to correct value", async () => {
      expect(await mApt.symbol()).to.equal("mAPT");
    });

    it("Decimals set to correct value", async () => {
      expect(await mApt.decimals()).to.equal(18);
    });

    it("Admin set correctly", async () => {
      expect(await mApt.proxyAdmin()).to.equal(proxyAdmin.address);
    });

    it("TVL agg set correctly", async () => {
      expect(await mApt.tvlAgg()).to.equal(tvlAggMock.address);
    });

    it("aggStalePeriod set to correct value", async () => {
      expect(await mApt.aggStalePeriod()).to.equal(aggStalePeriod);
    });

    it("TVL lock period is zero", async () => {
      expect(await mApt.tvlLockEnd()).to.equal(0);
    });
  });

  describe("Set admin address", () => {
    it("Owner can set to valid address", async () => {
      await mApt.connect(deployer).setAdminAddress(randomUser.address);
      expect(await mApt.proxyAdmin()).to.equal(randomUser.address);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expect(
        mApt.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        mApt.connect(deployer).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("Set TVL aggregator address", () => {
    it("Owner can set to valid address", async () => {
      await mApt.connect(deployer).setTvlAggregator(DUMMY_ADDRESS);
      assert.equal(await mApt.tvlAgg(), DUMMY_ADDRESS);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expect(
        mApt.connect(randomUser).setTvlAggregator(DUMMY_ADDRESS)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        mApt.connect(deployer).setTvlAggregator(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_AGG");
    });
  });

  describe("Set aggregator staleness period", () => {
    it("Owner can set to valid value", async () => {
      const newPeriod = 360;
      expect(await mApt.aggStalePeriod()).to.not.equal(newPeriod);
      await mApt.connect(deployer).setAggStalePeriod(newPeriod);
      expect(await mApt.aggStalePeriod()).to.equal(newPeriod);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expect(
        mApt.connect(randomUser).setAggStalePeriod(60)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Cannot set to zero", async () => {
      await expect(
        mApt.connect(deployer).setAggStalePeriod(0)
      ).to.be.revertedWith("INVALID_STALE_PERIOD");
    });
  });

  describe("Lock TVL for given period", () => {
    it("Owner can set", async () => {
      const lockPeriod = 100;
      await mApt.connect(deployer).lockTVL(lockPeriod);

      const currentBlock = (await ethers.provider.getBlock()).number;
      const expectedLockEnd = currentBlock + lockPeriod;
      expect(await mApt.tvlLockEnd()).to.equal(expectedLockEnd);
    });

    it("Revert when non-owner attempts to lock", async () => {
      const lockPeriod = 100;
      await expect(
        mApt.connect(randomUser).lockTVL(lockPeriod)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Minting and burning", () => {
    it("Manager can mint", async () => {
      const mintAmount = tokenAmountToBigNumber("100");
      await expect(mApt.connect(manager).mint(randomUser.address, mintAmount))
        .to.not.be.reverted;

      expect(await mApt.balanceOf(randomUser.address)).to.equal(mintAmount);
    });

    it("Manager can burn", async () => {
      const mintAmount = tokenAmountToBigNumber("100");
      const burnAmount = tokenAmountToBigNumber("90");
      await mApt.connect(manager).mint(randomUser.address, mintAmount);
      await expect(mApt.connect(manager).burn(randomUser.address, burnAmount))
        .to.not.be.reverted;

      expect(await mApt.balanceOf(randomUser.address)).to.equal(
        mintAmount.sub(burnAmount)
      );
    });

    it("Revert when non-manager attempts to mint", async () => {
      await expect(
        mApt
          .connect(randomUser)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
      await expect(
        mApt
          .connect(deployer)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
    });

    it("Revert when non-manager attempts to burn", async () => {
      await expect(
        mApt
          .connect(randomUser)
          .burn(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
      await expect(
        mApt
          .connect(deployer)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
    });

    it("Revert when minting zero", async () => {
      await expect(
        mApt.connect(manager).mint(randomUser.address, 0)
      ).to.be.revertedWith("INVALID_MINT_AMOUNT");
    });

    it("Revert when burning zero", async () => {
      await expect(
        mApt.connect(manager).burn(randomUser.address, 0)
      ).to.be.revertedWith("INVALID_BURN_AMOUNT");
    });
  });

  describe("getDeployedValue", () => {
    it("Return 0 if zero mAPT supply", async () => {
      expect(await mApt.totalSupply()).to.equal("0");
      expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal("0");
    });

    it("Return 0 if zero mAPT balance", async () => {
      await mApt
        .connect(manager)
        .mint(FAKE_ADDRESS, tokenAmountToBigNumber(1000));
      expect(await mApt.getDeployedValue(ANOTHER_FAKE_ADDRESS)).to.equal(0);
    });

    it("Returns calculated value for non-zero mAPT balance", async () => {
      const tvl = ether("502300");
      const balance = tokenAmountToBigNumber("1000");
      const anotherBalance = tokenAmountToBigNumber("12345");
      const totalSupply = balance.add(anotherBalance);

      await mApt.setTVL(tvl);
      await mApt.connect(manager).mint(FAKE_ADDRESS, balance);
      await mApt.connect(manager).mint(ANOTHER_FAKE_ADDRESS, anotherBalance);

      const expectedValue = tvl.mul(balance).div(totalSupply);
      expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal(expectedValue);
    });
  });

  describe("Calculations", () => {
    it("Calculate mint amount with zero deployed TVL", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));

      await mApt
        .connect(manager)
        .mint(anotherUser.address, tokenAmountToBigNumber(100));

      const mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate mint amount with zero total supply", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await mApt.setTVL(1);

      const mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate mint amount with non-zero total supply", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      let usdcAmount = usdc(107);
      let tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await mApt.setTVL(tvl);

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);

      let mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(totalSupply);

      tvl = usdcEthPrice.mul(usdcAmount.mul(2)).div(usdc(1));
      await mApt.setTVL(tvl);
      const expectedMintAmount = totalSupply.div(2);
      mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate pool amount with 1 pool", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      const usdcAmount = usdc(107);
      const tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await mApt.setTVL(tvl);

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);

      let poolAmount = await mApt.calculatePoolAmount(
        totalSupply,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(usdcAmount);

      const mAptAmount = tokenAmountToBigNumber(5);
      const expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      const expectedPoolAmount = expectedPoolValue
        .mul(usdc(1))
        .div(usdcEthPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);
    });

    it("Calculate pool amount with 2 pools", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      const daiEthPrice = tokenAmountToBigNumber("1603100000000000");
      const usdcAmount = usdc(107);
      const daiAmount = dai(10);
      const usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      const daiValue = daiEthPrice.mul(daiAmount).div(dai(1));
      const tvl = usdcValue.add(daiValue);
      await mApt.setTVL(tvl);

      const totalSupply = tokenAmountToBigNumber(21);
      let mAptAmount = tokenAmountToBigNumber(10);
      let expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      let expectedPoolAmount = expectedPoolValue.mul(usdc(1)).div(usdcEthPrice);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);
      let poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);

      mAptAmount = totalSupply.sub(mAptAmount);
      expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      expectedPoolAmount = expectedPoolValue.mul(dai(1)).div(daiEthPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        daiEthPrice,
        "18"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);
    });
  });

  describe("getTVL and auxiliary functions", () => {
    const usdTvl = tokenAmountToBigNumber("2510012387654321");

    before(async () => {
      /* for these tests, we want to test the actual implementation
         of `getTVL`, rather than mocking it out, so we need
         to deploy the real contract, not the test version. */

      // Note our local declarations shadow some existing globals
      // but their scope is limited to this `before`.
      const MetaPoolToken = await ethers.getContractFactory(
        "MetaPoolToken" // the *real* contract
      );
      const logic = await MetaPoolToken.deploy();
      await logic.deployed();
      const proxy = await MetaPoolTokenProxy.deploy(
        logic.address,
        proxyAdmin.address,
        tvlAggMock.address,
        addressRegistryMock.address,
        aggStalePeriod
      );
      await proxy.deployed();
      // Set the `mAPT` global to point to a deployed proxy with
      // the real logic, not the test one.
      mApt = await MetaPoolToken.attach(proxy.address);
    });

    after(async () => {
      // re-attach to test contract for other tests
      // Note: here the variables all refer to the global scope
      mApt = await MetaPoolToken.attach(proxy.address);
    });

    it("getTVL reverts on negative answer", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      const invalidPrice = -1;
      await tvlAggMock.mock.latestRoundData.returns(
        0,
        invalidPrice,
        0,
        updatedAt,
        0
      );

      await expect(mApt.getTVL()).to.be.revertedWith(
        "CHAINLINK_INVALID_ANSWER"
      );
    });

    it("getTVL reverts when update is too old", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      // setting the mock mines a block and advances time by 1 sec
      await tvlAggMock.mock.latestRoundData.returns(0, usdTvl, 0, updatedAt, 0);
      await ethers.provider.send("evm_increaseTime", [aggStalePeriod / 2]);
      await ethers.provider.send("evm_mine");
      await expect(mApt.getTVL()).to.not.be.reverted;

      await ethers.provider.send("evm_increaseTime", [aggStalePeriod / 2]);
      await ethers.provider.send("evm_mine");
      await expect(mApt.getTVL()).to.be.revertedWith("CHAINLINK_STALE_DATA");
    });

    it("Revert when calling `getTVL` and it's locked", async () => {
      const lockPeriod = 10;
      await mApt.lockTVL(lockPeriod);
      await expect(mApt.getTVL()).to.be.revertedWith("TVL_LOCKED");
    });

    it("Call `getTVL` succeeds after lock period", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      await tvlAggMock.mock.latestRoundData.returns(0, usdTvl, 0, updatedAt, 0);
      const lockPeriod = 2;
      // set tvlBlockEnd to 2 blocks ahead
      await mApt.lockTVL(lockPeriod);

      await timeMachine.advanceBlock();
      await expect(mApt.getTVL()).to.be.revertedWith("TVL_LOCKED");
      await timeMachine.advanceBlock();
      await expect(mApt.getTVL()).to.not.be.reverted;
    });

    it("Call `getTVL` succeeds after unlock", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      await tvlAggMock.mock.latestRoundData.returns(0, usdTvl, 0, updatedAt, 0);
      const lockPeriod = 100;
      await mApt.lockTVL(lockPeriod);

      await expect(mApt.getTVL()).to.be.revertedWith("TVL_LOCKED");

      await mApt.lockTVL(0);
      await expect(mApt.getTVL()).to.not.be.reverted;
    });
  });
});
