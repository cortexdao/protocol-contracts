import {
  PoolTokenV2,
  DepositedAPT,
  RedeemedAPT,
  Transfer as TransferEvent,
} from "../generated/DAI_PoolToken/PoolTokenV2";
import { IDetailedERC20 } from "../generated/DAI_PoolToken/IDetailedERC20";
import { Claimed } from "../generated/RewardDistributor/RewardDistributor";
import {
  Apt,
  Cashflow,
  CashflowPoint,
  Transfer,
  User,
  Pool,
  AccountClaim,
} from "../generated/schema";
import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export function handleDepositedAPT(event: DepositedAPT): void {
  const sender = event.params.sender;
  const timestamp = event.block.timestamp;
  const blockNumber = event.block.number;
  const poolAddress = event.address;
  const totalValue = event.params.totalEthValueLocked;

  const contract = PoolTokenV2.bind(poolAddress);

  const priceResult = contract.try_getUnderlyerPrice();
  let price = BigInt.fromI32(0);
  if (!priceResult.reverted) {
    price = priceResult.value;
  }

  const apt = new Apt(poolAddress.toHexString() + timestamp.toString());
  apt.timestamp = timestamp;
  apt.blockNumber = blockNumber;
  apt.poolAddress = poolAddress;
  apt.totalValue = totalValue;
  apt.totalSupply = contract.totalSupply();
  if (!apt.totalSupply.isZero())
    apt.price =
      new BigDecimal(apt.totalValue) / new BigDecimal(apt.totalSupply);
  apt.save();

  // Cashflow entity
  const user = sender;
  const cashflowId = poolAddress.toHexString() + user.toHexString();
  const cashflowPointId =
    poolAddress.toHexString() +
    user.toHexString() +
    timestamp.toString();
  let cashflow = Cashflow.load(cashflowId);
  if (cashflow == null) {
    cashflow = new Cashflow(cashflowId);
    cashflow.total = BigInt.fromI32(0);
    cashflow.userAddress = user;
    cashflow.poolAddress = poolAddress;
  }

  const cashflowPoint = new CashflowPoint(cashflowPointId);
  cashflowPoint.userAddress = user;
  cashflowPoint.poolAddress = poolAddress;
  cashflowPoint.timestamp = timestamp;
  cashflowPoint.blockNumber = blockNumber;
  cashflowPoint.userAptBalance = contract.balanceOf(user);

  const outflow = event.params.tokenAmount.times(price);
  cashflow.total = cashflow.total.minus(outflow);
  cashflowPoint.total = cashflow.total;

  cashflow.save();
  cashflowPoint.save();
}

export function handleRedeemedAPT(event: RedeemedAPT): void {
  const sender = event.params.sender;
  const timestamp = event.block.timestamp;
  const blockNumber = event.block.number;
  const poolAddress = event.address;
  const totalValue = event.params.totalEthValueLocked;

  const contract = PoolTokenV2.bind(poolAddress);

  const priceResult = contract.try_getUnderlyerPrice();
  let price = BigInt.fromI32(0);
  if (!priceResult.reverted) {
    price = priceResult.value;
  }

  const apt = new Apt(poolAddress.toHexString() + timestamp.toString());
  apt.timestamp = timestamp;
  apt.blockNumber = blockNumber;
  apt.poolAddress = poolAddress;
  apt.totalValue = totalValue;
  apt.totalSupply = contract.totalSupply();
  if (!apt.totalSupply.isZero())
    apt.price =
      new BigDecimal(apt.totalValue) / new BigDecimal(apt.totalSupply);
  apt.save();

  // Cashflow entity
  const user = event.params.sender;
  const cashflowId =poolAddress.toHexString() + user.toHexString();
  const cashflowPointId =
    poolAddress.toHexString() +
    user.toHexString() +
    timestamp.toString();
  let cashflow = Cashflow.load(cashflowId);
  if (cashflow == null) {
    cashflow = new Cashflow(cashflowId);
    cashflow.total = BigInt.fromI32(0);
    cashflow.userAddress = user;
    cashflow.poolAddress = poolAddress;
  }

  const cashflowPoint = new CashflowPoint(cashflowPointId);
  cashflowPoint.userAddress = user;
  cashflowPoint.poolAddress = poolAddress;
  cashflowPoint.timestamp = timestamp;
  cashflowPoint.blockNumber = blockNumber;
  cashflowPoint.userAptBalance = contract.balanceOf(user);

  const inflow = event.params.redeemedTokenAmount.times(price);
  cashflow.total = cashflow.total.plus(inflow);
  cashflowPoint.total = cashflow.total;

  cashflow.save();
  cashflowPoint.save();
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

export function handleClaimed(event: Claimed): void {
  let accountClaimId = event.params.recipient.toHex();
  let accountClaim = AccountClaim.load(accountClaimId);

  if (accountClaim == null) {
    accountClaim = new AccountClaim(accountClaimId);
    accountClaim.claimAmount = event.params.amount;
  } else {
    accountClaim.claimAmount = event.params.amount.plus(
      accountClaim.claimAmount
    );
  }

  accountClaim.account = event.params.recipient;
  accountClaim.nonce = event.params.nonce;
  accountClaim.save();
}
