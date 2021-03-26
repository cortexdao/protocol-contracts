import {
  APYPoolToken,
  DepositedAPT,
  RedeemedAPT,
  Transfer as TransferEvent,
} from "../generated/DAI_APYPoolToken/APYPoolToken";
import { ERC20UpgradeSafe } from "../generated/DAI_APYPoolToken/ERC20UpgradeSafe";
import { Claimed } from "../generated/APYRewardDistributor/APYRewardDistributor";
import {
  TotalEthValueLocked,
  PoolTotalValue,
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
  const poolAddress = event.address;
  const totalPoolValue = event.params.totalEthValueLocked;

  const contract = APYPoolToken.bind(poolAddress);

  const ptv = new PoolTotalValue(poolAddress.toHexString() + timestamp.toString());
  ptv.timestamp = timestamp;
  ptv.poolAddress = poolAddress;
  ptv.poolTotalValue = totalPoolValue;
  ptv.aptSupply = contract.totalSupply();
  if (!ptv.aptSupply.isZero())
    ptv.valuePerShare =
      new BigDecimal(ptv.poolTotalValue) / new BigDecimal(ptv.aptSupply);
  ptv.save();

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
  cashflowPoint.userAptBalance = contract.balanceOf(user);

  cashflow.total = cashflow.total.minus(event.params.tokenAmount);
  cashflowPoint.total = cashflow.total;

  cashflow.save();
  cashflowPoint.save();
}

export function handleRedeemedAPT(event: RedeemedAPT): void {
  const sender = event.params.sender;
  const timestamp = event.block.timestamp;
  const poolAddress = event.address;
  const totalPoolValue = event.params.totalEthValueLocked;

  const contract = APYPoolToken.bind(poolAddress);

  const ptv = new PoolTotalValue(poolAddress.toHexString() + timestamp.toString());
  ptv.timestamp = timestamp;
  ptv.poolAddress = poolAddress;
  ptv.poolTotalValue = totalPoolValue;
  ptv.aptSupply = contract.totalSupply();
  if (!ptv.aptSupply.isZero())
    ptv.valuePerShare =
      new BigDecimal(ptv.poolTotalValue) / new BigDecimal(ptv.aptSupply);
  ptv.save();

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
  cashflowPoint.userAptBalance = contract.balanceOf(user);

  cashflow.total = cashflow.total.plus(event.params.redeemedTokenAmount);
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

  const contract = APYPoolToken.bind(poolAddress);
  const underlyer = ERC20UpgradeSafe.bind(contract.underlyer());

  const priceResult = contract.try_getTokenEthPrice();
  let price = BigInt.fromI32(0);
  if (!priceResult.reverted) {
    price = priceResult.value;
  }

  const poolId = poolAddress.toHexString();
  const pool = Pool.load(poolId) || new Pool(poolId);
  pool.underlyerPrice = price;
  pool.underlyerSymbol = underlyer.symbol();
  pool.underlyerDecimals = underlyer.decimals();
  pool.underlyerBalance = underlyer.balanceOf(poolAddress);
  pool.address = poolAddress;
  pool.aptSupply = contract.totalSupply();
  pool.save();

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
