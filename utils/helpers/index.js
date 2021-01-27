const hre = require("hardhat");
const { ethers, web3 } = hre;
const { AddressZero: ZERO_ADDRESS, MaxUint256: MAX_UINT256 } = ethers.constants;
const {
  getDeployedAddress,
  getStablecoinAddress,
  updateDeployJsons,
} = require("./address");
const { expectEventInTransaction } = require("./event");
const { getGasPrice } = require("./gas");
const {
  acquireToken,
  mintERC20Tokens,
  transferERC20Tokens,
  getERC20Balance,
} = require("./token");
const {
  bytes32,
  dai,
  erc20,
  tokenAmountToBigNumber,
  undoErc20,
} = require("./unit");

console.debug = function () {
  if (!console.debugging) return;
  console.log.apply(this, arguments);
};

console.debugging = false;

const FAKE_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);
const ANOTHER_FAKE_ADDRESS = web3.utils.toChecksumAddress(
  "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
);

module.exports = {
  bytes32,
  dai,
  erc20,
  mintERC20Tokens,
  transferERC20Tokens,
  getERC20Balance,
  undoErc20,
  console,
  updateDeployJsons,
  getDeployedAddress,
  getStablecoinAddress,
  tokenAmountToBigNumber,
  getGasPrice,
  acquireToken,
  expectEventInTransaction,
  ZERO_ADDRESS,
  MAX_UINT256,
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
};
