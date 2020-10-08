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

  let userId = event.params.sender.toHexString() + event.address.toHexString();

  let user = User.load(userId);
  if (user === null) {
    user = new User(userId);
  }

  user.poolAddress = event.address;
  user.address = event.params.sender;

  let contract = APYPoolToken.bind(event.address);
  let balance = contract.balanceOf(event.params.sender);
  let result = contract.try_getAPTEthValue(balance);

  let ethValue = BigInt.fromI32(0);
  if (!result.reverted) {
    ethValue = result.value;
  }

  user.save();
}

export function handleTransfer(event: TransferEvent): void {
  let transfer = new Transfer(
    event.params.from.toHexString() +
      event.params.to.toHexString() +
      event.block.timestamp.toString() +
      event.logIndex.toString() +
      event.transaction.hash.toHexString()
  );
  transfer.poolAddress = event.address;
  transfer.from = event.params.from;
  transfer.to = event.params.to;
  transfer.value = event.params.value;
  transfer.save();

  let userId = event.params.to.toHexString() + event.address.toHexString();

  let user = User.load(userId);
  if (user === null) {
    user = new User(userId);
  }

  user.poolAddress = event.address;
  user.address = event.params.to;

  let contract = APYPoolToken.bind(event.address);
  let balance = contract.balanceOf(event.params.to);
  let result = contract.try_getAPTEthValue(balance);

  let ethValue = BigInt.fromI32(0);
  if (!result.reverted) {
    ethValue = result.value;
  }

  user.accountValue = ethValue;

  user.save();
}
