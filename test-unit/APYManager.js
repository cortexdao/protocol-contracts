const { assert } = require("chai");
const { artifacts, contract, ethers, web3 } = require("hardhat");
const { expectRevert } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYManagerProxy = artifacts.require("APYManagerProxy");
const APYManager = artifacts.require("APYManager");
const IDetailedERC20 = new ethers.utils.Interface(
  artifacts.require("IDetailedERC20").abi
);
const MockContract = artifacts.require("MockContract");

contract("APYManager", async (accounts) => {
  const [deployer, admin, randomUser] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let manager;

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
    proxyAdmin = await ProxyAdmin.new({ from: deployer });
    logic = await APYManager.new({ from: deployer });
    proxy = await APYManagerProxy.new(logic.address, proxyAdmin.address, {
      from: deployer,
    });
    manager = await APYManager.at(proxy.address);
  });

  describe("Test Constructor", async () => {
    it("Revert when proxy admin is zero address", async () => {
      await expectRevert.unspecified(
        APYManagerProxy.new(logic.address, ZERO_ADDRESS, {
          from: deployer,
        })
      );
    });
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      assert.equal(await manager.owner(), deployer);
    });

    it("Revert when ETH is sent", async () => {
      await expectRevert(manager.send(10), "DONT_SEND_ETHER");
    });
  });

  describe("Setting admin address", async () => {
    it("Owner can set to valid address", async () => {
      await manager.setAdminAddress(randomUser, { from: deployer });
      assert.equal(await manager.proxyAdmin(), randomUser);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert.unspecified(
        manager.setAdminAddress(admin, { from: randomUser })
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert.unspecified(
        manager.setAdminAddress(ZERO_ADDRESS, { from: deployer })
      );
    });
  });

  describe("Asset allocation", async () => {
    describe.only("Temporary implementation for Chainlink", async () => {
      it("Set and get token addresses", async () => {
        assert.isEmpty(await manager.getTokenAddresses());

        const FAKE_ADDRESS_1 = web3.utils.toChecksumAddress(
          "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
        );
        const FAKE_ADDRESS_2 = web3.utils.toChecksumAddress(
          "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
        );
        const tokenAddresses = [FAKE_ADDRESS_1, FAKE_ADDRESS_2];
        await manager.setTokenAddresses(tokenAddresses);
        assert.deepEqual(await manager.getTokenAddresses(), tokenAddresses);
      });

      it("deleteTokenAddresses", async () => {
        const FAKE_ADDRESS_1 = web3.utils.toChecksumAddress(
          "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
        );
        const FAKE_ADDRESS_2 = web3.utils.toChecksumAddress(
          "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
        );
        const tokenAddresses = [FAKE_ADDRESS_1, FAKE_ADDRESS_2];
        await manager.setTokenAddresses(tokenAddresses);

        await manager.deleteTokenAddresses();
        assert.isEmpty(await manager.getTokenAddresses());
      });

      it("balanceOf", async () => {
        const mockToken = MockContract.new();
        const balanceOf = IDetailedERC20.encodeFunctionData("balanceOf", [
          ZERO_ADDRESS,
        ]);
        await mockToken.givenMethodReturnUint(balanceOf, 1);

        const balance = await manager.balanceOf(mockToken.address);
        console.log("balance:", balance);
      });

      it("symbolOf", async () => {
        //
      });

      it("foo", async () => {
        //
      });
    });
  });
});
