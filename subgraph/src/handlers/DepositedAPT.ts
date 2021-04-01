import {
  PoolTokenV2,
  DepositedAPT,
  RedeemedAPT,
  Transfer as TransferEvent,
} from "../../generated/DAI_PoolToken/PoolTokenV2";
import { IDetailedERC20 } from "../../generated/DAI_PoolToken/IDetailedERC20";
import { AggregatorV3Interface } from "../../generated/DAI_PoolToken/AggregatorV3Interface";
import {
  Apt,
  Cashflow,
  CashflowPoint,
  Transfer,
  User,
  Pool,
} from "../../generated/schema";
import { Address, BigInt, Bytes, dataSource } from "@graphprotocol/graph-ts";
import { loadCashflow } from "../utils/cashflow";
import { createAndSaveApt } from "../utils/apt";

export function handleDepositedAPT(event: DepositedAPT): void {
  const sender = event.params.sender;
  const timestamp = event.block.timestamp;
  const blockNumber = event.block.number;
  const poolAddress = event.address;

  const contract = PoolTokenV2.bind(poolAddress);
  const underlyer = IDetailedERC20.bind(contract.underlyer());
  const priceAgg = AggregatorV3Interface.bind(contract.priceAgg());
  let ethUsdAgg: AggregatorV3Interface;
  if (dataSource.network() == "mainnet") {
    ethUsdAgg = AggregatorV3Interface.bind(
      Address.fromString("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419")
    );
  } else if (dataSource.network() == "kovan") {
    ethUsdAgg = AggregatorV3Interface.bind(
      Address.fromString("0x9326BFA02ADD2366b30bacB125260Af641031331")
    );
  } else {
    throw new Error("Network not recognized: must be 'mainnet' or 'kovan'.");
  }

  let totalValue = event.params.totalEthValueLocked;
  if (priceAgg.decimals() == 18) {
    const roundDataResult = ethUsdAgg.try_latestRoundData();
    let ethUsdPrice = BigInt.fromI32(0);
    if (!roundDataResult.reverted) {
      ethUsdPrice = roundDataResult.value.value1;
    }
    totalValue = totalValue
      .times(ethUsdPrice)
      .div(BigInt.fromI32(10).pow(18 as u8));
  } else if (priceAgg.decimals() != 8) {
    throw new Error("Price aggregator decimals must be 18 or 8.");
  }

  const totalSupply = contract.totalSupply();

  createAndSaveApt(
    poolAddress,
    timestamp,
    blockNumber,
    totalValue,
    totalSupply
  );

  const user = sender;
  const cashflow = loadCashflow(user, poolAddress);

  const cashflowPointId =
    poolAddress.toHexString() + user.toHexString() + timestamp.toString();
  const cashflowPoint = new CashflowPoint(cashflowPointId);
  cashflowPoint.userAddress = user;
  cashflowPoint.poolAddress = poolAddress;
  cashflowPoint.timestamp = timestamp;
  cashflowPoint.blockNumber = blockNumber;
  cashflowPoint.userAptBalance = contract.balanceOf(user);

  const priceResult = contract.try_getUnderlyerPrice();
  let price = BigInt.fromI32(0);
  if (!priceResult.reverted) {
    price = priceResult.value;
    if (priceAgg.decimals() == 18) {
      const roundDataResult = ethUsdAgg.try_latestRoundData();
      let ethUsdPrice = BigInt.fromI32(0);
      if (!roundDataResult.reverted) {
        ethUsdPrice = roundDataResult.value.value1;
      }
      price = price.times(ethUsdPrice).div(BigInt.fromI32(10).pow(18 as u8));
    }
  }
  const decimals = underlyer.decimals() as u8;
  const outflow = event.params.tokenAmount
    .times(price)
    .div(BigInt.fromI32(10).pow(decimals));

  cashflow.total = cashflow.total.minus(outflow);
  cashflowPoint.total = cashflow.total;

  cashflow.save();
  cashflowPoint.save();
}
