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
const dai = ether;

const APYLiquidityPoolProxy = artifacts.require("APYLiquidityPoolProxy");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementation"
);
const APYLiquidityPoolImplTestProxy = artifacts.require(
  "APYLiquidityPoolImplTestProxy"
);
const MockContract = artifacts.require("MockContract");

contract("APYLiquidityPoolProxy", async (accounts) => {
  const [deployer, admin, wallet, other] = accounts;

  let poolImpl;
  let poolProxy;
  let pool;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  before(async () => {
    poolImpl = await APYLiquidityPoolImplementation.new({ from: deployer });
    poolProxy = await APYLiquidityPoolProxy.new(poolImpl.address, admin, {
      from: deployer,
    });

    // trick Truffle into believing impl is at proxy address,
    // otherwise Truffle will give "no function" error
    pool = await APYLiquidityPoolImplementation.at(poolProxy.address);
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  // FIXME: returns the following error:
  // "Error: Returned values aren't valid, did it run Out of Gas?"
  it.skip("proxy delegates to implementation", async () => {
    const poolImplMock = await MockContract.new({ from: deployer });
    const encodedUint = web3.eth.abi.encodeParameter("uint", "42");
    await poolImplMock.givenAnyReturnUint(encodedUint);

    const poolProxy = await APYLiquidityPoolProxy.new(
      poolImplMock.address,
      admin,
      {
        from: deployer,
      }
    );

    // trick Truffle into believing impl is at proxy address,
    // otherwise Truffle will give "no function" error
    const pool = await APYLiquidityPoolImplementation.at(poolProxy.address);
    await pool.balanceOf(ZERO_ADDRESS);
    expect(await pool.balanceOf(ZERO_ADDRESS)).to.equal("42");
  });

  /*
   * These tests mock out any interaction with the DAI token.
   * The idea is to test only the APT logic here and make
   * sure the pool proxy and impl are working together.
   *
   * There are tests in test-integration/test_liquidity_pool.js
   * that fully test this with DAI.
   *
   * NOTE:
   * These tests don't seem to work running on ganache
   * due to some weird bug with ganache + buidler + gnosis mock.
   */
  describe("pool can handle APT", async () => {
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
  const mockDaiTransfer = async (liquidityPool, allowance) => {
    const daiMock = await MockContract.new();
    const erc20 = liquidityPool;
    await liquidityPool.setUnderlyerAddress(daiMock.address, {
      from: deployer,
    });
    const allowanceAbi = erc20.contract.methods
      .allowance(ZERO_ADDRESS, ZERO_ADDRESS)
      .encodeABI();
    const transferFromAbi = erc20.contract.methods
      .transferFrom(ZERO_ADDRESS, ZERO_ADDRESS, 0)
      .encodeABI();
    const transferAbi = erc20.contract.methods
      .transfer(ZERO_ADDRESS, 0)
      .encodeABI();
    await daiMock.givenMethodReturnUint(allowanceAbi, allowance);
    await daiMock.givenMethodReturnBool(transferAbi, true);
    await daiMock.givenMethodReturnBool(transferFromAbi, true);
  };
});
