const hre = require("hardhat");
const { artifacts, contract, web3 } = require("hardhat");
const APYManagerAddresses = require("../deployed_addresses/APYManagerProxy.json");
const DAI_APYPoolTokenAddresses = require("../deployed_addresses/DAI_APYPoolTokenProxy.json");
const USDC_APYPoolTokenAddresses = require("../deployed_addresses/USDC_APYPoolTokenProxy.json");
const USDT_APYPoolTokenAddresses = require("../deployed_addresses/USDC_APYPoolTokenProxy.json");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const GenericExecutor = artifacts.require("APYGenericExecutor");
const APYManager = artifacts.require("APYManager");
const APYPoolToken = artifacts.require("APYPoolToken");
const { expectEvent } = require("@openzeppelin/test-helpers");
const legos = require("defi-legos");

contract("Test GenericExecutor", async () => {
  it.only("Execution Test", async () => {
    const stableSwapY = new web3.eth.Contract(
      legos.curvefi.abis.yDAI_yUSDC_yUSDT_ytUSD,
      legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
    );

    const exec = await GenericExecutor.new();

    const manager = await APYManager.at(APYManagerAddresses["1"]);

    const daiPool = await APYPoolToken.at(DAI_APYPoolTokenAddresses["1"]);
    const poolOwner = await daiPool.owner();
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [poolOwner],
    });
    await daiPool.infiniteApprove(manager.address, { from: poolOwner });
    const DAI = await IDetailedERC20.at(await daiPool.underlyer());
    const daiBalance = await DAI.balanceOf(daiPool.address);
    console.log(daiBalance);

    const usdcPool = await APYPoolToken.at(USDC_APYPoolTokenAddresses["1"]);
    await usdcPool.infiniteApprove(manager.address, { from: poolOwner });
    const USDC = await IDetailedERC20.at(await usdcPool.underlyer());
    const usdcBalance = await USDC.balanceOf(usdcPool.address);
    console.log(usdcBalance);

    const usdtPool = await APYPoolToken.at(USDT_APYPoolTokenAddresses["1"]);
    await usdtPool.infiniteApprove(manager.address, { from: poolOwner });
    const USDT = await IDetailedERC20.at(await usdtPool.underlyer());
    const usdtBalance = await USDT.balanceOf(usdtPool.address);
    console.log(usdtBalance);

    const trx = await exec.execute([
      [
        legos.maker.addresses.DAI,
        legos.maker.codecs.DAI.encodeApprove(
          legos.curvefi.addresses.DEPOSIT_Y,
          100000
        ),
      ],
      [
        legos.curvefi.addresses.DEPOSIT_Y,
        legos.curvefi.codecs.DEPOSIT_Y.encodeAddLiquidity([100000, 0, 0, 0], 0),
      ],
    ]);

    await expectEvent.inTransaction(trx.tx, stableSwapY, "AddLiquidity");
  });
});
