const { assert, expect } = require("chai");
const { artifacts, contract } = require("hardhat");
const MockContract = artifacts.require("MockContract");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const PoolTokenProxy = artifacts.require("PoolTokenProxy");
const PoolToken = artifacts.require("PoolToken");
const PoolTokenV2 = artifacts.require("PoolTokenV2");
const {
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");

contract("PoolTokenProxy Unit Test", async (accounts) => {
  const [owner] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let instance;

  let mockToken;
  let mockPriceAgg;

  before(async () => {
    mockToken = await MockContract.new();
    mockPriceAgg = await MockContract.new();
    proxyAdmin = await ProxyAdmin.new({ from: owner });
    logic = await PoolToken.new({ from: owner });
    proxy = await PoolTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      mockToken.address,
      mockPriceAgg.address,
      {
        from: owner,
      }
    );
    instance = await PoolToken.at(proxy.address);
  });

  describe("Default values", async () => {
    it("Deployer is set as ProxyAdmin's owner ", async () => {
      assert.equal(await proxyAdmin.owner.call(), owner);
    });

    it("Proxy logic is set correctly", async () => {
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, {
          from: owner,
        }),
        logic.address
      );
    });

    it("Proxy admin is set correctly", async () => {
      assert.equal(
        await proxyAdmin.getProxyAdmin(proxy.address),
        proxyAdmin.address
      );
    });
  });

  describe("Initialization", async () => {
    beforeEach(async () => {
      // reset variables
      proxy = await PoolTokenProxy.new(
        logic.address,
        proxyAdmin.address,
        mockToken.address,
        mockPriceAgg.address,
        {
          from: owner,
        }
      );
      instance = await PoolToken.at(proxy.address);
    });

    it("Cannot call `initialize` after deploy", async () => {
      await expect(
        instance.initialize(
          proxyAdmin.address,
          mockToken.address,
          mockPriceAgg.address
        )
      ).to.be.revertedWith("Contract instance has already been initialized");
    });

    it("`initializeUpgrade` reverts when called by non-admin", async () => {
      // deploy new implementation
      const newLogic = await PoolTokenV2.new({ from: owner });
      await proxyAdmin.upgrade(proxy.address, newLogic.address, {
        from: owner,
      });

      // point instance to upgraded implementation
      let instance = await PoolTokenV2.at(proxy.address);

      const mockAddressRegistry = await MockContract.new();

      await expectRevert(
        instance.initializeUpgrade(mockAddressRegistry.address, {
          from: owner,
        }),
        "PROXY_ADMIN_ONLY"
      );
    });
  });
});
