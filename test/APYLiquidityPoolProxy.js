const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { DUMMY_ADDRESS } = require("../utils/constants");
const timeMachine = require("ganache-time-traveler");

const APYLiquidityPoolProxy = artifacts.require("APYLiquidityPoolProxy");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementation"
);
const APT = artifacts.require("APT");
const MockContract = artifacts.require("MockContract");
const dai = ether;

contract("APYLiquidityPoolProxy", async (accounts) => {
  const [deployer, admin, wallet, other] = accounts;

  let apt;
  let pool;
  let poolImpl;
  let poolProxy;

  // we need to be careful to use EVM snapshots,
  // as we are messing with the proxy and so our
  // test failures can impact other test suites
  let snapshotId;

  // deploy pool contracts before each test
  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];

    poolImpl = await APYLiquidityPoolImplementation.new({ from: deployer });
    poolProxy = await APYLiquidityPoolProxy.new(poolImpl.address, admin, [], {
      from: deployer,
    });

    // trick Truffle into believing impl is at proxy address,
    // otherwise Truffle will give "no function" error
    pool = await APYLiquidityPoolImplementation.at(poolProxy.address);
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  describe("user gets right amount of APT from DAI deposit", async () => {
    beforeEach(async () => {
      apt = await APT.new({ from: deployer });
      pool.setAptAddress(apt.address, { from: deployer });
      apt.setPoolAddress(pool.address, { from: deployer });
    });

    it("addLiquidity creates APT for user", async () => {
      let balanceOf = await apt.balanceOf(wallet);
      expect(balanceOf).to.bignumber.equal("0");

      const daiDeposit = dai("1");
      await mockDaiTransfer(pool, daiDeposit);

      await pool.addLiquidity(daiDeposit, {
        from: wallet,
      });
      balanceOf = await apt.balanceOf(wallet);
      expect(balanceOf).to.bignumber.gt("0");
    });

    it("addLiquidity creates correctly calculated amount of APT", async () => {
      await mockDaiTransfer(pool, dai("10"));
      // use another account to call addLiquidity and create non-zero
      // token and DAI supplies in contract
      await pool.addLiquidity(dai("10"), {
        from: other,
      });

      // now we can check the expected mint amount based on the DAI ratio
      const daiDeposit = ether("2");
      const expectedMintAmount = await pool.calculateMintAmount(daiDeposit, {
        from: wallet,
      });

      await pool.addLiquidity(daiDeposit, { from: wallet });
      const mintAmount = await apt.balanceOf(wallet);
      expect(mintAmount).to.bignumber.equal(expectedMintAmount);
    });
  });

  describe("proxy delegates to implementation", async () => {
    it("owner is deployer", async () => {
      expect(await pool.owner()).to.equal(deployer);
    });

    it("owner can set APT address", async () => {
      try {
        await pool.setAptAddress(DUMMY_ADDRESS, { from: deployer });
      } catch {
        assert.fail("Cannot set APT address.");
      }
    });

    it("reverts if non-owner tries setting APT address", async () => {
      await expectRevert(
        pool.setAptAddress(DUMMY_ADDRESS, { from: other }),
        "Ownable: caller is not the owner"
      );
    });

    it("owner can set underlyer address", async () => {
      try {
        await pool.setUnderlyerAddress(DUMMY_ADDRESS, { from: deployer });
      } catch {
        assert.fail("Cannot set underlyer address.");
      }
    });

    it("reverts if non-owner tries setting underlyer address", async () => {
      await expectRevert(
        pool.setUnderlyerAddress(DUMMY_ADDRESS, { from: other }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("proxy has admin functionality", async () => {
    it("admin can call admin functions (non-upgrade)", async () => {
      expect(await poolProxy.admin.call({ from: admin })).to.equal(admin);
      expect(await poolProxy.implementation.call({ from: admin })).to.equal(
        poolImpl.address
      );
      expectEvent(
        await poolProxy.changeAdmin(DUMMY_ADDRESS, {
          from: admin,
        }),
        "AdminChanged"
      );
    });

    it("revert if non-admin calls admin functions (non-upgrade)", async () => {
      await expectRevert.unspecified(poolProxy.admin({ from: other }));
      await expectRevert.unspecified(poolProxy.implementation({ from: other }));
      await expectRevert.unspecified(
        poolProxy.changeAdmin(DUMMY_ADDRESS, { from: other })
      );
    });

    it("admin can upgrade pool impl", async () => {
      const newPoolImpl = await APYLiquidityPoolImplementation.new({
        from: deployer,
      });

      await poolProxy.upgradeTo(newPoolImpl.address, { from: admin });
      expect(await poolProxy.implementation.call({ from: admin })).to.equal(
        newPoolImpl.address
      );

      await poolProxy.upgradeTo(poolImpl.address, { from: admin });
      expect(await poolProxy.implementation.call({ from: admin })).to.equal(
        poolImpl.address
      );
    });

    it("revert if non-admin upgrades pool impl", async () => {
      const newPoolImpl = await APYLiquidityPoolImplementation.new({
        from: deployer,
      });

      await expectRevert.unspecified(
        poolProxy.upgradeTo(newPoolImpl.address, { from: other })
      );
    });
  });

  // test helper to mock ERC20 functions on underlyer token
  const mockDaiTransfer = async (liquidityPoolContract, amount) => {
    const mock = await MockContract.new();
    await liquidityPoolContract.setUnderlyerAddress(mock.address, {
      from: deployer,
    });
    const allowanceAbi = apt.contract.methods
      .allowance(ZERO_ADDRESS, ZERO_ADDRESS)
      .encodeABI();
    const transferFromAbi = apt.contract.methods
      .transferFrom(ZERO_ADDRESS, ZERO_ADDRESS, 0)
      .encodeABI();
    const transferAbi = apt.contract.methods
      .transfer(ZERO_ADDRESS, 0)
      .encodeABI();
    await mock.givenMethodReturnUint(allowanceAbi, amount);
    await mock.givenMethodReturnBool(transferAbi, true);
    await mock.givenMethodReturnBool(transferFromAbi, true);
  };
});
