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
const APYLiquidityPoolImplTestProxy = artifacts.require(
  "APYLiquidityPoolImplTestProxy"
);
const MockContract = artifacts.require("MockContract");
const dai = ether;

contract("APYLiquidityPoolProxy", async (accounts) => {
  const [deployer, admin, wallet, other] = accounts;

  let pool;
  let poolImpl;
  let poolProxy;

  // use EVM snapshots for test isolation
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

  describe("proxy delegates to implementation", async () => {
    it("owner is deployer", async () => {
      expect(await pool.owner()).to.equal(deployer);
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

  /*
   * These tests are very similar to the one in `integration/test_liquidity_pool`
   * but mock out any interaction with the DAI token.  The idea is to test
   * only the APT interaction here.
   */
  describe("user gets right amount of APT from DAI deposit", async () => {
    it("addLiquidity creates APT for user", async () => {
      let balanceOf = await pool.balanceOf(wallet);
      expect(balanceOf).to.bignumber.equal("0");

      const daiDeposit = dai("1");
      await mockDaiTransfer(pool, daiDeposit);

      await pool.addLiquidity(daiDeposit, {
        from: wallet,
      });
      balanceOf = await pool.balanceOf(wallet);
      expect(balanceOf).to.bignumber.gt("0");
    });

    it("addLiquidity creates correctly calculated amount of APT", async () => {
      // mock out DAI token in pool with high allowance
      await mockDaiTransfer(pool, dai("1000000000"));

      // use another account to call addLiquidity and create non-zero
      // token and DAI supplies in contract
      const initialDaiDeposit = dai("8.26");
      await pool.addLiquidity(initialDaiDeposit, {
        from: other,
      });

      // check seed deposit created the right amount of APT
      const initialMintAmount = await pool.balanceOf(other);
      const DEFAULT_APT_TO_UNDERLYER_FACTOR = await pool.DEFAULT_APT_TO_UNDERLYER_FACTOR();
      expect(initialMintAmount).to.bignumber.equal(
        initialDaiDeposit.mul(DEFAULT_APT_TO_UNDERLYER_FACTOR)
      );

      // now we can check the expected mint amount based on the DAI ratio
      let daiDeposit = dai("210.6");
      let expectedMintAmount = await pool.calculateMintAmount(daiDeposit, {
        from: wallet,
      });

      await pool.addLiquidity(daiDeposit, { from: wallet });
      const initialAptBalance = await pool.balanceOf(wallet);
      expect(initialAptBalance).to.bignumber.equal(expectedMintAmount);

      daiDeposit = dai("3.899");
      expectedMintAmount = await pool.calculateMintAmount(daiDeposit, {
        from: wallet,
      });

      await pool.addLiquidity(daiDeposit, { from: wallet });
      const aptBalance = await pool.balanceOf(wallet);
      expect(aptBalance.sub(initialAptBalance)).to.bignumber.equal(
        expectedMintAmount
      );
    });
  });

  // test helper to mock ERC20 functions on underlyer token
  const mockDaiTransfer = async (liquidityPoolContract, allowance) => {
    const mock = await MockContract.new();
    await liquidityPoolContract.setUnderlyerAddress(mock.address, {
      from: deployer,
    });
    const allowanceAbi = pool.contract.methods
      .allowance(ZERO_ADDRESS, ZERO_ADDRESS)
      .encodeABI();
    const transferFromAbi = pool.contract.methods
      .transferFrom(ZERO_ADDRESS, ZERO_ADDRESS, 0)
      .encodeABI();
    const transferAbi = pool.contract.methods
      .transfer(ZERO_ADDRESS, 0)
      .encodeABI();
    await mock.givenMethodReturnUint(allowanceAbi, allowance);
    await mock.givenMethodReturnBool(transferAbi, true);
    await mock.givenMethodReturnBool(transferFromAbi, true);
  };
});
