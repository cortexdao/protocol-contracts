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
const { mintERC20Tokens, dai } = require("./utils");
const { DAI_ADDRESS, DAI_MINTER_ADDRESS } = require("./constants");

const APYLiquidityPool = artifacts.require("APYLiquidityPoolTestProxy");
const APT = artifacts.require("APT");
const IERC20 = artifacts.require("IERC20");
const MockContract = artifacts.require("MockContract");

contract("APYLiquidityPool", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let pool;
  let apt;

  let daiToken;

  let DEFAULT_TOKEN_TO_ETH_FACTOR;

  beforeEach(async () => {
    pool = await APYLiquidityPool.new();
    apt = await APT.new();

    await apt.setPoolAddress(pool.address, { from: deployer });
    await pool.setAptAddress(apt.address, { from: deployer });
    await pool.setUnderlyerAddress(DAI_ADDRESS, { from: deployer });

    daiToken = await IERC20.at(DAI_ADDRESS);
    // mint 1000 DAI to wallet
    amount = dai("1000");
    await mintERC20Tokens(DAI_ADDRESS, wallet, DAI_MINTER_ADDRESS, amount);
    await mintERC20Tokens(DAI_ADDRESS, other, DAI_MINTER_ADDRESS, amount);
    await daiToken.approve(pool.address, amount, { from: wallet });
    await daiToken.approve(pool.address, amount, { from: other });

    DEFAULT_TOKEN_TO_ETH_FACTOR = await pool.defaultTokenToEthFactor();
  });

  it("addLiquidity receives DAI sent", async () => {
    const balance_1 = await daiToken.balanceOf(pool.address);
    expect(balance_1).to.bignumber.equal("0");

    const amount = dai("10");
    await pool.addLiquidity(amount, { from: wallet });

    const balance_2 = await daiToken.balanceOf(pool.address);
    expect(balance_2).to.bignumber.equal(amount);
  });

  it("addLiquidity will create tokens for sender", async () => {
    let balanceOf = await apt.balanceOf(wallet);
    expect(balanceOf).to.bignumber.equal("0");

    await pool.addLiquidity(dai("10"), { from: wallet });
    balanceOf = await apt.balanceOf(wallet);
    expect(balanceOf).to.bignumber.gt("0");
  });

  it("addLiquidity creates correctly calculated amount of tokens", async () => {
    // use another account to call addLiquidity and create non-zero
    // token supply and DAI balance for contract
    const seedAmount = dai("10");
    await pool.addLiquidity(seedAmount, {
      from: other,
    });

    // now we can check the expected mint amount based on the DAI ratio
    const daiSent = dai("2");
    const expectedMintAmount = await pool.calculateMintAmount(daiSent, {
      from: wallet,
    });

    await pool.addLiquidity(daiSent, { from: wallet });
    const mintAmount = await apt.balanceOf(wallet);
    expect(mintAmount).to.bignumber.equal(expectedMintAmount);
  });

  it("redeem undoes addLiquidity", async () => {
    const daiAmount = dai("1");
    await pool.addLiquidity(daiAmount, { from: wallet });
    const mintAmount = await apt.balanceOf(wallet);
    await pool.redeem(mintAmount, { from: wallet });
    expect(await apt.balanceOf(wallet)).to.bignumber.equal("0");
  });

  it("redeem releases DAI to sender", async () => {
    const daiAmount = dai("1");
    const mintAmount = await pool.calculateMintAmount(daiAmount);
    await pool.addLiquidity(daiAmount, { from: wallet });

    const startingBalance = await daiToken.balanceOf(wallet);
    await pool.redeem(mintAmount, { from: wallet });
    expect(await daiToken.balanceOf(wallet)).to.bignumber.gt(startingBalance);
  });

  it("redeem releases DAI proportional to share of APT.", async () => {
    // setup: mint some tokens and add some ETH to pool
    await mintTokens(apt, new BN("1000"), wallet);
    await daiToken.transfer(pool.address, dai("1.75"), { from: wallet });

    const tokenAmount = new BN("257");
    const daiAmount = await pool.getUnderlyerAmount(tokenAmount);

    const startBalance = await daiToken.balanceOf(wallet);
    await pool.redeem(tokenAmount, { from: wallet });
    const endBalance = await daiToken.balanceOf(wallet);
    expect(endBalance.sub(startBalance)).to.bignumber.equal(daiAmount);
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
