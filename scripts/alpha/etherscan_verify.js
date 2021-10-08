#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses GasNow value",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { getDeployedAddress } = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  if (!["KOVAN", "MAINNET"].includes(networkName)) return;

  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const alphaDeploymentAddress = await getDeployedAddress(
    "AlphaDeployment",
    networkName
  );
  const alphaDeployment = await ethers.getContractAt(
    "AlphaDeployment",
    alphaDeploymentAddress
  );

  // const addressRegistryV2Address = await alphaDeployment.addressRegistryV2();
  // await hre.run("verify:verify", {
  //   address: addressRegistryV2Address,
  // });

  // const poolTokenV2Address = await alphaDeployment.poolTokenV2();
  // await hre.run("verify:verify", {
  //   address: poolTokenV2Address,
  // });
  //
  // await hre.run("verify:verify", {
  //   address: "0x687ef0ce82a681c13807ae7a7518a70a147c22d8",
  //   constructorArguments: [
  //     "0xf96ee7aa6bba62004629fbffbc2c7d160f6290df",
  //     "0x792da6df6bbdcc84c23235a6bef43921d81169b7",
  //     ethers.utils.hexlify(
  //       "0xc0c53b8b000000000000000000000000792da6df6bbdcc84c23235a6bef43921d81169b70000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000cafecafecafecafecafecafecafecafecafecafe"
  //     ),
  //   ],
  // });
  // await hre.run("verify:verify", {
  //   address: "0x34a9860a7f80e37105e6cf4d1e1e596fe6ff9b70",
  //   constructorArguments: [
  //     "0xf96ee7aa6bba62004629fbffbc2c7d160f6290df",
  //     "0x792da6df6bbdcc84c23235a6bef43921d81169b7",
  //     ethers.utils.hexlify(
  //       "0xc0c53b8b000000000000000000000000792da6df6bbdcc84c23235a6bef43921d81169b7000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000cafecafecafecafecafecafecafecafecafecafe"
  //     ),
  //   ],
  // });
  // await hre.run("verify:verify", {
  //   address: "0x26b8E441d7c0d0cc8b43Ad89e57e37613163e0CE",
  //   constructorArguments: [
  //     "0xf96ee7aa6bba62004629fbffbc2c7d160f6290df",
  //     "0x792da6df6bbdcc84c23235a6bef43921d81169b7",
  //     ethers.utils.hexlify(
  //       "0xc0c53b8b000000000000000000000000792da6df6bbdcc84c23235a6bef43921d81169b7000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000cafecafecafecafecafecafecafecafecafecafe"
  //     ),
  //   ],
  // });
  const addressRegistryProxyAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  // const tvlManagerAddress = await alphaDeployment.tvlManager();
  // await hre.run("verify:verify", {
  //   address: tvlManagerAddress,
  //   constructorArguments: [addressRegistryProxyAddress],
  // });
  //
  //

  // const oracleAdapterAddress = await alphaDeployment.oracleAdapter();
  // await hre.run("verify:verify", {
  //   address: oracleAdapterAddress,
  //   constructorArguments: [
  //     addressRegistryProxyAddress,
  //     "0xdb299d394817d8e7bbe297e84afff7106cf92f5f",
  //     [
  //       "0x6b175474e89094c44da98b954eedeac495271d0f",
  //       "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  //       "0xdac17f958d2ee523a2206206994597c13d831ec7",
  //     ],
  //     [
  //       "0xaed0c38402a5d19df6e4c03f4e2dced6e29c1ee9",
  //       "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6",
  //       "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
  //     ],
  //     86400,
  //     270,
  //   ],
  // });

  // 0xbd720da5
  // 000000000000000000000000f436d39c9f75412e0116ef76a6e3501b4784c3f5
  // 0000000000000000000000002641ad5127fed5b829465eed7618b3798ba1283c
  // 0000000000000000000000000000000000000000000000000000000000000060
  // 0000000000000000000000000000000000000000000000000000000000000044
  // 485cc9550000000000000000000000002641ad5127fed5b829465eed7618b3798ba1283c0000000000000000000000007ec81b7035e91f8435bdeb2787dcbd51116ad30300000000000000000000000000000000000000000000000000000000;
  //
  //
  //
  // 0xbd720da5
  // 000000000000000000000000f96ee7aa6bba62004629fbffbc2c7d160f6290df
  // 000000000000000000000000792da6df6bbdcc84c23235a6bef43921d81169b7
  // 0000000000000000000000000000000000000000000000000000000000000060
  // 0000000000000000000000000000000000000000000000000000000000000064
  // c0c53b8b000000000000000000000000792da6df6bbdcc84c23235a6bef43921d81169b70000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000cafecafecafecafecafecafecafecafecafecafe00000000000000000000000000000000000000000000000000000000
  // const mAptAddress = await alphaDeployment.mApt();
  // let [logicAddress, proxyAdminAddress] = await getEip1967Slots(mAptAddress);
  // const MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");
  // let initData = MetaPoolToken.interface.encodeFunctionData(
  //   "initialize(address,address)",
  //   [proxyAdminAddress, addressRegistryProxyAddress]
  // );
  // console.log(logicAddress);
  // console.log(proxyAdminAddress);
  // console.log(initData);
  // await hre.run("verify:verify", {
  //  address: mAptAddress,
  //   constructorArguments: [logicAddress, proxyAdminAddress, initData],
  // });

  // await hre.run("verify:verify", {
  //   address: "0xf436d39c9f75412e0116ef76a6e3501b4784c3f5",
  // });

  // await hre.run("verify:verify", {
  //   address: "0x7b4fb7ebfbc3976255c458790797b534ffa7ef7d",
  //   constructorArguments: [addressRegistryProxyAddress],
  // });

  // 0xbd720da5
  // 000000000000000000000000a8edde01e933231e7af43913bc3e075b80f5e1fc
  // 000000000000000000000000207e7a1ead74c86cff8d37f813a04f4f8252e096
  // 0000000000000000000000000000000000000000000000000000000000000060
  // 0000000000000000000000000000000000000000000000000000000000000044
  // 485cc955000000000000000000000000207e7a1ead74c86cff8d37f813a04f4f8252e0960000000000000000000000007ec81b7035e91f8435bdeb2787dcbd51116ad30300000000000000000000000000000000000000000000000000000000
  const lpAccountAddress = await alphaDeployment.lpAccount();
  [logicAddress, proxyAdminAddress] = await getEip1967Slots(lpAccountAddress);
  const LpAccount = await ethers.getContractFactory("LpAccount");
  initData = LpAccount.interface.encodeFunctionData(
    "initialize(address,address)",
    [proxyAdminAddress, addressRegistryProxyAddress]
  );
  console.log(logicAddress);
  console.log(proxyAdminAddress);
  console.log(initData);
  // await hre.run("verify:verify", {
  //   address: lpAccountAddress,
  //   constructorArguments: [logicAddress, proxyAdminAddress, initData],
  // });
  await hre.run("verify:verify", {
    address: logicAddress,
  });
}

async function getEip1967Slots(proxyAddress) {
  // get logic address from slot specified by EIP-1967
  let logicAddress = await ethers.provider.getStorageAt(
    proxyAddress,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  );
  logicAddress = ethers.utils.getAddress(logicAddress.slice(-40));
  // get admin address from slot specified by EIP-1967
  let proxyAdminAddress = await ethers.provider.getStorageAt(
    proxyAddress,
    "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
  );
  proxyAdminAddress = ethers.utils.getAddress(proxyAdminAddress.slice(-40));

  return [logicAddress, proxyAdminAddress];
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Verification successful.");
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
