const { ethers, artifacts, contract } = require("@nomiclabs/buidler");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYPoolTokenProxy = artifacts.require("APYPoolTokenProxy");
const APYPoolToken = artifacts.require("APYPoolToken");
const APYPoolTokenUpgraded = artifacts.require("APYPoolTokenUpgraded");
const {
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");

contract("APYPoolTokenProxy Unit Test", async (accounts) => {
  const [owner, randomUser] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;

  before(async () => {
    mockToken = await MockContract.new();
    mockPriceAgg = await MockContract.new();
    proxyAdmin = await ProxyAdmin.new({ from: owner });
    logic = await APYPoolToken.new({ from: owner });
    proxy = await APYPoolTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      mockToken.address,
      mockPriceAgg.address,
      {
        from: owner,
      }
    );
    instance = await APYPoolToken.at(proxy.address);
  });

  describe("Test Defaults", async () => {
    it("Test Proxy's Admin owner", async () => {
      assert.equal(await proxyAdmin.owner.call(), owner);
    });

    it("Test Proxy's Implementation", async () => {
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, {
          from: owner,
        }),
        logic.address
      );
    });

    it("Test Proxy's Admin", async () => {
      assert.equal(
        await proxyAdmin.getProxyAdmin(proxy.address),
        proxyAdmin.address
      );
    });
  });

  describe("Test Upgradability through proxyAdmin", async () => {
    beforeEach(async () => {
      // reset variables
      proxy = await APYPoolTokenProxy.new(logic.address, proxyAdmin.address, {
        from: owner,
      });
      instance = await APYPoolToken.at(proxy.address);
    });

    it("Test Proxy Upgrade Implementation fails when not called by owner", async () => {
      // deploy new implementation
      const newLogic = await APYPoolTokenUpgraded.new({ from: owner });
      await expectRevert(
        proxyAdmin.upgrade(proxy.address, newLogic.address, {
          from: randomUser,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Test Proxy Upgrade Implementation", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof instance.newlyAddedVariable, "undefined");

      //prematurely point instance to upgraded implementation
      instance = await APYPoolTokenUpgraded.at(proxy.address);
      assert.equal(typeof instance.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(instance.newlyAddedVariable.call());

      // create the new implementation and point the proxy to it
      const newLogic = await APYPoolTokenUpgraded.new({ from: owner });
      await instance.setAdminAddress(proxyAdmin.address);
      await proxyAdmin.upgrade(proxy.address, newLogic.address, {
        from: owner,
      });
      instance = await APYPoolTokenUpgraded.at(proxy.address);

      const newVal = await instance.newlyAddedVariable.call();
      assert.equal(newVal, false);
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, {
          from: owner,
        }),
        newLogic.address
      );
    });

    it("Test Proxy Upgrade Implementation and Initialize when not called by admin", async () => {
      // deploy new implementation
      const newLogic = await APYPoolTokenUpgraded.new({ from: owner });
      await proxyAdmin.upgrade(proxy.address, newLogic.address, {
        from: owner,
      });

      // point instance to upgraded implementation
      instance = await APYPoolTokenUpgraded.at(proxy.address);

      await expectRevert(
        instance.initializeUpgrade({ from: owner }),
        "ADMIN_ONLY"
      );
    });

    it("Test Proxy Upgrade Implementation and Initialize fails when not owner", async () => {
      // deploy new implementation
      const newLogic = await APYPoolTokenUpgraded.new({ from: owner });
      // construct init data
      const iImplementation = new ethers.utils.Interface(
        APYPoolTokenUpgraded.abi
      );
      const initData = iImplementation.encodeFunctionData(
        "initializeUpgrade",
        []
      );

      await expectRevert(
        proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData, {
          from: randomUser,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Test Proxy Upgrade Implementation and Initialize", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof instance.newlyAddedVariable, "undefined");

      //prematurely point instance to upgraded implementation
      instance = await APYPoolTokenUpgraded.at(proxy.address);
      assert.equal(typeof instance.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(instance.newlyAddedVariable.call());

      // create the new implementation and point the proxy to it
      const newLogic = await APYPoolTokenUpgraded.new({ from: owner });
      const iImplementation = new ethers.utils.Interface(
        APYPoolTokenUpgraded.abi
      );
      const initData = iImplementation.encodeFunctionData(
        "initializeUpgrade",
        []
      );

      // set admin since only proxy admin can call 'initializeUpgrade'
      await instance.setAdminAddress(proxyAdmin.address);
      await proxyAdmin.upgradeAndCall(
        proxy.address,
        newLogic.address,
        initData,
        { from: owner }
      );

      const newVal = await instance.newlyAddedVariable.call();
      assert.equal(newVal, true);
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, {
          from: owner,
        }),
        newLogic.address
      );
    });
  });
});
