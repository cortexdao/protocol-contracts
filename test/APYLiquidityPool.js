const { use, expect } = require("chai");
const { parseEther, BigNumber } = require("ethers/utils");
const { deployContract, deployMockContract } = require("ethereum-waffle");
const APYLiquidityPool = require("../artifacts/APYLiquidityPool.json");
const APT = require("../artifacts/APT.json");
const { Wallet } = require("ethers");

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

  it("mint receives ETH value sent", async () => {
    const balance_1 = await provider.getBalance(apyLiquidityPool.address);
    expect(balance_1).to.be.eq(0);

    const etherSent = parseEther("1");
    await apyLiquidityPool.mint({ value: etherSent });

    const balance_2 = await provider.getBalance(apyLiquidityPool.address);
    expect(balance_2).to.be.eq(etherSent);
  });

  it("mint reverts if 0 ETH sent", async () => {
    await expect(apyLiquidityPool.mint({ value: "0" })).to.be.reverted;
  });

  it("mint amount to supply equals ETH deposit to total ETH value", async () => {
    const ethValue = parseEther("112");
    const totalValue = parseEther("1000000");
    // mock token and set total supply to total ETH value
    apt = await deployMockContract(deployer, APT.abi);
    await apyLiquidityPool.connect(deployer).setTokenAddress(apt.address);
    await apt.mock.totalSupply.returns(totalValue);

    let mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue
    );
    let expectedAmount = ethValue;
    expect(Math.abs(mintAmount.sub(expectedAmount))).to.be.lte(
      1,
      "mint amount should differ by at most a wei from expected amount"
    );

    await apt.mock.totalSupply.returns(totalValue.div(2));

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
    apt = await deployMockContract(deployer, APT.abi);
    await apyLiquidityPool.connect(deployer).setTokenAddress(apt.address);
    await apt.mock.totalSupply.returns(parseEther("100"));

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

  it("mint will create tokens for sender", async () => {
    let balanceOf = await apt.balanceOf(wallet.address);
    expect(balanceOf).to.equal(0);

    await apyLiquidityPool.mint({ value: parseEther("1") });
    balanceOf = await apt.balanceOf(wallet.address);
    expect(balanceOf).to.be.gt(0);
  });

  it("mint creates correctly calculated amount of tokens", async () => {
    // use another account to call mint and create non-zero
    // token supply and ETH value in contract
    await apyLiquidityPool.connect(other).mint({ value: parseEther("10") });

    // now we can check the expected mint amount based on the ETH ratio
    const ethSent = parseEther("2");
    const expectedMintAmount = await apyLiquidityPool.calculateMintAmount(
      ethSent
    );

    await apyLiquidityPool.mint({ value: ethSent });
    const mintAmount = await apt.balanceOf(wallet.address);
    expect(mintAmount).to.equal(expectedMintAmount);
  });

  it("redeem reverts if token amount is zero", async () => {
    await expect(apyLiquidityPool.redeem(0)).to.be.reverted;
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

  // test helper to mint tokens to wallet
  const mintTokens = async (tokenContract, amount, wallet) => {
    const managerAddress = await tokenContract.manager();
    await tokenContract.connect(deployer).setManagerAddress(wallet.address);
    await tokenContract.mint(wallet.address, amount);
    await tokenContract.connect(deployer).setManagerAddress(managerAddress);
  };
});
