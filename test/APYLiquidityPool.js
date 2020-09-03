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
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const dai = ether;

const APYLiquidityPool = artifacts.require("APYLiquidityPoolTestProxy");
const APT = artifacts.require("APT");
const MockContract = artifacts.require("MockContract");

contract("APYLiquidityPool", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let pool;
  let apt;
  let mockDai;

  let DEFAULT_TOKEN_TO_ETH_FACTOR;

  beforeEach(async () => {
    pool = await APYLiquidityPool.new();
    apt = await APT.new();
    // mockDai = await MockContract.new();

    await pool.setAptAddress(apt.address, { from: deployer });
    // await pool.setUnderlyerAddress(mockDai.address, { from: deployer });
    await apt.setPoolAddress(pool.address, { from: deployer });

    DEFAULT_TOKEN_TO_ETH_FACTOR = await pool.defaultTokenToEthFactor();
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
    // mock token and set total supply to total Dai balance
    await mockAptTotalSupply(pool, totalBalance);
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

    await mockAptTotalSupply(pool, totalBalance.divn(2));

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
    // mock out token contract and set non-zero total supply
    await mockAptTotalSupply(pool, dai("100"));

    const daiDeposit = dai("7.3");
    const mintAmount = await pool.internalCalculateMintAmount(daiDeposit, 0, {
      from: wallet,
    });
    expect(mintAmount).to.bignumber.equal(
      daiDeposit.mul(DEFAULT_TOKEN_TO_ETH_FACTOR)
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
      daiDeposit.mul(DEFAULT_TOKEN_TO_ETH_FACTOR)
    );
  });

  it("addLiquidity will create APT for sender", async () => {
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
    const mintAmount = await apt.balanceOf(wallet);
    expect(mintAmount).to.bignumber.equal(expectedMintAmount);
  });

  it("redeem reverts if amount is zero", async () => {
    await expectRevert(pool.redeem(0), "Pool/redeem-positive-amount");
  });

  it("redeem reverts if insufficient balance", async () => {
    const tokenBalance = new BN("100");
    await mintAPT(apt, tokenBalance, wallet);

    await expectRevert(
      pool.redeem(tokenBalance.addn(1), { from: wallet }),
      "Pool/insufficient-balance"
    );
  });

  it("redeem burns specified token amount", async () => {
    // start wallet with APT
    const startAmount = dai("2");
    await mintAPT(apt, startAmount, wallet);

    const redeemAmount = dai("1");
    await mockDaiTransfer(pool, redeemAmount);

    await pool.redeem(redeemAmount, { from: wallet });
    expect(await apt.balanceOf(wallet)).to.bignumber.equal(
      startAmount.sub(redeemAmount)
    );
  });

  it("redeem undoes addLiquidity", async () => {
    const daiDeposit = ether("1");
    await mockDaiTransfer(pool, daiDeposit);
    await pool.addLiquidity(daiDeposit, { from: wallet });

    const mintAmount = await apt.balanceOf(wallet);
    await pool.redeem(mintAmount, { from: wallet });
    expect(await apt.balanceOf(wallet)).to.bignumber.equal("0");
  });

  // test helper to mock the total supply
  const mockAptTotalSupply = async (liquidityPoolContract, totalSupply) => {
    const mock = await MockContract.new();
    await liquidityPoolContract.setAptAddress(mock.address, {
      from: deployer,
    });
    const totalSupplyAbi = apt.contract.methods.totalSupply().encodeABI();
    await mock.givenMethodReturnUint(totalSupplyAbi, totalSupply);
  };

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

  // test helper to mint tokens to wallet
  const mintAPT = async (tokenContract, amount, wallet) => {
    const poolAddress = await tokenContract.pool();
    await tokenContract.setPoolAddress(wallet, { from: deployer });
    await tokenContract.mint(wallet, amount, { from: wallet });
    await tokenContract.setPoolAddress(poolAddress, { from: deployer });
  };
});
