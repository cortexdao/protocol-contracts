const { assert, expect } = require("chai");
const { artifacts, contract, web3 } = require("hardhat");
const { expectRevert, BN } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { erc20 } = require("../utils/helpers");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYMetaPoolTokenProxy = artifacts.require("APYMetaPoolTokenProxy");
const APYMetaPoolToken = artifacts.require("TestAPYMetaPoolToken");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

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
    proxy = await APYMetaPoolTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      DUMMY_ADDRESS, // don't need a mock, since test contract can set TVL explicitly
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

  describe.only("Calculations", async () => {
    // it("Check mock TVL setup", async () => {
    //   const tvl = 100;
    //   await mApt.setTVL(tvl);
    //   assert.equal(await mApt.getTVL(), tvl);
    // });

    it("Calculate mint amount", async () => {
      const tvl = 100;
      await mApt.setTVL(tvl);

      const depositAmount = erc20(100);
      const tokenEthPrice = new BN("1602950450000000");
      const decimals = new BN("18");
      const mintAmount = await mApt.calculateMintAmount(
        depositAmount,
        tokenEthPrice,
        decimals
      );
      expect(mintAmount).to.be.bignumber.gt("0");
    });

    it("Calculate pool amount", async () => {
      const tvl = 100;
      await mApt.setTVL(tvl);

      const depositAmount = erc20(100);
      const tokenEthPrice = new BN("1602950450000000");
      const decimals = new BN("18");
      const mintAmount = await mApt.calculateMintAmount(
        depositAmount,
        tokenEthPrice,
        decimals
      );
      expect(mintAmount).to.be.bignumber.gt("0");
    });
  });
});
