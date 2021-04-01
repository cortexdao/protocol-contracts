import { Apt } from "../../generated/schema";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";

export function createAndSaveApt(
  poolAddress: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  totalValue: BigInt,
  totalSupply: BigInt
): void {
  const apt = new Apt(poolAddress.toHexString() + timestamp.toString());
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
