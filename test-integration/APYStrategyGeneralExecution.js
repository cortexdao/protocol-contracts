const hre = require("hardhat");
const { artifacts, contract, web3 } = require("hardhat");
const APYManagerAddresses = require("../deployed_addresses/APYManagerProxy.json");
const DAI_APYPoolTokenAddresses = require("../deployed_addresses/DAI_APYPoolTokenProxy.json");
const USDC_APYPoolTokenAddresses = require("../deployed_addresses/USDC_APYPoolTokenProxy.json");
const USDT_APYPoolTokenAddresses = require("../deployed_addresses/USDC_APYPoolTokenProxy.json");
const { DAI_WHALE, USDC_WHALE, USDT_WHALE } = require("../utils/constants");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const GenericExecutor = artifacts.require("APYGenericExecutor");
const APYManager = artifacts.require("APYManager");
const APYPoolToken = artifacts.require("APYPoolToken");
const { expectEvent, BN } = require("@openzeppelin/test-helpers");
const legos = require("defi-legos");

async function formattedAmount(token, value) {
  const decimals = await token.decimals.call();
  return new BN("10").pow(decimals).mul(new BN(value)).toString();
}

async function acquireToken(fundAccount, receiver, token, amount) {
  /* NOTE: Ganache is setup to control "whale" addresses. This method moves
  requested funds out of the fund account and into the specified wallet */

  const funds = await formattedAmount(token, amount);

  await token.transfer(receiver, funds, { from: fundAccount });
  const tokenBal = await token.balanceOf(receiver);
  console.log(`${token.address} Balance: ${tokenBal.toString()}`);
}

contract("Test GenericExecutor", async (accounts) => {
  it.only("Execution Test", async () => {
    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [DAI_WHALE],
    // });

    await web3.eth.sendTransaction({
      from: accounts[0],
      to: DAI_WHALE,
      value: 1e18,
    });

    const daiPool = await APYPoolToken.at(DAI_APYPoolTokenAddresses["1"]);
    const DAI = await IDetailedERC20.at(await daiPool.underlyer());

    const amountOfStables = "1000000";
    await acquireToken(DAI_WHALE, daiPool.address, DAI, amountOfStables);

    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [USDC_WHALE],
    // });

    await web3.eth.sendTransaction({
      from: accounts[0],
      to: USDC_WHALE,
      value: 1e18,
    });

    const usdcPool = await APYPoolToken.at(USDC_APYPoolTokenAddresses["1"]);
    const USDC = await IDetailedERC20.at(await usdcPool.underlyer());

    await acquireToken(USDC_WHALE, usdcPool.address, USDC, amountOfStables);

    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [USDT_WHALE],
    // });

    await web3.eth.sendTransaction({
      from: accounts[0],
      to: USDT_WHALE,
      value: 1e18,
    });

    const usdtPool = await APYPoolToken.at(USDT_APYPoolTokenAddresses["1"]);
    const USDT = await IDetailedERC20.at(await usdtPool.underlyer());

    await acquireToken(USDT_WHALE, usdtPool.address, USDT, amountOfStables);

    const stableSwapY = new web3.eth.Contract(
      legos.curvefi.abis.yDAI_yUSDC_yUSDT_ytUSD,
      legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
    );

    const manager = await APYManager.at(APYManagerAddresses["1"]);

    const poolOwner = await daiPool.owner();
    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [poolOwner],
    // });
    await daiPool.infiniteApprove(manager.address, { from: poolOwner });
    const daiBalance = await DAI.balanceOf(daiPool.address);
    console.log(daiBalance.toString());

    await usdcPool.infiniteApprove(manager.address, { from: poolOwner });
    const usdcBalance = await USDC.balanceOf(usdcPool.address);
    console.log(usdcBalance.toString());

    await usdtPool.infiniteApprove(manager.address, { from: poolOwner });
    const usdtBalance = await USDT.balanceOf(usdtPool.address);
    console.log(usdtBalance.toString());

    const genericExecutor = await GenericExecutor.new();
    const strategyAddress = await manager.deploy.call(genericExecutor.address);
    await manager.deploy(genericExecutor.address);

    const data = [
      legos.curvefi.addresses.DEPOSIT_Y,
      legos.curvefi.codecs.DEPOSIT_Y.encodeAddLiquidity([100000, 0, 0, 0], 0),
    ];
    const trx = await manager.transferAndExecute(strategyAddress, data);

    await expectEvent.inTransaction(trx.tx, stableSwapY, "AddLiquidity");
  });
});
