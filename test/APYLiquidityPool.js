const { expect } = require("chai");
const { utils } = require("ethers");
const {
  solidity,
  createFixtureLoader,
  deployContract,
} = require("ethereum-waffle");
const APYLiquidityPool = require("../artifacts/APYLiquidityPool.json");

describe("APYLiquidityPool", () => {
  const provider = waffle.provider;
  const [wallet] = provider.getWallets();

  let apiLiquidityPool;

  beforeEach(async () => {
    apiLiquidityPool = await deployContract(wallet, APYLiquidityPool);
  });

  it("mint receives ETH value sent", async () => {
    const balance_1 = await provider.getBalance(apiLiquidityPool.address);
    expect(balance_1).to.be.eq(0);

    const etherSent = utils.parseEther("1");
    await apiLiquidityPool.mint({ value: etherSent });

    const balance_2 = await provider.getBalance(apiLiquidityPool.address);
    expect(balance_2).to.be.eq(etherSent);
  });
});
