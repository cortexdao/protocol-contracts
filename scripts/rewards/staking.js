#!/usr/bin/env node

const { argv } = require("yargs")
  .option("amount", {
    type: "number",
    default: 35000,
    description:
      'Amount in token ("big") units to send to each staking contract',
  })
  .option("dryRun", {
    type: "boolean",
    description: "Simulates transactions to estimate ETH cost",
  })
  .option("fund", {
    type: "boolean",
    description: "fund staking contracts with APY",
  })
  .option("update", {
    type: "boolean",
    description: "update rewards rate on staking contracts",
  })
  .option("gasPrice", {
    type: "number",
    description: "Gas price in gwei; omitting uses EthGasStation value",
  });
const hre = require("hardhat");
const { network, ethers } = hre;
const {
  tokenAmountToBigNumber,
  getDeployedAddress,
  getGasPrice,
} = require("../../utils/helpers");

// deployments were done through Remix
const BALANCERPOOL_ABI = require("../abi/balancerpool.json");
const UNIPOOL_ABI = require("../abi/unipool.json");
const BALANCER_STAKING_ADDRESS = "0xFe82ea0Ef14DfdAcd5dB1D49F563497A1a751bA1";
const UNISWAP_STAKING_ADDRESS = "0x0310DEE97b42063BbB46d02a674727C13eb79cFD";

async function main(argv) {
  await hre.run("compile");
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const TOKEN_MNEMONIC = process.env.TOKEN_MNEMONIC;
  const STAKING_MNEMONIC = process.env.STAKING_MNEMONIC;
  if (!TOKEN_MNEMONIC || !STAKING_MNEMONIC) {
    throw new Error("Must set STAKING_MNEMONIC and TOKEN_MNEMONIC env vars.");
  }
  const apyTokenDeployer = ethers.Wallet.fromMnemonic(TOKEN_MNEMONIC).connect(
    ethers.provider
  );
  console.log("APY Token deployer:", apyTokenDeployer.address);
  const stakingDeployer = ethers.Wallet.fromMnemonic(STAKING_MNEMONIC).connect(
    ethers.provider
  );
  console.log("Staking deployer:", stakingDeployer.address);
  console.log("");

  if (!argv.dryRun && !argv.fund && !argv.update) {
    console.error("--dry-run or --fund or --update must be selected.");
    console.log("");
    process.exit(1);
  }

  const amount = tokenAmountToBigNumber(argv.amount, "18");

  const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
  const apyTokenAddress = getDeployedAddress(
    "GovernanceTokenProxy",
    NETWORK_NAME
  );
  const token = await GovernanceToken.attach(apyTokenAddress).connect(
    apyTokenDeployer
  );

  if (argv.dryRun) {
    console.log("");
    console.log("Doing a dry run ...");
    console.log("");

    console.log(
      "Token amount (wei):",
      amount.toString(),
      `(length: ${amount.toString().length})`
    );
    console.log("");

    let gasEstimate = await token.estimateGas.transfer(
      BALANCER_STAKING_ADDRESS,
      amount
    );
    gasEstimate = gasEstimate.add(
      await token.estimateGas.transfer(UNISWAP_STAKING_ADDRESS, amount)
    );
    const gasPrice = await getGasPrice(argv.gasPrice);
    const ethCost = gasEstimate.mul(gasPrice).toString() / 1e18;
    console.log("Estimated ETH cost:", ethCost.toString());

    const balance =
      (await ethers.provider.getBalance(apyTokenDeployer.address)).toString() /
      1e18;
    console.log("Current ETH balance for token deployer:", balance.toString());
    console.log("");
  } else if (argv.fund) {
    let gasPrice = await getGasPrice(argv.gasPrice);
    console.log("");

    const bTx = await token.transfer(BALANCER_STAKING_ADDRESS, amount, {
      gasPrice: gasPrice,
    });
    console.log("Etherscan:", `https://etherscan.io/tx/${bTx.hash}`);
    await bTx.wait();
    console.log(`Transferred ${amount} tokens to ${BALANCER_STAKING_ADDRESS}`);

    // retrieve gas price again, in case it has moved
    gasPrice = await getGasPrice(argv.gasPrice);
    console.log("");

    const uTx = await token.transfer(UNISWAP_STAKING_ADDRESS, amount, {
      gasPrice: gasPrice,
    });
    console.log("Etherscan:", `https://etherscan.io/tx/${uTx.hash}`);
    await uTx.wait();
    console.log(`Transferred ${amount} tokens to ${UNISWAP_STAKING_ADDRESS}`);
    console.log("");
  }

  const balancerpool = (
    await ethers.getContractAt(BALANCERPOOL_ABI, BALANCER_STAKING_ADDRESS)
  ).connect(stakingDeployer);
  const unipool = (
    await ethers.getContractAt(UNIPOOL_ABI, UNISWAP_STAKING_ADDRESS)
  ).connect(stakingDeployer);

  if (argv.dryRun) {
    let gasEstimate = await balancerpool.estimateGas.notifyRewardAmount(amount);
    gasEstimate = gasEstimate.add(
      await unipool.estimateGas.notifyRewardAmount(amount)
    );
    const gasPrice = await getGasPrice(argv.gasPrice);
    const ethCost = gasEstimate.mul(gasPrice).toString() / 1e18;
    console.log("Estimated ETH cost:", ethCost.toString());

    const balance =
      (await ethers.provider.getBalance(stakingDeployer.address)).toString() /
      1e18;
    console.log(
      "Current ETH balance for staking deployer:",
      balance.toString()
    );
    console.log("");

    const balPeriodFinish = await balancerpool.periodFinish();
    const balFinishDate = new Date(balPeriodFinish * 1000);
    console.log("Balancer period finish:", balFinishDate.toUTCString());
    console.log("Balancer period finish:", balFinishDate.toLocaleString());
    console.log("");

    const uniPeriodFinish = await unipool.periodFinish();
    const uniFinishDate = new Date(uniPeriodFinish * 1000);
    console.log("Uniswap period finish:", uniFinishDate.toUTCString());
    console.log("Uniswap period finish:", uniFinishDate.toLocaleString());
  } else if (argv.update) {
    // retrieve gas price again, in case it has moved
    let gasPrice = await getGasPrice(argv.gasPrice);
    console.log("");

    const bNotifyTx = await balancerpool.notifyRewardAmount(amount, {
      gasPrice: gasPrice,
    });
    console.log("Etherscan:", `https://etherscan.io/tx/${bNotifyTx.hash}`);
    await bNotifyTx.wait();
    console.log("Called `notifyRewardAmount` on Balancerpool.");

    // retrieve gas price again, in case it has moved
    gasPrice = await getGasPrice(argv.gasPrice);
    console.log("");

    const uNotifyTx = await unipool.notifyRewardAmount(amount, {
      gasPrice: gasPrice,
    });
    console.log("Etherscan:", `https://etherscan.io/tx/${uNotifyTx.hash}`);
    await uNotifyTx.wait();
    console.log("Called `notifyRewardAmount` on Unipool.");
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      if (argv.dryRun) {
        console.log("Finished dry-run.");
      } else {
        if (argv.fund) {
          console.log("Staking contracts funded with APY.");
        } else if (argv.update) {
          console.log("Staking rewards rate updated.");
        }
      }
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
