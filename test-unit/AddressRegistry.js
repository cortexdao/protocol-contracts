const { assert, expect } = require("chai");
const { artifacts, contract, ethers, web3 } = require("hardhat");
const { expectRevert } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const TransparentUpgradeableProxy = artifacts.require(
  "TransparentUpgradeableProxy"
);
const ProxyConstructorArg = artifacts.require("ProxyConstructorArg");
const AddressRegistry = artifacts.require("AddressRegistry");
const IAddressRegistry = artifacts.require("IAddressRegistry");

const bytes32 = ethers.utils.formatBytes32String;

contract("AddressRegistry", async (accounts) => {
  const [deployer, admin, randomUser] = accounts;

  let proxyAdmin;
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
    const logic = await AddressRegistry.new({ from: deployer });
    const encodedArg = await (await ProxyConstructorArg.new()).getEncodedArg(
      proxyAdmin.address
    );
    const proxy = await TransparentUpgradeableProxy.new(
      logic.address,
      proxyAdmin.address,
      encodedArg,
      {
        from: deployer,
      }
    );

    const logicV2 = await IAddressRegistry.new({ from: deployer });
    await proxyAdmin.upgrade(proxy.address, logicV2.address, {
      from: deployer,
    });

    registry = await IAddressRegistry.at(proxy.address);
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      assert.equal(await registry.owner(), deployer);
    });

    it("Admin is set to proxy admin", async () => {
      assert.equal(await registry.proxyAdmin(), proxyAdmin.address);
    });

    it("Revert when ETH is sent", async () => {
      await expectRevert.unspecified(registry.send(10));
    });
  });

  describe("Set admin address", async () => {
    it("Owner can set to valid address", async () => {
      await registry.setAdminAddress(randomUser, { from: deployer });
      assert.equal(await registry.proxyAdmin(), randomUser);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert(
        registry.setAdminAddress(admin, { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert(
        registry.setAdminAddress(ZERO_ADDRESS, { from: deployer }),
        "INVALID_ADMIN"
      );
    });
  });

  describe("Register addresses", async () => {
    const DUMMY_NAME = bytes32("dummyName");
    const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
      "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const ANOTHER_NAME = bytes32("anotherName");
    const ANOTHER_ADDRESS = web3.utils.toChecksumAddress(
      "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
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

    it("Owner can register multiple addresses", async () => {
      await registry.registerMultipleAddresses(
        [DUMMY_NAME, ANOTHER_NAME],
        [DUMMY_ADDRESS, ANOTHER_ADDRESS],
        {
          from: deployer,
        }
      );
      assert.equal(await registry.getAddress(DUMMY_NAME), DUMMY_ADDRESS);
      assert.equal(await registry.getAddress(ANOTHER_NAME), ANOTHER_ADDRESS);
    });

    it("Revert when non-owner attempts to register multiple addresses", async () => {
      await expectRevert(
        registry.registerMultipleAddresses(
          [DUMMY_NAME, ANOTHER_NAME],
          [DUMMY_ADDRESS, ANOTHER_ADDRESS],
          {
            from: randomUser,
          }
        ),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot register zero address in multiple registration", async () => {
      await expectRevert(
        registry.registerMultipleAddresses(
          [DUMMY_NAME, ANOTHER_NAME],
          [DUMMY_ADDRESS, ZERO_ADDRESS],
          {
            from: deployer,
          }
        ),
        "Invalid address"
      );
    });
  });

  describe("Delete addresses", async () => {
    const DUMMY_NAME = bytes32("dummyName");
    const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
      "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const ANOTHER_NAME = bytes32("anotherName");
    const ANOTHER_ADDRESS = web3.utils.toChecksumAddress(
      "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
    );

    beforeEach(async () => {
      await registry.registerMultipleAddresses(
        [DUMMY_NAME, ANOTHER_NAME],
        [DUMMY_ADDRESS, ANOTHER_ADDRESS],
        {
          from: deployer,
        }
      );
    });

    it("Owner can delete address", async () => {
      await registry.deleteAddress(DUMMY_NAME, {
        from: deployer,
      });
      await expect(registry.getAddress(DUMMY_NAME)).to.be.revertedWith(
        "Missing address"
      );
      expect(await registry.getIds()).to.have.lengthOf(1);

      await registry.deleteAddress(ANOTHER_NAME, {
        from: deployer,
      });
      await expect(registry.getAddress(ANOTHER_NAME)).to.be.revertedWith(
        "Missing address"
      );
      expect(await registry.getIds()).to.have.lengthOf(0);
    });

    it("Revert when non-owner attempts to delete", async () => {
      await expectRevert(
        registry.deleteAddress(DUMMY_NAME, {
          from: randomUser,
        }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Retrieve addresses", async () => {
    const DUMMY_NAME = bytes32("dummyName");
    const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
      "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const tvlManagerAddress = web3.utils.toChecksumAddress(
      "0x1AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const poolManagerAddress = web3.utils.toChecksumAddress(
      "0x2AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const accountManagerAddress = web3.utils.toChecksumAddress(
      "0x3AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const daiPoolAddress = web3.utils.toChecksumAddress(
      "0x5AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const usdcPoolAddress = web3.utils.toChecksumAddress(
      "0x5AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const usdtPoolAddress = web3.utils.toChecksumAddress(
      "0x5AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    beforeEach("Prep addresses", async () => {
      const names = [
        DUMMY_NAME,
        bytes32("tvlManager"),
        bytes32("poolManager"),
        bytes32("accountManager"),
        bytes32("daiPool"),
        bytes32("usdcPool"),
        bytes32("usdtPool"),
      ];
      const addresses = [
        DUMMY_ADDRESS,
        tvlManagerAddress,
        poolManagerAddress,
        accountManagerAddress,
        daiPoolAddress,
        usdcPoolAddress,
        usdtPoolAddress,
      ];
      await registry.registerMultipleAddresses(names, addresses);
    });

    it("ID list is populated", async () => {
      assert.deepEqual(await registry.getIds({ from: randomUser }), [
        DUMMY_NAME,
        bytes32("tvlManager"),
        bytes32("poolManager"),
        bytes32("accountManager"),
        bytes32("daiPool"),
        bytes32("usdcPool"),
        bytes32("usdtPool"),
      ]);
    });

    it("User can retrieve generic addresses", async () => {
      assert.equal(
        await registry.getAddress(DUMMY_NAME, { from: randomUser }),
        DUMMY_ADDRESS
      );
    });

    it("Revert when retrieving missing address", async () => {
      await expectRevert(
        registry.getAddress(bytes32("notRegistered"), {
          from: randomUser,
        }),
        "Missing address"
      );
    });

    it("User can retrieve tvl manager", async () => {
      assert.equal(
        await registry.tvlManagerAddress({ from: randomUser }),
        tvlManagerAddress
      );
    });

    it("User can retrieve pool manager", async () => {
      assert.equal(
        await registry.poolManagerAddress({ from: randomUser }),
        poolManagerAddress
      );
    });

    it("User can retrieve account manager", async () => {
      assert.equal(
        await registry.accountManagerAddress({ from: randomUser }),
        accountManagerAddress
      );
    });

    it("User can retrieve Chainlink registry", async () => {
      assert.equal(
        await registry.chainlinkRegistryAddress({ from: randomUser }),
        tvlManagerAddress
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
