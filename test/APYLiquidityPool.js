const { expect } = require("chai");
const { parseEther, BigNumber } = require("ethers/utils");
const { deployContract, deployMockContract } = require("ethereum-waffle");
const APYLiquidityPool = require("../artifacts/APYLiquidityPool.json");
const APT = require("../artifacts/APT.json");

describe("APYLiquidityPool", () => {
  const provider = waffle.provider;
  const [deployer, wallet, other] = provider.getWallets();

  let apyLiquidityPool;
  let apt;

  const DEFAULT_TOKEN_TO_ETH_FACTOR = new BigNumber("1000");

  beforeEach(async () => {
    apyLiquidityPool = await deployContract(deployer, APYLiquidityPool);
    apt = await deployContract(deployer, APT);

    await apyLiquidityPool.setTokenAddress(apt.address);
    await apt.setManagerAddress(apyLiquidityPool.address);

    apyLiquidityPool = apyLiquidityPool.connect(wallet);
    apt = apt.connect(wallet);
  });

  it("addLiquidity receives ETH value sent", async () => {
    const balance_1 = await provider.getBalance(apyLiquidityPool.address);
    expect(balance_1).to.be.eq(0);

    const etherSent = parseEther("1");
    await apyLiquidityPool.addLiquidity({ value: etherSent });

    const balance_2 = await provider.getBalance(apyLiquidityPool.address);
    expect(balance_2).to.be.eq(etherSent);
  });

  it("addLiquidity reverts if 0 ETH sent", async () => {
    await expect(apyLiquidityPool.addLiquidity({ value: "0" })).to.be.reverted;
  });

  it("mint amount to supply equals ETH deposit to total ETH value", async () => {
    const ethValue = parseEther("112");
    const totalValue = parseEther("1000000");
    // mock token and set total supply to total ETH value
    await mockTotalSupply(apyLiquidityPool, totalValue);

    let mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue
    );
    let expectedAmount = ethValue;
    expect(Math.abs(mintAmount.sub(expectedAmount))).to.be.lte(
      1,
      "mint amount should differ by at most a wei from expected amount"
    );

    await mockTotalSupply(apyLiquidityPool, totalValue.div(2));

    mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue
    );
    expectedAmount = ethValue.div(2);
    expect(Math.abs(mintAmount.sub(expectedAmount))).to.be.lte(
      1,
      "mint amount should differ by at most a wei from expected amount"
    );
  });

  it("mint amount is constant multiple of deposit if total ETH value is zero", async () => {
    // mock out token contract and set non-zero total supply
    await mockTotalSupply(apyLiquidityPool, parseEther("100"));

    const ethValue = parseEther("7.3");
    const mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      0
    );
    expect(mintAmount).to.equal(ethValue.mul(DEFAULT_TOKEN_TO_ETH_FACTOR));
  });

  it("mint amount is constant multiple of deposit if total supply is zero ", async () => {
    const ethValue = parseEther("5");
    const totalValue = parseEther("100");
    const mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue
    );
    expect(mintAmount).to.equal(ethValue.mul(DEFAULT_TOKEN_TO_ETH_FACTOR));
  });

  it("addLiquidity will create tokens for sender", async () => {
    let balanceOf = await apt.balanceOf(wallet.address);
    expect(balanceOf).to.equal(0);

    await apyLiquidityPool.addLiquidity({ value: parseEther("1") });
    balanceOf = await apt.balanceOf(wallet.address);
    expect(balanceOf).to.be.gt(0);
  });

  it("addLiquidity creates correctly calculated amount of tokens", async () => {
    // use another account to call addLiquidity and create non-zero
    // token supply and ETH value in contract
    await apyLiquidityPool
      .connect(other)
      .addLiquidity({ value: parseEther("10") });

    // now we can check the expected mint amount based on the ETH ratio
    const ethSent = parseEther("2");
    const expectedMintAmount = await apyLiquidityPool.calculateMintAmount(
      ethSent
    );

    await apyLiquidityPool.addLiquidity({ value: ethSent });
    const mintAmount = await apt.balanceOf(wallet.address);
    expect(mintAmount).to.equal(expectedMintAmount);
  });

  it("redeem reverts if token amount is zero", async () => {
    await expect(apyLiquidityPool.redeem(0)).to.be.reverted;
  });

  it("redeem reverts if insufficient balance", async () => {
    const tokenBalance = new BigNumber("100");
    await mintTokens(apt, tokenBalance, wallet);
    await expect(apyLiquidityPool.redeem(tokenBalance.add(1))).to.be.reverted;
  });

  it("redeem burns specified token amount", async () => {
    // start wallet with APT
    const startAmount = parseEther("2");
    await mintTokens(apt, startAmount, wallet);

    const redeemAmount = parseEther("1");
    await apyLiquidityPool.redeem(redeemAmount);
    expect(await apt.balanceOf(wallet.address)).to.equal(
      startAmount.sub(redeemAmount)
    );
  });

  it("redeem undoes addLiquidity", async () => {
    const ethValue = parseEther("1");
    await apyLiquidityPool.addLiquidity({ value: ethValue });
    const mintAmount = await apt.balanceOf(wallet.address);
    await apyLiquidityPool.redeem(mintAmount);
    expect(await apt.balanceOf(wallet.address)).to.equal(0);
  });

  it("redeem releases ETH to sender", async () => {
    const mintAmount = await apyLiquidityPool.calculateMintAmount(
      parseEther("1")
    );
    await apyLiquidityPool.addLiquidity({ value: parseEther("1") });

    const startingBalance = await provider.getBalance(wallet.address);
    await apyLiquidityPool.redeem(mintAmount);
    expect(await provider.getBalance(wallet.address)).to.be.gt(startingBalance);
  });

  it("redeem releases ETH value proportional to share of APT.", async () => {
    // setup: mint some tokens and add some ETH to pool
    await mintTokens(apt, new BigNumber("1000"), wallet);
    await wallet.sendTransaction({
      to: apyLiquidityPool.address,
      value: parseEther("1.75"),
    });

    const tokenAmount = new BigNumber("257");
    const ethValue = await apyLiquidityPool.getEthValue(tokenAmount);

    const startBalance = await provider.getBalance(wallet.address);
    await apyLiquidityPool.redeem(tokenAmount, { gasPrice: 0 });
    const endBalance = await provider.getBalance(wallet.address);
    expect(endBalance.sub(startBalance)).to.equal(ethValue);
  });

  // test helper to mock the total supply
  const mockTotalSupply = async (liquidityPoolContract, totalSupply) => {
    mockApt = await deployMockContract(wallet, APT.abi);
    await liquidityPoolContract
      .connect(deployer)
      .setTokenAddress(mockApt.address);
    await mockApt.mock.totalSupply.returns(totalSupply);
  };

  // test helper to mint tokens to wallet
  const mintTokens = async (tokenContract, amount, wallet) => {
    const managerAddress = await tokenContract.manager();
    await tokenContract.connect(deployer).setManagerAddress(wallet.address);
    await tokenContract.mint(wallet.address, amount);
    await tokenContract.connect(deployer).setManagerAddress(managerAddress);
  };
});
