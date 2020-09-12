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
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const dai = ether;

const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplTestProxy"
);
const MockContract = artifacts.require("MockContract");

contract("APYLiquidityPoolImplementation", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let pool;

  let DEFAULT_APT_TO_UNDERLYER_FACTOR;

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
    pool = await APYLiquidityPoolImplementation.new({ from: deployer });
    await pool.initialize({ from: deployer });

    DEFAULT_APT_TO_UNDERLYER_FACTOR = await pool.DEFAULT_APT_TO_UNDERLYER_FACTOR();
  });

  it("addLiquidity reverts if 0 DAI sent", async () => {
    await expectRevert(
      pool.addLiquidity(0, { from: wallet, value: "0" }),
      "Pool/insufficient-value"
    );
  });

  it("mint amount to supply equals DAI deposit to total DAI balance", async () => {
    const daiDeposit = dai("112");
    const totalBalance = dai("1000000");
    // set total supply to total Dai balance
    await pool.internalMint(pool.address, totalBalance);
    // set tolerance to compensate for fixed-point arithmetic
    const tolerance = new BN("50000");

    let mintAmount = await pool.internalCalculateMintAmount(
      daiDeposit,
      totalBalance,
      { from: wallet }
    );
    let expectedAmount = daiDeposit;
    expect(mintAmount.sub(expectedAmount).abs()).to.bignumber.lte(
      tolerance,
      "mint amount should differ from expected amount by at most tolerance"
    );

    await pool.internalBurn(pool.address, totalBalance.divn(2));

    mintAmount = await pool.internalCalculateMintAmount(
      daiDeposit,
      totalBalance,
      { from: wallet }
    );
    expectedAmount = daiDeposit.divn(2);
    expect(mintAmount.sub(expectedAmount).abs()).to.bignumber.lte(
      tolerance,
      "mint amount should differ from expected amount by at most tolerance"
    );
  });

  it("mint amount is constant multiple of deposit if total Dai balance is zero", async () => {
    // set non-zero total supply
    await pool.internalMint(pool.address, dai("100"));

    const daiDeposit = dai("7.3");
    const mintAmount = await pool.internalCalculateMintAmount(daiDeposit, 0, {
      from: wallet,
    });
    expect(mintAmount).to.bignumber.equal(
      daiDeposit.mul(DEFAULT_APT_TO_UNDERLYER_FACTOR)
    );
  });

  it("mint amount is constant multiple of deposit if total supply is zero ", async () => {
    const daiDeposit = dai("5");
    const totalBalance = dai("100");
    const mintAmount = await pool.internalCalculateMintAmount(
      daiDeposit,
      totalBalance,
      { from: wallet }
    );
    expect(mintAmount).to.bignumber.equal(
      daiDeposit.mul(DEFAULT_APT_TO_UNDERLYER_FACTOR)
    );
  });

  it("addLiquidity will create APT for sender", async () => {
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
    await mockDaiTransfer(pool, dai("10"));
    // use another account to call addLiquidity and create non-zero
    // token supply and ETH value in contract
    await pool.addLiquidity(dai("10"), {
      from: other,
    });

    // now we can check the expected mint amount based on the ETH ratio
    const daiDeposit = ether("2");
    const expectedMintAmount = await pool.calculateMintAmount(daiDeposit, {
      from: wallet,
    });

    await pool.addLiquidity(daiDeposit, { from: wallet });
    const mintAmount = await pool.balanceOf(wallet);
    expect(mintAmount).to.bignumber.equal(expectedMintAmount);
  });

  it("redeem reverts if amount is zero", async () => {
    await expectRevert(pool.redeem(0), "Pool/redeem-positive-amount");
  });

  it("redeem reverts if insufficient balance", async () => {
    const tokenBalance = new BN("100");
    await pool.internalMint(wallet, tokenBalance);

    await expectRevert(
      pool.redeem(tokenBalance.addn(1), { from: wallet }),
      "Pool/insufficient-balance"
    );
  });

  it("redeem burns specified token amount", async () => {
    // start wallet with APT
    const startAmount = dai("2");
    await pool.internalMint(wallet, startAmount);

    const redeemAmount = dai("1");
    await mockDaiTransfer(pool, redeemAmount);

    await pool.redeem(redeemAmount, { from: wallet });
    expect(await pool.balanceOf(wallet)).to.bignumber.equal(
      startAmount.sub(redeemAmount)
    );
  });

  it("redeem undoes addLiquidity", async () => {
    const daiDeposit = ether("1");
    await mockDaiTransfer(pool, daiDeposit);
    await pool.addLiquidity(daiDeposit, { from: wallet });

    const mintAmount = await pool.balanceOf(wallet);
    await pool.redeem(mintAmount, { from: wallet });
    expect(await pool.balanceOf(wallet)).to.bignumber.equal("0");
  });

  it("getUnderlyerAmount returns 0 for 0 APT amount", async () => {
    // When APT supply is 0, share of APT will be undefined,
    // but we still want underlyer amount to be 0.
    expect(await pool.totalSupply()).to.be.bignumber.equal("0");
    expect(await pool.getUnderlyerAmount(0)).to.be.bignumber.equal("0");

    // sanity check: when APT supply is non-zero, we still want
    // underlyer amount to be 0!
    await pool.internalMint(pool.address, new BN("1000000"));
    expect(await pool.getUnderlyerAmount(0)).to.be.bignumber.equal("0");
  });

  it("addLiquidity reverts when contract is locked", async () => {
    const daiDeposit = dai("1");
    await mockDaiTransfer(pool, daiDeposit);

    await pool.lock({ from: deployer });
    await expectRevert(
      pool.addLiquidity(daiDeposit, { from: wallet }),
      "Pausable: paused"
    );

    await pool.unlock({ from: deployer });
    try {
      await pool.addLiquidity(daiDeposit, { from: wallet });
    } catch {
      assert.fail("Could not unlock the pool.");
    }
  });

  it("redeem reverts when contract is locked", async () => {
    // some setup needed for checking everything
    // works after unlocking
    const daiDeposit = dai("10000");
    const aptAmount = new BN("1");
    await mockDaiTransfer(pool, daiDeposit);
    await pool.internalMint(wallet, aptAmount);

    await pool.lock({ from: deployer });
    await expectRevert(
      pool.redeem(new BN("100"), { from: wallet }),
      "Pausable: paused"
    );

    await pool.unlock({ from: deployer });
    try {
      await pool.redeem(aptAmount, { from: wallet });
    } catch {
      assert.fail("Could not unlock the pool.");
    }
  });

  it("revert if non-owner tries to lock or unlock the pool", async () => {
    await expectRevert(
      pool.lock({ from: other }),
      "Ownable: caller is not the owner"
    );
    await expectRevert(
      pool.unlock({ from: other }),
      "Ownable: caller is not the owner"
    );
  });

  // test helper to mock ERC20 functions on underlyer token
  const mockDaiTransfer = async (liquidityPoolContract, amount) => {
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
    await mock.givenMethodReturnUint(allowanceAbi, amount);
    await mock.givenMethodReturnBool(transferAbi, true);
    await mock.givenMethodReturnBool(transferFromAbi, true);
  };
});
