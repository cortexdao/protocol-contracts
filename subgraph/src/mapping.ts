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
  Transfer,
  User,
  Pool,
  AccountClaim,
} from "../generated/schema";
import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export function handleDepositedAPT(event: DepositedAPT): void {
  let tvl = new TotalEthValueLocked(
    event.params.sender.toHexString() +
      event.block.timestamp.toString() +
      event.logIndex.toString() +
      event.transaction.hash.toHexString()
  );
  tvl.timestamp = event.block.timestamp;
  tvl.sequenceNumber =
    event.block.timestamp * BigInt.fromI32(100000000) + event.logIndex;
  tvl.poolAddress = event.address;
  tvl.totalEthValueLocked = event.params.totalEthValueLocked;
  tvl.save();

  const poolAddress = event.address;
  const contract = APYPoolToken.bind(poolAddress);

  let ptv = new PoolTotalValue(
    poolAddress.toHexString() + event.block.timestamp.toString()
  );
  ptv.timestamp = event.block.timestamp;
  ptv.poolAddress = poolAddress;
  ptv.totalEthValueLocked = event.params.totalEthValueLocked;
  ptv.aptSupply = contract.totalSupply();
  if (!ptv.aptSupply.isZero())
    ptv.valuePerShare =
      new BigDecimal(ptv.totalEthValueLocked) / new BigDecimal(ptv.aptSupply);
  ptv.save();

  // Cashflow entity
  const user = event.params.sender;
  const cashflowId =
    poolAddress.toHexString() +
    user.toHexString() +
    event.block.timestamp.toString();
  const cashflow = Cashflow.load(cashflowId) || new Cashflow(cashflowId);

  cashflow.timestamp = event.block.timestamp;
  cashflow.userAddress = user.toHexString();
  cashflow.poolAddress = poolAddress;
  cashflow.userAptBalance = contract.balanceOf(user);

  const previousTotal = cashflow.total || BigInt.fromI32(0);
  cashflow.total = previousTotal.minus(event.params.tokenAmount);

  cashflow.save();
}

export function handleRedeemedAPT(event: RedeemedAPT): void {
  let tvl = new TotalEthValueLocked(
    event.params.sender.toHexString() +
      event.block.timestamp.toString() +
      event.logIndex.toString() +
      event.transaction.hash.toHexString()
  );
  tvl.timestamp = event.block.timestamp;
  tvl.sequenceNumber =
    event.block.timestamp * BigInt.fromI32(100000000) + event.logIndex;
  tvl.poolAddress = event.address;
  tvl.totalEthValueLocked = event.params.totalEthValueLocked;
  tvl.save();

  const poolAddress = event.address;
  const contract = APYPoolToken.bind(poolAddress);

  let ptv = new PoolTotalValue(
    poolAddress.toHexString() + event.block.timestamp.toString()
  );
  ptv.timestamp = event.block.timestamp;
  ptv.poolAddress = poolAddress;
  ptv.totalEthValueLocked = event.params.totalEthValueLocked;
  ptv.aptSupply = contract.totalSupply();
  if (!ptv.aptSupply.isZero())
    ptv.valuePerShare =
      new BigDecimal(ptv.totalEthValueLocked) / new BigDecimal(ptv.aptSupply);
  ptv.save();

  // Cashflow entity
  const user = event.params.sender;
  const cashflowId =
    poolAddress.toHexString() +
    user.toHexString() +
    event.block.timestamp.toString();
  const cashflow = Cashflow.load(cashflowId) || new Cashflow(cashflowId);

  cashflow.timestamp = event.block.timestamp;
  cashflow.userAddress = user.toHexString();
  cashflow.poolAddress = poolAddress;
  cashflow.userAptBalance = contract.balanceOf(user);

  const previousTotal = cashflow.total || BigInt.fromI32(0);
  cashflow.total = previousTotal.plus(event.params.redeemedTokenAmount);

  cashflow.save();
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
  const pool = Pool.load(priceId) || new Pool(priceId);
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
