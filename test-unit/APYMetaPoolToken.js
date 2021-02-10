const { expect, assert } = require("chai");
const { ethers, web3 } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const {
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  tokenAmountToBigNumber,
} = require("../utils/helpers");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

const usdc = (amount) => tokenAmountToBigNumber(amount, "6");
const dai = (amount) => tokenAmountToBigNumber(amount, "18");
const ether = (amount) => tokenAmountToBigNumber(amount, "18");

describe.only("Contract: APYMetaPoolToken", () => {
  // signers
  let deployer;
  let admin;
  let manager;
  let randomUser;
  let anotherUser;

  // contract factories
  let ProxyAdmin;
  let APYMetaPoolTokenProxy;
  let APYMetaPoolToken;

  // deployed contracts
  let proxyAdmin;
  let logic;
  let proxy;
  let mApt;

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
      admin,
      manager,
      randomUser,
      anotherUser,
    ] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYMetaPoolTokenProxy = await ethers.getContractFactory(
      "APYMetaPoolTokenProxy"
    );
    APYMetaPoolToken = await ethers.getContractFactory("TestAPYMetaPoolToken");

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await APYMetaPoolToken.deploy();
    await logic.deployed();
    const aggStalePeriod = 120;
    proxy = await APYMetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      DUMMY_ADDRESS, // don't need a mock; test contract can set TVL explicitly
      DUMMY_ADDRESS, // don't need a mock; test contract can set ETH-USD price explicitly
      aggStalePeriod
    );
    await proxy.deployed();
    mApt = await APYMetaPoolToken.attach(proxy.address);
  });

  describe("Constructor", async () => {
    it("Revert when logic is not a contract address", async () => {
      await expect(
        APYMetaPoolTokenProxy.connect(deployer).deploy(
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
        APYMetaPoolTokenProxy.connect(deployer).deploy(
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
        APYMetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          DUMMY_ADDRESS,
          ZERO_ADDRESS,
          DUMMY_ADDRESS,
          120
        )
      ).to.be.reverted;
    });

    it("Revert when ETH-USD aggregator is zero address", async () => {
      await expect(
        APYMetaPoolTokenProxy.connect(deployer).deploy(
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
        APYMetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          0
        )
      ).to.be.reverted;
    });
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      expect(await mApt.owner()).to.equal(deployer.address);
    });

    it("Revert when ETH is sent", async () => {
      await expect(
        deployer.sendTransaction({ to: mApt.address, value: "10" })
      ).to.be.revertedWith("DONT_SEND_ETHER");
    });

    it("more defaults", async () => {
      // TODO:
      // add more tests here to check defaults, such as agg addresses and stale period
      assert.fail("Write the tests");
    });
  });

  describe("Set admin address", async () => {
    it("Owner can set to valid address", async () => {
      await mApt.connect(deployer).setAdminAddress(randomUser.address);
      expect(await mApt.proxyAdmin()).to.equal(randomUser.address);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expect(
        mApt.connect(randomUser).setAdminAddress(admin.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        mApt.connect(deployer).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("Set TVL aggregator address", async () => {
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

  describe("Set ETH-USD aggregator address", async () => {
    it("Owner can set to valid address", async () => {
      await mApt.connect(deployer).setEthUsdAggregator(DUMMY_ADDRESS);
      expect(await mApt.ethUsdAgg()).to.equal(DUMMY_ADDRESS);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expect(
        mApt.connect(randomUser).setEthUsdAggregator(DUMMY_ADDRESS)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        mApt.connect(deployer).setEthUsdAggregator(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_AGG");
    });
  });

  describe("Set aggregator staleness period", async () => {
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

  describe("Minting and burning", async () => {
    before(async () => {
      await mApt.connect(deployer).setManagerAddress(manager.address);
    });

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
  });

  describe("getDeployedEthValue", async () => {
    it("Return 0 if zero mAPT supply", async () => {
      expect(await mApt.totalSupply()).to.equal("0");
      expect(await mApt.getDeployedEthValue(FAKE_ADDRESS)).to.equal("0");
    });

    it("Return 0 if zero mAPT balance", async () => {
      await mApt.testMint(FAKE_ADDRESS, tokenAmountToBigNumber(1000));
      expect(await mApt.getDeployedEthValue(ANOTHER_FAKE_ADDRESS)).to.equal(0);
    });

    it("Returns calculated value for non-zero mAPT balance", async () => {
      const tvl = ether("502300");
      const balance = tokenAmountToBigNumber("1000");
      const anotherBalance = tokenAmountToBigNumber("12345");
      const totalSupply = balance.add(anotherBalance);

      await mApt.setTVL(tvl);
      await mApt.testMint(FAKE_ADDRESS, balance);
      await mApt.testMint(ANOTHER_FAKE_ADDRESS, anotherBalance);

      const expectedEthValue = tvl.mul(balance).div(totalSupply);
      expect(await mApt.getDeployedEthValue(FAKE_ADDRESS)).to.equal(
        expectedEthValue
      );
    });
  });

  describe("Calculations", async () => {
    it("Calculate mint amount with zero deployed TVL", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));

      await mApt.testMint(anotherUser.address, tokenAmountToBigNumber(100));

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
      await mApt.testMint(anotherUser.address, totalSupply);

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
      await mApt.testMint(anotherUser.address, totalSupply);

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
      await mApt.testMint(anotherUser.address, totalSupply);
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

  describe("getTVL", () => {
    before(async () => {
      // deploy mock aggs
      // setup mock aggs
      const ethUsdPrice = tokenAmountToBigNumber("176767026385");
      const decimals = 8;
    });

    it("getEthUsdPrice", async () => {});

    it("getTvlData", async () => {});

    it("Convert TVL from USD to ETH", async () => {});
  });
});
