const hre = require("hardhat");
const { artifacts, contract, web3 } = require("hardhat");
const { DAI_WHALE } = require("../utils/constants");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const GenericExecutor = artifacts.require("APYGenericExecutor");
const {
  BN,
  expectEvent, // Assertions for emitted events
} = require("@openzeppelin/test-helpers");
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
    const stableSwapY = new web3.eth.Contract(
      legos.curvefi.abis.yDAI_yUSDC_yUSDT_ytUSD,
      legos.curvefi.addresses.yDAI_yUSDC_yUSDT_ytUSD
    );

    const exec = await GenericExecutor.new();

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DAI_WHALE],
    });

    await web3.eth.sendTransaction({
      from: accounts[0],
      to: DAI_WHALE,
      value: 1e18,
    });

    const DAI = await IDetailedERC20.at(legos.maker.addresses.DAI);

    await acquireToken(DAI_WHALE, exec.address, DAI, "1000000");

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
