import { Apt, Cashflow, CashflowPoint } from "../../generated/schema";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

export function createAndSaveApt(
  poolAddress: Address,
  timestamp: BigInt,
  blockNumber: BigInt,
  totalValue: BigInt,
  totalSupply: BigInt
): void {
  const aptId = getAptId(poolAddress, timestamp);
  const apt = new Apt(aptId);
  apt.timestamp = timestamp;
  apt.blockNumber = blockNumber;
  apt.poolAddress = poolAddress;
  apt.totalValue = totalValue;
  apt.totalSupply = totalSupply;
  if (!apt.totalSupply.isZero())
    apt.price = apt.totalValue
      .times(BigInt.fromI32(10).pow(18 as u8))
      .div(apt.totalSupply);
  apt.save();
}

export function getAptId(poolAddress: Address, timestamp: BigInt): string {
  return poolAddress.toHexString() + timestamp.toString();
}

export function loadCashflow(
  userAddress: Address,
  poolAddress: Address
): Cashflow {
  const cashflowId = getCashflowId(userAddress, poolAddress);
  let cashflow = Cashflow.load(cashflowId);
  if (cashflow == null) {
    cashflow = new Cashflow(cashflowId);
    cashflow.total = BigInt.fromI32(0);
    cashflow.userAddress = userAddress;
    cashflow.poolAddress = poolAddress;
  }
  return cashflow as Cashflow;
}

export function getCashflowId(
  userAddress: Address,
  poolAddress: Address
): string {
  return poolAddress.toHexString() + userAddress.toHexString();
}

export function createCashFlowPoint(
  poolAddress: Address,
  userAddress: Address,
  timestamp: BigInt
): CashflowPoint {
  const cashflowPointId = getCashflowPointId(
    poolAddress,
    userAddress,
    timestamp
  );
  const cashflowPoint = new CashflowPoint(cashflowPointId);
  return cashflowPoint;
}

export function getCashflowPointId(
  poolAddress: Address,
  userAddress: Address,
  timestamp: BigInt
): string {
  return (
    poolAddress.toHexString() + userAddress.toHexString() + timestamp.toString()
  );
}
