const { assert, expect } = require("chai");
const { artifacts, contract, ethers, web3 } = require("hardhat");
const { expectRevert, BN } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { defaultAbiCoder } = ethers.utils;
const { erc20 } = require("../utils/helpers");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYMetaPoolTokenProxy = artifacts.require("APYMetaPoolTokenProxy");
const APYMetaPoolToken = artifacts.require("APYMetaPoolToken");
const MockContract = artifacts.require("MockContract");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

contract("APYMetaPoolToken", async (accounts) => {
  const [deployer, admin, randomUser, anotherUser] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let mockTvlAgg;
  let token;

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
    mockTvlAgg = await MockContract.new();
    proxy = await APYMetaPoolTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      mockTvlAgg.address,
      {
        from: deployer,
      }
    );
    token = await APYMetaPoolToken.at(proxy.address);
  });

  describe("Constructor", async () => {
    it("Revert when logic is not a contract address", async () => {
      await expectRevert(
        APYMetaPoolTokenProxy.new(
          DUMMY_ADDRESS,
          proxyAdmin.address,
          DUMMY_ADDRESS,
          {
            from: deployer,
          }
        ),
        "UpgradeableProxy: new implementation is not a contract"
      );
    });

    it("Revert when proxy admin is zero address", async () => {
      await expectRevert.unspecified(
        APYMetaPoolTokenProxy.new(logic.address, ZERO_ADDRESS, DUMMY_ADDRESS, {
          from: deployer,
        })
      );
    });

    it("Revert when TVL aggregator is zero address", async () => {
      await expectRevert.unspecified(
        APYMetaPoolTokenProxy.new(logic.address, DUMMY_ADDRESS, ZERO_ADDRESS, {
          from: deployer,
        })
      );
    });
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      assert.equal(await token.owner(), deployer);
    });

    it("Revert when ETH is sent", async () => {
      await expectRevert(token.send(10), "DONT_SEND_ETHER");
    });
  });

  describe("Set admin address", async () => {
    it("Owner can set to valid address", async () => {
      await token.setAdminAddress(randomUser, { from: deployer });
      assert.equal(await token.proxyAdmin(), randomUser);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert(
        token.setAdminAddress(admin, { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert(
        token.setAdminAddress(ZERO_ADDRESS, { from: deployer }),
        "INVALID_ADMIN"
      );
    });
  });

  describe("Set TVL aggregator address", async () => {
    it("Owner can set to valid address", async () => {
      await token.setTvlAggregator(DUMMY_ADDRESS, { from: deployer });
      assert.equal(await token.tvlAgg(), DUMMY_ADDRESS);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert(
        token.setTvlAggregator(DUMMY_ADDRESS, { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert(
        token.setTvlAggregator(ZERO_ADDRESS, { from: deployer }),
        "INVALID_AGG"
      );
    });
  });

  describe("Minting and burning", async () => {
    it("Owner can mint", async () => {
      const mintAmount = new BN("100");
      try {
        await token.mint(randomUser, mintAmount, { from: deployer });
      } catch {
        assert.fail("Deployer could not mint.");
      }

      expect(await token.balanceOf(randomUser)).to.bignumber.equal(mintAmount);
    });

    it("Owner can burn", async () => {
      const mintAmount = new BN("100");
      const burnAmount = new BN("90");
      await token.mint(randomUser, mintAmount, { from: deployer });
      try {
        await token.burn(randomUser, burnAmount, { from: deployer });
      } catch {
        assert.fail("Deployer could not burn.");
      }

      expect(await token.balanceOf(randomUser)).to.bignumber.equal(
        mintAmount.sub(burnAmount)
      );
    });

    it("Revert when non-owner attempts to mint", async () => {
      await expectRevert(
        token.mint(anotherUser, new BN("1"), { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });

    it("Revert when non-owner attempts to burn", async () => {
      await expectRevert(
        token.burn(anotherUser, new BN("1"), { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Calculations", async () => {
    it("Check mock TVL aggregator setup", async () => {
      const tvl = 100;
      const returnData = defaultAbiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, tvl, 0, 0, 0]
      );
      await mockTvlAgg.givenAnyReturn(returnData);

      assert.equal(await token.getTVL(), tvl);
    });

    it("Calculate mint amount", async () => {
      const tvl = 100;
      const returnData = defaultAbiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, tvl, 0, 0, 0]
      );
      await mockTvlAgg.givenAnyReturn(returnData);

      const depositAmount = erc20(100);
      const tokenEthPrice = new BN("1602950450000000");
      const decimals = new BN("18");
      const mintAmount = await token.calculateMintAmount(
        depositAmount,
        tokenEthPrice,
        decimals
      );
      expect(mintAmount).to.be.bignumber.gt("0");
    });

    it("Calculate pool amount", async () => {
      const tvl = 100;
      const returnData = defaultAbiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, tvl, 0, 0, 0]
      );
      await mockTvlAgg.givenAnyReturn(returnData);

      const depositAmount = erc20(100);
      const tokenEthPrice = new BN("1602950450000000");
      const decimals = new BN("18");
      const mintAmount = await token.calculateMintAmount(
        depositAmount,
        tokenEthPrice,
        decimals
      );
      expect(mintAmount).to.be.bignumber.gt("0");
    });

    it("test 1", async () => {
      //
    });

    it("test 1", async () => {
      //
    });
  });
});
