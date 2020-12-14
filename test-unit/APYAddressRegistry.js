const { assert } = require("chai");
const { artifacts, contract, web3 } = require("hardhat");
const { expectRevert } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYAddressRegistryProxy = artifacts.require("APYAddressRegistryProxy");
const APYAddressRegistry = artifacts.require("APYAddressRegistry");

contract("APYAddressRegistry", async (accounts) => {
  const [deployer, admin, randomUser] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let registry;

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
    logic = await APYAddressRegistry.new({ from: deployer });
    proxy = await APYAddressRegistryProxy.new(
      logic.address,
      proxyAdmin.address,
      {
        from: deployer,
      }
    );
    registry = await APYAddressRegistry.at(proxy.address);
  });

  describe("Constructor", async () => {
    it("Revert when proxy admin is zero address", async () => {
      await expectRevert.unspecified(
        APYAddressRegistryProxy.new(logic.address, ZERO_ADDRESS, {
          from: deployer,
        })
      );
    });
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      assert.equal(await registry.owner(), deployer);
    });

    it("Revert when ETH is sent", async () => {
      await expectRevert(registry.send(10), "DONT_SEND_ETHER");
    });
  });

  describe("Set admin address", async () => {
    it("Owner can set to valid address", async () => {
      await registry.setAdminAddress(randomUser, { from: deployer });
      assert.equal(await registry.proxyAdmin(), randomUser);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert.unspecified(
        registry.setAdminAddress(admin, { from: randomUser })
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert.unspecified(
        registry.setAdminAddress(ZERO_ADDRESS, { from: deployer })
      );
    });
  });

  describe("Register new address", async () => {
    const DUMMY_NAME = "dummyName";
    const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
      "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );

    it("Owner can register address", async () => {
      await registry.registerAddress(DUMMY_NAME, DUMMY_ADDRESS, {
        from: deployer,
      });
      assert.equal(await registry.getAddress(DUMMY_NAME), DUMMY_ADDRESS);
    });

    it("Revert when non-owner attempts to register", async () => {
      await expectRevert(
        registry.registerAddress(DUMMY_NAME, DUMMY_ADDRESS, {
          from: randomUser,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot register zero address", async () => {
      await expectRevert(
        registry.registerAddress(DUMMY_NAME, ZERO_ADDRESS, { from: deployer }),
        "Invalid address"
      );
    });
  });

  describe.only("Retrieve addresses", async () => {
    const DUMMY_NAME = "dummyName";
    const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
      "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const managerAddress = web3.utils.toChecksumAddress(
      "0x1AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const chainlinkRegistryAddress = web3.utils.toChecksumAddress(
      "0x2AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const daiPoolAddress = web3.utils.toChecksumAddress(
      "0x3AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const usdcPoolAddress = web3.utils.toChecksumAddress(
      "0x4AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const usdtPoolAddress = web3.utils.toChecksumAddress(
      "0x5AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    before("Prep addresses", async () => {
      await registry.registerAddress(DUMMY_NAME, DUMMY_ADDRESS);
      await registry.registerAddress("manager", managerAddress);
      await registry.registerAddress(
        "chainlinkRegistry",
        chainlinkRegistryAddress
      );
      await registry.registerAddress("daiPool", daiPoolAddress);
      await registry.registerAddress("usdcPool", usdcPoolAddress);
      await registry.registerAddress("usdtPool", usdtPoolAddress);
    });

    it("User can retrieve generic addresses", async () => {
      assert.equal(
        await registry.getAddress(DUMMY_NAME, { from: randomUser }),
        DUMMY_ADDRESS
      );
    });

    it("Revert when retrieving missing address", async () => {
      await expectRevert(
        registry.getAddress("notRegistered", {
          from: randomUser,
        }),
        "Missing address"
      );
    });

    it("User can retrieve manager", async () => {
      assert.equal(
        await registry.managerAddress({ from: randomUser }),
        managerAddress
      );
    });

    it("User can retrieve Chainlink registry", async () => {
      assert.equal(
        await registry.chainlinkRegistryAddress({ from: randomUser }),
        chainlinkRegistryAddress
      );
    });

    it("User can retrieve DAI pool", async () => {
      assert.equal(
        await registry.daiPoolAddress({ from: randomUser }),
        daiPoolAddress
      );
    });

    it("User can retrieve USDC pool", async () => {
      assert.equal(
        await registry.usdcPoolAddress({ from: randomUser }),
        usdcPoolAddress
      );
    });

    it("User can retrieve USDT pool", async () => {
      assert.equal(
        await registry.usdtPoolAddress({ from: randomUser }),
        usdtPoolAddress
      );
    });
  });
});
