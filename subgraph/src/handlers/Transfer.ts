import {
  PoolTokenV2,
  Transfer as TransferEvent,
} from "../../generated/DAI_PoolToken/PoolTokenV2";
import { IDetailedERC20 } from "../../generated/DAI_PoolToken/IDetailedERC20";
import { Transfer, User, Pool } from "../../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function handleTransfer(event: TransferEvent): void {
  const poolAddress = event.address;
  const toAddress = event.params.to;
  const fromAddress = event.params.from;

  let transfer = new Transfer(
    fromAddress.toHexString() +
      toAddress.toHexString() +
      event.block.timestamp.toString() +
      event.logIndex.toString() +
      event.transaction.hash.toHexString()
  );

  transfer.poolAddress = poolAddress;
  transfer.from = fromAddress;
  transfer.to = toAddress;
  transfer.value = event.params.value;
  transfer.save();

  const contract = PoolTokenV2.bind(poolAddress);
  const underlyer = IDetailedERC20.bind(contract.underlyer());

  const priceResult = contract.try_getUnderlyerPrice();
  let price = BigInt.fromI32(0);
  if (!priceResult.reverted) {
    price = priceResult.value;
  }
  const totalValueResult = contract.try_getPoolTotalValue();
  let totalValue = BigInt.fromI32(0);
  if (!totalValueResult.reverted) {
    totalValue = totalValueResult.value;
  }

  const poolId = poolAddress.toHexString();
  const pool = Pool.load(poolId) || new Pool(poolId);
  pool.underlyerPrice = price;
  pool.underlyerSymbol = underlyer.symbol();
  pool.underlyerDecimals = underlyer.decimals();
  pool.underlyerBalance = underlyer.balanceOf(poolAddress);
  pool.totalValue = totalValue;
  pool.address = poolAddress;
  pool.aptSupply = contract.totalSupply();
  pool.save();

  const toUserId = toAddress.toHexString() + poolAddress.toHexString();
  const toUser = User.load(toUserId) || new User(toUserId);
  toUser.poolAddress = poolAddress;
  toUser.address = toAddress;

  let balance = contract.balanceOf(toAddress);
  let result = contract.try_getAPTValue(balance);
  let ethValue = BigInt.fromI32(0);
  if (!result.reverted) {
    ethValue = result.value;
  }

  toUser.accountBalance = balance;
  toUser.accountValue = ethValue;
  toUser.save();

  const fromUserId = fromAddress.toHexString() + poolAddress.toHexString();
  const fromUser = User.load(fromUserId) || new User(fromUserId);
  fromUser.poolAddress = poolAddress;
  fromUser.address = fromAddress;

  balance = contract.balanceOf(fromAddress);
  result = contract.try_getAPTValue(balance);
  ethValue = BigInt.fromI32(0);
  if (!result.reverted) {
    ethValue = result.value;
  }

  fromUser.accountBalance = balance;
  fromUser.accountValue = ethValue;
  fromUser.save();
}
