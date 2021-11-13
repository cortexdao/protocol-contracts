const _ = require("lodash");
const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const { deployMockContract } = waffle;

const deepEqual = (expected, actual) => {
  const zipped = _.zip(_.flatMapDeep(expected), _.flatMapDeep(actual));
  zipped.forEach((pair) => {
    if (pair[0] === undefined || pair[1] === undefined) {
      expect.fail(pair[0], pair[1], `Expected: ${pair[0]}, Actual: ${pair[1]}`);
    }
    expect(pair[0]).to.deep.equal(pair[1]);
  });
};

/*
 * @param pool
 * @param underlyerAmount amount being transferred to LP Account.
 * Uses the same sign convention as `pool.getReserveTopUpValue`.
 */
async function updateTvlAfterTransfer(
  pool,
  underlyerAmount,
  oracleAdapter,
  emergencySafe
) {
  await oracleAdapter.connect(emergencySafe).emergencyUnlock();

  const underlyerPrice = await pool.getUnderlyerPrice();
  const underlyerAddress = await pool.underlyer();

  const underlyer = await ethers.getContractAt(
    "IDetailedERC20",
    underlyerAddress
  );
  const decimals = await underlyer.decimals();

  const underlyerUsdValue = convertToUsdValue(
    underlyerAmount,
    underlyerPrice,
    decimals
  );

  await updateTvl(underlyerUsdValue, oracleAdapter, emergencySafe);
}

function convertToUsdValue(tokenWeiAmount, tokenUsdPrice, decimals) {
  return tokenWeiAmount
    .mul(tokenUsdPrice)
    .div(ethers.BigNumber.from(10).pow(decimals));
}

async function updateTvl(usdValue, oracleAdapter, emergencySafe) {
  const newTvl = (await oracleAdapter.getTvl()).add(usdValue);
  await oracleAdapter.connect(emergencySafe).emergencySetTvl(newTvl, 50);
}

async function generateContractAddress(signer) {
  const contract = await deployMockContract(signer, []);
  return contract.address;
}

module.exports = {
  deepEqual,
  updateTvlAfterTransfer,
  generateContractAddress,
};
