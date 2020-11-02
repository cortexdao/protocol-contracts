import {
  APYPoolToken,
  DepositedAPT,
  RedeemedAPT,
  Transfer as TransferEvent,
} from "../generated/DAI_APYPoolToken/APYPoolToken";
import {ERC20UpgradeSafe} from "../generated/DAI_APYPoolToken/ERC20UpgradeSafe";
import { TotalEthValueLocked, Transfer, User, TokenEthPrice } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function handleDepositedAPT(event: DepositedAPT): void {
  let tvl = new TotalEthValueLocked(
    event.params.sender.toHexString() +
      event.block.timestamp.toString() +
      event.logIndex.toString() +
      event.transaction.hash.toHexString()
  );
  tvl.timestamp = event.block.timestamp;
  tvl.sequenceNumber = (event.block.timestamp * BigInt.fromI32(100000000)) + event.logIndex;
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
  tvl.sequenceNumber = (event.block.timestamp * BigInt.fromI32(100000000)) + event.logIndex;
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
  const underlyer = ERC20UpgradeSafe.bind(contract.underlyer());

  const priceResult = contract.try_getTokenEthPrice();
  let price = BigInt.fromI32(0);
  if (!priceResult.reverted) {
    price = priceResult.value;
  }

  const priceId = poolAddress.toHexString();
  const tokenEthPrice = TokenEthPrice.load(priceId) || new TokenEthPrice(priceId);
  tokenEthPrice.price = price;
  tokenEthPrice.symbol = underlyer.symbol();
  tokenEthPrice.decimals = underlyer.decimals();
  tokenEthPrice.poolUnderlyerBalance = underlyer.balanceOf(poolAddress);
  tokenEthPrice.poolAddress = poolAddress;
  tokenEthPrice.aptSupply = contract.totalSupply();
  tokenEthPrice.save();

  const toUserId = toAddress.toHexString() + poolAddress.toHexString();
  const toUser = User.load(toUserId) || new User(toUserId);
  toUser.poolAddress = poolAddress;
  toUser.address = toAddress;

  let balance = contract.balanceOf(toAddress);
  let result = contract.try_getAPTEthValue(balance);
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
  result = contract.try_getAPTEthValue(balance);
  ethValue = BigInt.fromI32(0);
  if (!result.reverted) {
    ethValue = result.value;
  }

  fromUser.accountBalance = balance;
  fromUser.accountValue = ethValue;
  fromUser.save();
}
