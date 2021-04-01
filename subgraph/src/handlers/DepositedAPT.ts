import {
  PoolTokenV2,
  DepositedAPT,
} from "../../generated/DAI_PoolToken/PoolTokenV2";
import { IDetailedERC20 } from "../../generated/DAI_PoolToken/IDetailedERC20";
import { AggregatorV3Interface } from "../../generated/DAI_PoolToken/AggregatorV3Interface";
import { CashflowPoint } from "../../generated/schema";
import { Address, BigInt, dataSource } from "@graphprotocol/graph-ts";
import {
  createAndSaveApt,
  createCashFlowPoint,
  loadCashflow,
} from "../utils/entities";
import { getEthUsdAggregator } from "../utils/chainlink";

export function handleDepositedAPT(event: DepositedAPT): void {
  const userAddress: Address = event.params.sender;
  const timestamp: BigInt = event.block.timestamp;
  const blockNumber: BigInt = event.block.number;
  const poolAddress: Address = event.address;

  const contract = PoolTokenV2.bind(poolAddress);
  const underlyer = IDetailedERC20.bind(contract.underlyer());
  const priceAgg = AggregatorV3Interface.bind(contract.priceAgg());
  const ethUsdAgg: AggregatorV3Interface = getEthUsdAggregator(
    dataSource.network()
  );

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

  const cashflow = loadCashflow(userAddress, poolAddress);

  const cashflowPoint = createCashFlowPoint(
    poolAddress,
    userAddress,
    timestamp
  );
  cashflowPoint.userAddress = userAddress;
  cashflowPoint.poolAddress = poolAddress;
  cashflowPoint.timestamp = timestamp;
  cashflowPoint.blockNumber = blockNumber;
  cashflowPoint.userAptBalance = contract.balanceOf(userAddress);

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
    const decimals = underlyer.decimals() as u8;
    const outflow = event.params.tokenAmount
      .times(price)
      .div(BigInt.fromI32(10).pow(decimals));

    cashflow.total = cashflow.total.minus(outflow);
    cashflowPoint.total = cashflow.total;
  }

  cashflow.save();
  cashflowPoint.save();
}
