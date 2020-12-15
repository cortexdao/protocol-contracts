const { assert, expect } = require("chai");
const { artifacts, contract, web3 } = require("hardhat");
const { expectRevert, BN } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYCapitalTokenProxy = artifacts.require("APYCapitalTokenProxy");
const APYCapitalToken = artifacts.require("APYCapitalToken");
const MockContract = artifacts.require("MockContract");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

contract("APYCapitalToken", async (accounts) => {
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
    logic = await APYCapitalToken.new({ from: deployer });
    mockTvlAgg = await MockContract.new();
    proxy = await APYCapitalTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      mockTvlAgg.address,
      {
        from: deployer,
      }
    );
    token = await APYCapitalToken.at(proxy.address);
  });

  describe("Constructor", async () => {
    it("Revert when proxy admin is zero address", async () => {
      await expectRevert.unspecified(
        APYCapitalTokenProxy.new(logic.address, ZERO_ADDRESS, {
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
        token.mint(anotherUser, new BN("1"), { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });
});
