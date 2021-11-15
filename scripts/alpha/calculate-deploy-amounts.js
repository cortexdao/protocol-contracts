const hre = require("hardhat");
const { ethers } = hre;
const _ = require("lodash");
const { getStablecoin } = require("../frontend/utils");

const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";

async function main() {
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    MAINNET_ADDRESS_REGISTRY
  );
  const lpAccountAddress = await addressRegistry.lpAccountAddress();
  const lpAccount = await ethers.getContractAt("LpAccount", lpAccountAddress);

  let balances = {};
  let normalizedBalances = {};

  const dai = await getStablecoin("DAI");
  balances["dai"] = await dai.balanceOf(lpAccount.address);
  normalizedBalances["dai"] = balances["dai"];

  const usdc = await getStablecoin("USDC");
  balances["usdc"] = await usdc.balanceOf(lpAccount.address);
  normalizedBalances["usdc"] = balances["usdc"].mul(10 ** 12);

  const usdt = await getStablecoin("USDT");
  balances["usdt"] = await usdt.balanceOf(lpAccount.address);
  normalizedBalances["usdt"] = balances["usdt"].mul(10 ** 12);

  const totalBalance = _.reduce(normalizedBalances, (a, b) => a.add(b));
  console.log(`Total Balance: ${totalBalance}`);

  const strategies = {
    "curve-saave": ["dai"],
    "curve-compound": ["dai", "usdc"],
    "curve-susdv2": ["dai", "usdc", "usdt"],
    "curve-frax": ["dai", "usdc", "usdt"],
    "curve-aave": ["dai", "usdc", "usdt"],
    "curve-usdt": ["dai", "usdc", "usdt"],
  };

  let deployedBalances = {
    dai: ethers.BigNumber.from(0),
    usdc: ethers.BigNumber.from(0),
    usdt: ethers.BigNumber.from(0),
  };

  const strategyAmounts = _.zipObject(
    Object.keys(strategies),
    Object.keys(strategies).map((name) => {
      const underlyers = strategies[name].sort((a, b) =>
        normalizedBalances[a].lt(normalizedBalances[b]) ? -1 : 1
      );
      const idealTotalAmount = totalBalance.mul(3).div(18);
      const idealUnderlyerAmount = idealTotalAmount.div(underlyers.length);

      let amountDeployed = ethers.BigNumber.from(0);
      let amounts = {};
      for (const i in underlyers) {
        const underlyer = underlyers[i];
        let amount = idealUnderlyerAmount;

        const remainingBalance = normalizedBalances[underlyer].sub(
          deployedBalances[underlyer]
        );

        if (i == underlyers.length - 1) {
          amount = idealTotalAmount.sub(amountDeployed);
          if (amount.gt(remainingBalance)) {
            amount = remainingBalance;
          }
        } else if (idealUnderlyerAmount.gt(remainingBalance)) {
          amount = remainingBalance;
        }

        amountDeployed = amountDeployed.add(amount);

        if (name === "usdc" || name === "usdt") {
          amounts[underlyer] = amount.div(10 ** 12);
        } else {
          amounts[underlyer] = amount;
        }

        deployedBalances[underlyer] = amount.add(deployedBalances[underlyer]);
      }

      return amounts;
    })
  );

  const totalCheck = _.reduce(
    Object.values(strategyAmounts).map((a) =>
      _.reduce(Object.values(a), (b, c) => b.add(c))
    ),
    (i, j) => i.add(j)
  );
  console.log(`Total Check: ${totalCheck}`);

  return strategyAmounts;
}

if (!module.parent) {
  main()
    .then((amounts) => {
      const output = Object.keys(amounts)
        .map((name) => {
          const amountsOutput = Object.keys(amounts[name])
            .map((underlyer) => `\n${amounts[name][underlyer]} ${underlyer}`)
            .toString();

          return `\n${name}: ${amountsOutput}\n`;
        })
        .toString();

      console.log("");
      console.log(`Amounts:${output}`);
      console.log("");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      console.log("");
      process.exit(1);
    });
} else {
  module.exports = main;
}
