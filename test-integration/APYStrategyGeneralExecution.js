const hre = require("hardhat");
const { artifacts, contract, web3 } = require("hardhat");
const APYManagerAddresses = require("../deployed_addresses/APYManagerProxy.json");
const DAI_APYPoolTokenAddresses = require("../deployed_addresses/DAI_APYPoolTokenProxy.json");
const USDC_APYPoolTokenAddresses = require("../deployed_addresses/USDC_APYPoolTokenProxy.json");
const USDT_APYPoolTokenAddresses = require("../deployed_addresses/USDC_APYPoolTokenProxy.json");
const { DAI_WHALE, USDC_WHALE, USDT_WHALE } = require("../utils/constants");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const GenericExecutor = artifacts.require("APYGenericExecutor");
const Strategy = artifacts.require("Strategy");
const APYManager = artifacts.require("APYManager");
const APYPoolToken = artifacts.require("APYPoolToken");
const { expectEvent, BN, send } = require("@openzeppelin/test-helpers");
const legos = require("defi-legos");
const { dai } = require("../utils/helpers");
const ether = require("@openzeppelin/test-helpers/src/ether");

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
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DAI_WHALE],
    });

    await web3.eth.sendTransaction({
      from: accounts[0],
      to: DAI_WHALE,
      value: 1e18,
    });

    const daiPool = await APYPoolToken.at(DAI_APYPoolTokenAddresses["1"]);
    const DAI = await IDetailedERC20.at(await daiPool.underlyer());

    const amountOfStables = "100000";
    await acquireToken(DAI_WHALE, daiPool.address, DAI, amountOfStables);

    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [USDC_WHALE],
    // });

    // await web3.eth.sendTransaction({
    //   from: accounts[0],
    //   to: USDC_WHALE,
    //   value: 1e18,
    // });

    // const usdcPool = await APYPoolToken.at(USDC_APYPoolTokenAddresses["1"]);
    // const USDC = await IDetailedERC20.at(await usdcPool.underlyer());

    // await acquireToken(USDC_WHALE, usdcPool.address, USDC, amountOfStables);

    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [USDT_WHALE],
    // });

    // await web3.eth.sendTransaction({
    //   from: accounts[0],
    //   to: USDT_WHALE,
    //   value: 1e18,
    // });

    // const usdtPool = await APYPoolToken.at(USDT_APYPoolTokenAddresses["1"]);
    // const USDT = await IDetailedERC20.at(await usdtPool.underlyer());

    // await acquireToken(USDT_WHALE, usdtPool.address, USDT, amountOfStables);

    const yPoolToken = await IDetailedERC20.at(
      legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token
    );
    console.log(
      "Y Pool address:",
      legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
    );
    console.log(
      "LP token address:",
      legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD_Token
    );

    const manager = await APYManager.at(APYManagerAddresses["1"]);

    const poolOwner = await daiPool.owner();
    await send.ether(accounts[0], poolOwner, ether("1"));
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [poolOwner],
    });
    await daiPool.infiniteApprove(manager.address, { from: poolOwner });
    const daiBalance = await DAI.balanceOf(daiPool.address);
    console.log(daiBalance.toString());

    // await usdcPool.infiniteApprove(manager.address, { from: poolOwner });
    // const usdcBalance = await USDC.balanceOf(usdcPool.address);
    // console.log(usdcBalance.toString());

    // await usdtPool.infiniteApprove(manager.address, { from: poolOwner });
    // const usdtBalance = await USDT.balanceOf(usdtPool.address);
    // console.log(usdtBalance.toString());

    const managerOwner = await manager.owner();
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [managerOwner],
    });
    const genericExecutor = await GenericExecutor.new();
    const strategyAddress = await manager.deploy.call(genericExecutor.address, {
      from: managerOwner,
    });
    await manager.deploy(genericExecutor.address, { from: managerOwner });

    // const depositAmount = dai("100000").toString();
    const depositAmount = dai("100000").toString();
    console.log("Strategy address:", strategyAddress);
    console.log("Y deposit:", legos.curvefi.addresses.DEPOSIT_Y);
    const depositY = legos.curvefi.addresses.DEPOSIT_Y;
    const data = [
      [
        DAI.address,
        legos.maker.codecs.DAI.encodeApprove(depositY, depositAmount),
      ],
      [
        depositY,
        legos.curvefi.codecs.DEPOSIT_Y.encodeAddLiquidity(
          [depositAmount, 0, 0, 0],
          dai("0").toString()
        ),
      ],
    ];
    console.log("Data:", data);

    const genericExecutor_2 = await GenericExecutor.new();
    await acquireToken(
      DAI_WHALE,
      genericExecutor_2.address,
      DAI,
      amountOfStables
    );
    try {
      await genericExecutor_2.execute(data, { gas: 9e6 });
      console.log(
        "LP token balance:",
        (await yPoolToken.balanceOf(genericExecutor_2.address)).toString()
      );
      console.log(
        "DAI balance:",
        (await DAI.balanceOf(genericExecutor_2.address)).toString()
      );
    } catch (err) {
      console.error(`Generic executor failed: ${err}`);
    }

    // await manager.transferFunds(daiPool.address, strategyAddress);
    await acquireToken(DAI_WHALE, strategyAddress, DAI, amountOfStables);
    // console.log(
    //   "Strategy balance (before):",
    //   (await DAI.balanceOf(strategyAddress)).toString()
    // );
    const trx = await manager.execute(strategyAddress, data, {
      from: managerOwner,
      gas: 9e6,
    });
    // // const trx = await manager.transferAndExecute(strategyAddress, data);
    // // console.log(trx);
    console.log(
      "LP token balance:",
      (await yPoolToken.balanceOf(strategyAddress)).toString()
    );
    console.log(
      "DAI balance:",
      (await DAI.balanceOf(strategyAddress)).toString()
    );
    // const receipt = await web3.eth.getTransactionReceipt(trx.tx);
    // console.log(receipt.logs);

    const stableSwapY = new web3.eth.Contract(
      legos.curvefi.abis.yDAI_yUSDC_yUSDT_ytUSD,
      legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
    );
    await expectEvent.inTransaction(trx.tx, stableSwapY, "AddLiquidity");
  });
});
