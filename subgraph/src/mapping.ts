import {
  APYPoolToken,
  DepositedAPT,
  RedeemedAPT,
  Transfer as TransferEvent,
} from "../generated/DAI_APYPoolToken/APYPoolToken";
import { TotalEthValueLocked, Transfer, User } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function handleDepositedAPT(event: DepositedAPT): void {
  let tvl = new TotalEthValueLocked(
    event.params.sender.toHexString() +
      event.block.timestamp.toString() +
      event.logIndex.toString() +
      event.transaction.hash.toHexString()
  );
  tvl.timestamp = event.block.timestamp;
  tvl.poolAddress = event.address;
  tvl.totalEthValueLocked = event.params.totalEthValueLocked;
  tvl.save();
}

export function handleRedeemedAPT(event: RedeemedAPT): void {
  let tvl = new TotalEthValueLocked(
    event.params.sender.toHexString() +
      event.block.timestamp.toString() +
      event.logIndex.toString() +
      event.transaction.hash.toHexString()
  );
  tvl.timestamp = event.block.timestamp;
  tvl.poolAddress = event.address;
  tvl.totalEthValueLocked = event.params.totalEthValueLocked;
  tvl.save();
}

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

  const contract = APYPoolToken.bind(poolAddress);

  for (let userAddress of [toAddress, fromAddress]) {
    const userId = toAddress.toHexString() + poolAddress.toHexString();
    const user = User.load(userId) || new User(userId);
    user.poolAddress = poolAddress;
    user.address = userAddress;

    const balance = contract.balanceOf(userAddress);
    const result = contract.try_getAPTEthValue(balance);
    let ethValue = BigInt.fromI32(0);
    if (!result.reverted) {
      ethValue = result.value;
    }

    user.accountValue = ethValue;
    user.save();
  }
}
