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

const APYLiquidityPool = artifacts.require("APYLiquidityPoolTestProxy");
const APT = artifacts.require("APT");
const MockContract = artifacts.require("MockContract");

contract("APYLiquidityPool", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let apyLiquidityPool;
  let apt;

  let DEFAULT_TOKEN_TO_ETH_FACTOR;

  beforeEach(async () => {
    apyLiquidityPool = await APYLiquidityPool.new();
    apt = await APT.new();

    await apyLiquidityPool.setTokenAddress(apt.address, { from: deployer });
    await apt.setPoolAddress(apyLiquidityPool.address, { from: deployer });

    DEFAULT_TOKEN_TO_ETH_FACTOR = await apyLiquidityPool.defaultTokenToEthFactor();
  });

  it("addLiquidity receives ETH value sent", async () => {
    const balance_1 = await balance.current(apyLiquidityPool.address);
    expect(balance_1).to.bignumber.equal("0");

    const ethSent = ether("1");
    await apyLiquidityPool.addLiquidity({ from: wallet, value: ethSent });

    const balance_2 = await balance.current(apyLiquidityPool.address);
    expect(balance_2).to.bignumber.equal(ethSent);
  });

  it("addLiquidity reverts if 0 ETH sent", async () => {
    await expectRevert(
      apyLiquidityPool.addLiquidity({ from: wallet, value: "0" }),
      "Pool/insufficient-value"
    );
  });

  it("mint amount to supply equals ETH deposit to total ETH value", async () => {
    const ethValue = ether("112");
    const totalValue = ether("1000000");
    // mock token and set total supply to total ETH value
    await mockTotalSupply(apyLiquidityPool, totalValue);
    // set tolerance to compensate for fixed-point arithmetic
    const tolerance = new BN("50000");

    let mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue,
      { from: wallet }
    );
    let expectedAmount = ethValue;
    expect(mintAmount.sub(expectedAmount).abs()).to.bignumber.lte(
      tolerance,
      "mint amount should differ from expected amount by at most tolerance"
    );

    await mockTotalSupply(apyLiquidityPool, totalValue.divn(2));

    mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue,
      { from: wallet }
    );
    expectedAmount = ethValue.divn(2);
    expect(mintAmount.sub(expectedAmount).abs()).to.bignumber.lte(
      tolerance,
      "mint amount should differ from expected amount by at most tolerance"
    );
  });

  it("mint amount is constant multiple of deposit if total eth value is zero", async () => {
    // mock out token contract and set non-zero total supply
    await mockTotalSupply(apyLiquidityPool, ether("100"));

    const ethValue = ether("7.3");
    const mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      0,
      { from: wallet }
    );
    expect(mintAmount).to.bignumber.equal(
      ethValue.mul(DEFAULT_TOKEN_TO_ETH_FACTOR)
    );
  });

  it("mint amount is constant multiple of deposit if total supply is zero ", async () => {
    const ethValue = ether("5");
    const totalValue = ether("100");
    const mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue,
      { from: wallet }
    );
    expect(mintAmount).to.bignumber.equal(
      ethValue.mul(DEFAULT_TOKEN_TO_ETH_FACTOR)
    );
  });

  it("addLiquidity will create tokens for sender", async () => {
    let balanceOf = await apt.balanceOf(wallet);
    expect(balanceOf).to.bignumber.equal("0");

    await apyLiquidityPool.addLiquidity({
      from: wallet,
      value: ether("1"),
    });
    balanceOf = await apt.balanceOf(wallet);
    expect(balanceOf).to.bignumber.gt("0");
  });

  it("addLiquidity creates correctly calculated amount of tokens", async () => {
    // use another account to call addLiquidity and create non-zero
    // token supply and ETH value in contract
    await apyLiquidityPool.addLiquidity({
      from: other,
      value: ether("10"),
    });

    // now we can check the expected mint amount based on the ETH ratio
    const ethSent = ether("2");
    const expectedMintAmount = await apyLiquidityPool.calculateMintAmount(
      ethSent,
      { from: wallet }
    );

    await apyLiquidityPool.addLiquidity({ from: wallet, value: ethSent });
    const mintAmount = await apt.balanceOf(wallet);
    expect(mintAmount).to.bignumber.equal(expectedMintAmount);
  });

  it("redeem reverts if token amount is zero", async () => {
    await expectRevert(
      apyLiquidityPool.redeem(0),
      "Pool/redeem-positive-amount"
    );
  });

  it("redeem reverts if insufficient balance", async () => {
    const tokenBalance = new BN("100");
    await mintTokens(apt, tokenBalance, wallet);

    await expectRevert(
      apyLiquidityPool.redeem(tokenBalance.addn(1), { from: wallet }),
      "Pool/insufficient-balance"
    );
  });

  it("redeem burns specified token amount", async () => {
    // start wallet with APT
    const startAmount = ether("2");
    await mintTokens(apt, startAmount, wallet);

    const redeemAmount = ether("1");
    await apyLiquidityPool.redeem(redeemAmount, { from: wallet });
    expect(await apt.balanceOf(wallet)).to.bignumber.equal(
      startAmount.sub(redeemAmount)
    );
  });

  it("redeem undoes addLiquidity", async () => {
    const ethValue = ether("1");
    await apyLiquidityPool.addLiquidity({ from: wallet, value: ethValue });
    const mintAmount = await apt.balanceOf(wallet);
    await apyLiquidityPool.redeem(mintAmount, { from: wallet });
    expect(await apt.balanceOf(wallet)).to.bignumber.equal("0");
  });

  it("redeem releases ETH to sender", async () => {
    const ethValue = ether("1");
    const mintAmount = await apyLiquidityPool.calculateMintAmount(ethValue);
    await apyLiquidityPool.addLiquidity({ from: wallet, value: ethValue });

    const startingBalance = await balance.current(wallet);
    await apyLiquidityPool.redeem(mintAmount, { from: wallet });
    expect(await balance.current(wallet)).to.bignumber.gt(startingBalance);
  });

  it("redeem releases ETH value proportional to share of APT.", async () => {
    // setup: mint some tokens and add some ETH to pool
    await mintTokens(apt, new BN("1000"), wallet);
    await send.ether(wallet, apyLiquidityPool.address, ether("1.75"));

    const tokenAmount = new BN("257");
    const ethValue = await apyLiquidityPool.getEthValue(tokenAmount);

    const startBalance = await balance.current(wallet);
    await apyLiquidityPool.redeem(tokenAmount, { from: wallet, gasPrice: 0 });
    const endBalance = await balance.current(wallet);
    expect(endBalance.sub(startBalance)).to.bignumber.equal(ethValue);
  });

  // test helper to mock the total supply
  const mockTotalSupply = async (liquidityPoolContract, totalSupply) => {
    // Instantiate mock and make it return true for any invocation
    const mock = await MockContract.new();
    await liquidityPoolContract.setTokenAddress(mock.address, {
      from: deployer,
    });
    const totalSupplyAbi = apt.contract.methods.totalSupply().encodeABI();
    await mock.givenMethodReturnUint(totalSupplyAbi, totalSupply);
  };

  // test helper to mint tokens to wallet
  const mintTokens = async (tokenContract, amount, wallet) => {
    const poolAddress = await tokenContract.pool();
    await tokenContract.setPoolAddress(wallet, { from: deployer });
    await tokenContract.mint(wallet, amount, { from: wallet });
    await tokenContract.setPoolAddress(poolAddress, { from: deployer });
  };
});
