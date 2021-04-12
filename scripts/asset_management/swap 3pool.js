#!/usr/bin/env node
/**
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js
 *
 * You can modify the script to handle command-line args and retrieve them
 * through the `argv` object.  Values are passed like so:
 *
 * $ HARDHAT_NETWORK=localhost node scripts/1_deployments.js --arg1=val1 --arg2=val2
 *
 * Remember, you should have started the forked mainnet locally in another terminal:
 *
 * $ MNEMONIC='' yarn fork:mainnet
 */
const { program } = require("commander");
const hre = require("hardhat");
const { ethers, network } = hre;
const { getStrategyAccountInfo, getAccountManager } = require("./utils");
const { getStablecoinAddress } = require("../../utils/helpers");
const { BigNumber } = ethers;

class RuntimeError extends Error {
  constructor(message, exitStatus) {
    super(message);
    this.name = "RuntimeError";
    this.exitStatus = exitStatus;
  }
}

const NETWORK_NAME = network.name.toUpperCase();

const CURVE_3POOL_ABI = [
  {
    name: "exchange",
    outputs: [],
    inputs: [
      { type: "int128", name: "i" },
      { type: "int128", name: "j" },
      { type: "uint256", name: "dx" },
      { type: "uint256", name: "min_dy" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

async function main(options) {
  const inputSymbol = options.inputSymbol;
  const outputSymbol = options.outputSymbol;
  const amount = options.amount;
  const result = await swap3Pool(inputSymbol, outputSymbol, amount);
  return result.toString();
}

async function swap3Pool(inputSymbol, outputSymbol, amount) {
  const inputTokenAddress = getStablecoinAddress(inputSymbol, NETWORK_NAME);
  const inputToken = await ethers.getContractAt(
    "IDetailedERC20",
    inputTokenAddress
  );
  const outputTokenAddress = getStablecoinAddress(outputSymbol, NETWORK_NAME);
  const outputToken = await ethers.getContractAt(
    "IDetailedERC20",
    outputTokenAddress
  );
  const inputAmount = BigNumber.from(amount);
  const minOutputAmount = BigNumber.from(0);
  const inputIndex = getCoinIndex(inputSymbol);
  const outputIndex = getCoinIndex(outputSymbol);

  const [accountId] = await getStrategyAccountInfo(NETWORK_NAME);
  const accountManager = await getAccountManager(NETWORK_NAME);

  const iface = new ethers.utils.Interface(CURVE_3POOL_ABI);
  const encodedApprove = iface.encodeFunctionData("approve(address,uint256)", [
    CURVE_3POOL_ADDRESS,
    inputAmount,
  ]);
  const encodedExchange = iface.encodeFunctionData(
    "exchange(int128,int128,uint256,uint256)",
    [inputIndex, outputIndex, inputAmount, minOutputAmount]
  );
  const steps = [
    [inputTokenAddress, encodedApprove],
    [CURVE_3POOL_ADDRESS, encodedExchange],
  ];
  await accountManager.execute(accountId, steps, []);
}

const getCoinIndex = (symbol) => {
  symbol = symbol.toLowerCase().trim();
  switch (symbol) {
    case "dai":
      return 0;
      break;
    case "usdc":
      return 1;
      break;
    case "usdt":
      return 2;
      break;
    default:
      throw new RuntimeError("Symbol not recognized.", 2);
  }
};

if (!module.parent) {
  program.parse(process.argv);
  program.requiredOption(
    "-i, --input-symbol <string>",
    "Input stablecoin symbol"
  );
  program.requiredOption(
    "-o, --output-symbol <string>",
    "Output stablecoin symbol"
  );
  program.requiredOption("-a, --amount <string>", "Input token amount");
  const options = program.opts();
  main(options)
    .then((result) => {
      if (!(typeof result === "string" || result instanceof Buffer)) {
        process.exit(1);
      }
      process.stdout.write(result);
      process.exit(0);
    })
    .catch((error) => {
      const exitStatus = error.exitStatus || 1;
      process.exit(exitStatus);
    });
} else {
  // if importing in another script
  module.exports = swap3Pool;
}
