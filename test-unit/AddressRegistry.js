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
const AddressRegistryV2 = artifacts.require("AddressRegistryV2");

const bytes32 = ethers.utils.formatBytes32String;

contract("AddressRegistry", async (accounts) => {
  const [deployer, randomUser] = accounts;

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
    const encodedArg = await (
      await ProxyConstructorArg.new()
    ).getEncodedArg(proxyAdmin.address);
    const proxy = await TransparentUpgradeableProxy.new(
      logic.address,
      proxyAdmin.address,
      encodedArg,
      {
        from: deployer,
      }
    );

    const logicV2 = await AddressRegistryV2.new({ from: deployer });
    await proxyAdmin.upgrade(proxy.address, logicV2.address, {
      from: deployer,
    });

    registry = await AddressRegistryV2.at(proxy.address);
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
    const lpAccountAddress = web3.utils.toChecksumAddress(
      "0x2AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const lpSafeAddress = web3.utils.toChecksumAddress(
      "0x3AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const adminSafeAddress = web3.utils.toChecksumAddress(
      "0x4AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const emergencySafeAddress = web3.utils.toChecksumAddress(
      "0x5AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const daiPoolAddress = web3.utils.toChecksumAddress(
      "0x6AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const usdcPoolAddress = web3.utils.toChecksumAddress(
      "0x7AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const usdtPoolAddress = web3.utils.toChecksumAddress(
      "0x8AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const oracleAdapterAddress = web3.utils.toChecksumAddress(
      "0x9AFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const mAptAddress = web3.utils.toChecksumAddress(
      "0x10FECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    const erc20AllocationAddress = web3.utils.toChecksumAddress(
      "0x10FECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
    );
    beforeEach("Prep addresses", async () => {
      const names = [
        DUMMY_NAME,
        bytes32("tvlManager"),
        bytes32("lpAccount"),
        bytes32("lpSafe"),
        bytes32("adminSafe"),
        bytes32("emergencySafe"),
        bytes32("daiPool"),
        bytes32("usdcPool"),
        bytes32("usdtPool"),
        bytes32("oracleAdapter"),
        bytes32("mApt"),
        bytes32("erc20Allocation"),
      ];
      const addresses = [
        DUMMY_ADDRESS,
        tvlManagerAddress,
        lpAccountAddress,
        lpSafeAddress,
        adminSafeAddress,
        emergencySafeAddress,
        daiPoolAddress,
        usdcPoolAddress,
        usdtPoolAddress,
        oracleAdapterAddress,
        mAptAddress,
        erc20AllocationAddress,
      ];
      await registry.registerMultipleAddresses(names, addresses);
    });

    it("ID list is populated", async () => {
      assert.deepEqual(await registry.getIds({ from: randomUser }), [
        DUMMY_NAME,
        bytes32("tvlManager"),
        bytes32("lpAccount"),
        bytes32("lpSafe"),
        bytes32("adminSafe"),
        bytes32("emergencySafe"),
        bytes32("daiPool"),
        bytes32("usdcPool"),
        bytes32("usdtPool"),
        bytes32("oracleAdapter"),
        bytes32("mApt"),
        bytes32("erc20Allocation"),
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

    it("User can retrieve Chainlink Registry", async () => {
      assert.equal(
        await registry.chainlinkRegistryAddress({ from: randomUser }),
        tvlManagerAddress
      );
    });

    it("User can retrieve DAI Pool", async () => {
      assert.equal(
        await registry.daiPoolAddress({ from: randomUser }),
        daiPoolAddress
      );
    });

    it("User can retrieve USDC Pool", async () => {
      assert.equal(
        await registry.usdcPoolAddress({ from: randomUser }),
        usdcPoolAddress
      );
    });

    it("User can retrieve USDT Pool", async () => {
      assert.equal(
        await registry.usdtPoolAddress({ from: randomUser }),
        usdtPoolAddress
      );
    });

    it("User can retrieve mAPT", async () => {
      assert.equal(
        await registry.mAptAddress({ from: randomUser }),
        mAptAddress
      );
    });

    it("User can retrieve LP account", async () => {
      assert.equal(
        await registry.lpAccountAddress({ from: randomUser }),
        lpAccountAddress
      );
    });

    it("User can retrieve LP Safe", async () => {
      assert.equal(
        await registry.lpSafeAddress({ from: randomUser }),
        lpSafeAddress
      );
    });

    it("User can retrieve Admin Safe", async () => {
      assert.equal(
        await registry.adminSafeAddress({ from: randomUser }),
        adminSafeAddress
      );
    });

    it("User can retrieve Emergency Safe", async () => {
      assert.equal(
        await registry.emergencySafeAddress({ from: randomUser }),
        emergencySafeAddress
      );
    });

    it("User can retrieve Oracle Adapter", async () => {
      assert.equal(
        await registry.oracleAdapterAddress({ from: randomUser }),
        oracleAdapterAddress
      );
    });

    it("User can retrieve ERC20 Allocation", async () => {
      assert.equal(
        await registry.erc20AllocationAddress({ from: randomUser }),
        erc20AllocationAddress
      );
    });

    it("User can retrieve Tvl Manager", async () => {
      assert.equal(
        await registry.tvlManagerAddress({ from: randomUser }),
        tvlManagerAddress
      );
    });
  });
});
