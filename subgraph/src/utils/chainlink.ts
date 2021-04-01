import { AggregatorV3Interface } from "../../generated/DAI_PoolToken/AggregatorV3Interface";
import { Address, BigInt } from "@graphprotocol/graph-ts";

export function getEthUsdAggregator(network: string): AggregatorV3Interface {
  let ethUsdAgg: AggregatorV3Interface;
  if (network == "mainnet") {
    ethUsdAgg = AggregatorV3Interface.bind(
      Address.fromString("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419")
    );
  } else if (network == "kovan") {
    ethUsdAgg = AggregatorV3Interface.bind(
      Address.fromString("0x9326BFA02ADD2366b30bacB125260Af641031331")
    );
  } else {
    throw new Error("Network not recognized: must be 'mainnet' or 'kovan'.");
  }
  return ethUsdAgg;
}

export function getPriceFromAgg(aggContract: AggregatorV3Interface): BigInt {
  const roundDataResult = aggContract.try_latestRoundData();
  let price = BigInt.fromI32(0);
  if (!roundDataResult.reverted) {
    price = roundDataResult.value.value1;
  }
  return price;
}
