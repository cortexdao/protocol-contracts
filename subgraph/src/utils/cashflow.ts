import { Cashflow } from "../../generated/schema";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";

export function loadCashflow(user: Bytes, poolAddress: Bytes): Cashflow {
  const cashflowId = poolAddress.toHexString() + user.toHexString();
  let cashflow = Cashflow.load(cashflowId);
  if (cashflow == null) {
    cashflow = new Cashflow(cashflowId);
    cashflow.total = BigInt.fromI32(0);
    cashflow.userAddress = user;
    cashflow.poolAddress = poolAddress;
  }
  return cashflow as Cashflow;
}
