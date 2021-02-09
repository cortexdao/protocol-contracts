const { assert, expect } = require("chai");
const { artifacts, contract, web3 } = require("hardhat");
const { expectRevert, BN, ether } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const {
  erc20,
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
} = require("../utils/helpers");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYMetaPoolTokenProxy = artifacts.require("APYMetaPoolTokenProxy");
const APYMetaPoolToken = artifacts.require("TestAPYMetaPoolToken");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

const usdc = (amount) => erc20(amount, "6");
const dai = (amount) => erc20(amount, "18");

contract("APYMetaPoolToken", async (accounts) => {
  const [deployer, admin, manager, randomUser, anotherUser] = accounts;

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
    proxyAdmin = await ProxyAdmin.new({ from: deployer });
    logic = await APYMetaPoolToken.new({ from: deployer });
    const aggStalePeriod = 120;
    proxy = await APYMetaPoolTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      DUMMY_ADDRESS, // don't need a mock, since test contract can set TVL explicitly
      DUMMY_ADDRESS, // don't need a mock, since test contract can set ETH-USD price explicitly
      aggStalePeriod,
      {
        from: deployer,
      }
    );
    mApt = await APYMetaPoolToken.at(proxy.address);
  });

  describe("Constructor", async () => {
    it("Revert when logic is not a contract address", async () => {
      await expectRevert(
        APYMetaPoolTokenProxy.new(
          DUMMY_ADDRESS,
          proxyAdmin.address,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          120,
          {
            from: deployer,
          }
        ),
        "UpgradeableProxy: new implementation is not a contract"
      );
    });

    it("Revert when proxy admin is zero address", async () => {
      await expectRevert.unspecified(
        APYMetaPoolTokenProxy.new(
          logic.address,
          ZERO_ADDRESS,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          120,
          {
            from: deployer,
          }
        )
      );
    });

    it("Revert when TVL aggregator is zero address", async () => {
      await expectRevert.unspecified(
        APYMetaPoolTokenProxy.new(
          logic.address,
          DUMMY_ADDRESS,
          ZERO_ADDRESS,
          DUMMY_ADDRESS,
          120,
          {
            from: deployer,
          }
        )
      );
    });

    it("Revert when ETH-USD aggregator is zero address", async () => {
      await expectRevert.unspecified(
        APYMetaPoolTokenProxy.new(
          logic.address,
          DUMMY_ADDRESS,
          DUMMY_ADDRESS,
          ZERO_ADDRESS,
          120,
          {
            from: deployer,
          }
        )
      );
    });
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      assert.equal(await mApt.owner(), deployer);
    });

    it("Revert when ETH is sent", async () => {
      await expectRevert(mApt.send(10), "DONT_SEND_ETHER");
    });
  });

  describe("Set admin address", async () => {
    it("Owner can set to valid address", async () => {
      await mApt.setAdminAddress(randomUser, { from: deployer });
      assert.equal(await mApt.proxyAdmin(), randomUser);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert(
        mApt.setAdminAddress(admin, { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert(
        mApt.setAdminAddress(ZERO_ADDRESS, { from: deployer }),
        "INVALID_ADMIN"
      );
    });
  });

  describe("Set TVL aggregator address", async () => {
    it("Owner can set to valid address", async () => {
      await mApt.setTvlAggregator(DUMMY_ADDRESS, { from: deployer });
      assert.equal(await mApt.tvlAgg(), DUMMY_ADDRESS);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert(
        mApt.setTvlAggregator(DUMMY_ADDRESS, { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert(
        mApt.setTvlAggregator(ZERO_ADDRESS, { from: deployer }),
        "INVALID_AGG"
      );
    });
  });

  describe("Minting and burning", async () => {
    before(async () => {
      await mApt.setManagerAddress(manager, { from: deployer });
    });

    it("Manager can mint", async () => {
      const mintAmount = new BN("100");
      try {
        await mApt.mint(randomUser, mintAmount, { from: manager });
      } catch {
        assert.fail("Manager could not mint.");
      }

      expect(await mApt.balanceOf(randomUser)).to.bignumber.equal(mintAmount);
    });

    it("Manager can burn", async () => {
      const mintAmount = new BN("100");
      const burnAmount = new BN("90");
      await mApt.mint(randomUser, mintAmount, { from: manager });
      try {
        await mApt.burn(randomUser, burnAmount, { from: manager });
      } catch {
        assert.fail("Manager could not burn.");
      }

      expect(await mApt.balanceOf(randomUser)).to.bignumber.equal(
        mintAmount.sub(burnAmount)
      );
    });

    it("Revert when non-manager attempts to mint", async () => {
      await expectRevert(
        mApt.mint(anotherUser, new BN("1"), { from: randomUser }),
        "MANAGER_ONLY"
      );
      await expectRevert(
        mApt.mint(anotherUser, new BN("1"), { from: deployer }),
        "MANAGER_ONLY"
      );
    });

    it("Revert when non-manager attempts to burn", async () => {
      await expectRevert(
        mApt.burn(anotherUser, new BN("1"), { from: randomUser }),
        "MANAGER_ONLY"
      );
      await expectRevert(
        mApt.mint(anotherUser, new BN("1"), { from: deployer }),
        "MANAGER_ONLY"
      );
    });
  });

  describe("getDeployedEthValue", async () => {
    it("Return 0 if zero mAPT supply", async () => {
      expect(await mApt.totalSupply()).to.bignumber.equal("0");
      expect(await mApt.getDeployedEthValue(FAKE_ADDRESS)).to.bignumber.equal(
        "0"
      );
    });

    it("Return 0 if zero mAPT balance", async () => {
      await mApt.testMint(FAKE_ADDRESS, erc20(1000));
      expect(
        await mApt.getDeployedEthValue(ANOTHER_FAKE_ADDRESS)
      ).to.bignumber.equal("0");
    });

    it("Returns calculated value for non-zero mAPT balance", async () => {
      const tvl = ether("502300");
      const balance = erc20("1000");
      const anotherBalance = erc20("12345");
      const totalSupply = balance.add(anotherBalance);

      await mApt.setTVL(tvl);
      await mApt.testMint(FAKE_ADDRESS, balance);
      await mApt.testMint(ANOTHER_FAKE_ADDRESS, anotherBalance);

      const expectedEthValue = tvl.mul(balance).div(totalSupply);
      expect(await mApt.getDeployedEthValue(FAKE_ADDRESS)).to.bignumber.equal(
        expectedEthValue
      );
    });
  });

  describe("Calculations", async () => {
    it("Calculate mint amount with zero deployed TVL", async () => {
      const usdcEthPrice = new BN("1602950450000000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));

      await mApt.testMint(anotherUser, erc20(100));

      const mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.bignumber.equal(expectedMintAmount);
    });

    it("Calculate mint amount with zero total supply", async () => {
      const usdcEthPrice = new BN("1602950450000000");
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
      expect(mintAmount).to.be.bignumber.equal(expectedMintAmount);
    });

    it("Calculate mint amount with non-zero total supply", async () => {
      const usdcEthPrice = new BN("1602950450000000");
      let usdcAmount = usdc(107);
      let tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await mApt.setTVL(tvl);

      const totalSupply = erc20(21);
      await mApt.testMint(anotherUser, totalSupply);

      let mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.bignumber.equal(totalSupply);

      tvl = usdcEthPrice.mul(usdcAmount.muln(2)).div(usdc(1));
      await mApt.setTVL(tvl);
      const expectedMintAmount = totalSupply.divn(2);
      mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.bignumber.equal(expectedMintAmount);
    });

    it("Calculate pool amount with 1 pool", async () => {
      const usdcEthPrice = new BN("1602950450000000");
      const usdcAmount = usdc(107);
      const tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await mApt.setTVL(tvl);

      const totalSupply = erc20(21);
      await mApt.testMint(anotherUser, totalSupply);

      let poolAmount = await mApt.calculatePoolAmount(
        totalSupply,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.bignumber.equal(usdcAmount);

      const mAptAmount = erc20(5);
      const expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      const expectedPoolAmount = expectedPoolValue
        .mul(usdc(1))
        .div(usdcEthPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.bignumber.equal(expectedPoolAmount);
    });

    it("Calculate pool amount with 2 pools", async () => {
      const usdcEthPrice = new BN("1602950450000000");
      const daiEthPrice = new BN("1603100000000000");
      const usdcAmount = usdc(107);
      const daiAmount = dai(10);
      const usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      const daiValue = daiEthPrice.mul(daiAmount).div(dai(1));
      const tvl = usdcValue.add(daiValue);
      await mApt.setTVL(tvl);

      const totalSupply = erc20(21);
      let mAptAmount = erc20(10);
      let expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      let expectedPoolAmount = expectedPoolValue.mul(usdc(1)).div(usdcEthPrice);
      await mApt.testMint(anotherUser, totalSupply);
      let poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.bignumber.equal(expectedPoolAmount);

      mAptAmount = totalSupply.sub(mAptAmount);
      expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      expectedPoolAmount = expectedPoolValue.mul(dai(1)).div(daiEthPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        daiEthPrice,
        "18"
      );
      expect(poolAmount).to.be.bignumber.equal(expectedPoolAmount);
    });
  });
});
