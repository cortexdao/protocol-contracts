import {
  DepositedAPT,
  RedeemedAPT,
  Transfer as TransferEvent,
} from "../generated/DAI_APYPoolToken/APYPoolToken";
import { TotalEthValueLocked, Transfer } from "../generated/schema";

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
}
