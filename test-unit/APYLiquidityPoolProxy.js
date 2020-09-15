const { ethers, artifacts, contract } = require("@nomiclabs/buidler");
const timeMachine = require("ganache-time-traveler");
const MockContract = artifacts.require("MockContract");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYLiquidityPoolProxy = artifacts.require("APYLiquidityPoolProxy");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementation"
);
const APYLiquidityPoolImplementationUpgraded = artifacts.require(
  "APYLiquidityPoolImplementationUpgraded"
);
const {
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");

contract("APYLiquidityPoolProxy Unit Test", async (accounts) => {
  const [owner, randomUser] = accounts;

  let proxyAdmin
  let logic
  let proxy

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    proxyAdmin = await ProxyAdmin.new({ from: owner })
    logic = await APYLiquidityPoolImplementation.new({ from: owner });
    proxy = await APYLiquidityPoolProxy.new(logic.address, proxyAdmin.address, { from: owner });

    instance = await APYLiquidityPoolImplementation.at(proxy.address);
  });

  describe("Test Defaults", async () => {
    it("Test Proxy's Admin", async () => {
      assert.equal(await proxyAdmin.owner.call(), owner)
    })

    it("Test Proxy's Implementation", async () => {
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, { from: owner }),
        logic.address
      )
    })
  })

  describe("Test Setters", async () => {
    it("Test Proxy Upgrade Implementation", async () => {
      const newLogic = await MockContract.new({ from: owner })
      await proxyAdmin.upgrade(proxy.address, newLogic.address, { from: owner })
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, { from: owner }),
        newLogic.address
      )
    })

    it("Test Proxy Upgrade Implementation fails", async () => {
      const newLogic = await MockContract.new({ from: owner })
      await expectRevert(
        proxyAdmin.upgrade(proxy.address, newLogic.address, { from: randomUser }),
        "Ownable: caller is not the owner"
      )
    })

    it("Test Proxy Upgrade Implementation and Initialize", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof instance.newlyAddedVariable, 'undefined')

      //prematurely point instance to upgraded implementation
      instance = await APYLiquidityPoolImplementationUpgraded.at(proxy.address);
      assert.equal(typeof instance.newlyAddedVariable, 'function')

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(instance.newlyAddedVariable.call())

      // create the new implementation and point the proxy to it
      const newLogic = await APYLiquidityPoolImplementationUpgraded.new({ from: owner });
      const iImplementation = new ethers.utils.Interface(APYLiquidityPoolImplementationUpgraded.abi);
      const initData = iImplementation.encodeFunctionData("initializeUpgrade", [])

      // set admin since only proxy admin can call 'initializeUpgrade'
      await instance.setAdminAddress(proxyAdmin.address)
      await proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData)

      const newVal = await instance.newlyAddedVariable.call()
      assert.equal(newVal, true)
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, { from: owner }),
        newLogic.address
      )
    })

    it("Test Proxy Upgrade Implementation and Initialize when not called by admin", async () => {
      const newLogic = await APYLiquidityPoolImplementation.new({ from: owner });
      const iImplementation = new ethers.utils.Interface(APYLiquidityPoolImplementationUpgraded.abi);
      const initData = iImplementation.encodeFunctionData("initializeUpgrade", [])
      //admin is not set
      await expectRevert(instance.initializeUpgrade({ from: owner }), "ADMIN_ONLY")
    })

    it("Test Proxy Upgrade Implementation and Initialize fails when not owner", async () => {
      const newLogic = await APYLiquidityPoolImplementation.new({ from: owner });
      const iImplementation = new ethers.utils.Interface(APYLiquidityPoolImplementationUpgraded.abi);
      const initData = iImplementation.encodeFunctionData("initializeUpgrade", [])
      await expectRevert(
        proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData, { from: randomUser }),
        "Ownable: caller is not the owner"
      )
    })
  })
})