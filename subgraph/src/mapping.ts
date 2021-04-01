import {
  PoolTokenV2,
  DepositedAPT,
  RedeemedAPT,
  Transfer as TransferEvent,
} from "../generated/DAI_PoolToken/PoolTokenV2";
import { IDetailedERC20 } from "../generated/DAI_PoolToken/IDetailedERC20";
import { AggregatorV3Interface } from "../generated/DAI_PoolToken/AggregatorV3Interface";
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
import { Address, BigInt, Bytes, dataSource } from "@graphprotocol/graph-ts";

export function handleDepositedAPT(event: DepositedAPT): void {
  const sender = event.params.sender;
  const timestamp = event.block.timestamp;
  const blockNumber = event.block.number;
  const poolAddress = event.address;

  const contract = PoolTokenV2.bind(poolAddress);
  const underlyer = IDetailedERC20.bind(contract.underlyer());
  const priceAgg = AggregatorV3Interface.bind(contract.priceAgg());
  let ethUsdAgg: AggregatorV3Interface;
  if (dataSource.network() == "mainnet") {
    ethUsdAgg = AggregatorV3Interface.bind(
      Address.fromString("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419")
    );
  } else if (dataSource.network() == "kovan") {
    ethUsdAgg = AggregatorV3Interface.bind(
      Address.fromString("0x9326BFA02ADD2366b30bacB125260Af641031331")
    );
  } else {
    throw new Error("Network not recognized: must be 'mainnet' or 'kovan'.");
  }

  let totalValue = event.params.totalEthValueLocked;
  if (priceAgg.decimals() == 18) {
    const roundDataResult = ethUsdAgg.try_latestRoundData();
    let ethUsdPrice = BigInt.fromI32(0);
    if (!roundDataResult.reverted) {
      ethUsdPrice = roundDataResult.value.value1;
    }
    totalValue = totalValue
      .times(ethUsdPrice)
      .div(BigInt.fromI32(10).pow(18 as u8));
  } else if (priceAgg.decimals() != 8) {
    throw new Error("Price aggregator decimals must be 18 or 8.");
  }

  const totalSupply = contract.totalSupply();

  createAndSaveApt(
    poolAddress,
    timestamp,
    blockNumber,
    totalValue,
    totalSupply
  );

  const user = sender;
  const cashflow = loadCashflow(user, poolAddress);

  const cashflowPointId =
    poolAddress.toHexString() + user.toHexString() + timestamp.toString();
  const cashflowPoint = new CashflowPoint(cashflowPointId);
  cashflowPoint.userAddress = user;
  cashflowPoint.poolAddress = poolAddress;
  cashflowPoint.timestamp = timestamp;
  cashflowPoint.blockNumber = blockNumber;
  cashflowPoint.userAptBalance = contract.balanceOf(user);

  const priceResult = contract.try_getUnderlyerPrice();
  let price = BigInt.fromI32(0);
  if (!priceResult.reverted) {
    price = priceResult.value;
    if (priceAgg.decimals() == 18) {
      const roundDataResult = ethUsdAgg.try_latestRoundData();
      let ethUsdPrice = BigInt.fromI32(0);
      if (!roundDataResult.reverted) {
        ethUsdPrice = roundDataResult.value.value1;
      }
      price = price.times(ethUsdPrice).div(BigInt.fromI32(10).pow(18 as u8));
    }
  }
  const decimals = underlyer.decimals() as u8;
  const outflow = event.params.tokenAmount
    .times(price)
    .div(BigInt.fromI32(10).pow(decimals));

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

  const contract = PoolTokenV2.bind(poolAddress);
  const underlyer = IDetailedERC20.bind(contract.underlyer());
  const priceAgg = AggregatorV3Interface.bind(contract.priceAgg());
  let ethUsdAgg: AggregatorV3Interface;
  if (dataSource.network() == "mainnet") {
    ethUsdAgg = AggregatorV3Interface.bind(
      Address.fromString("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419")
    );
  } else if (dataSource.network() == "kovan") {
    ethUsdAgg = AggregatorV3Interface.bind(
      Address.fromString("0x9326BFA02ADD2366b30bacB125260Af641031331")
    );
  } else {
    throw new Error("Network not recognized: must be 'mainnet' or 'kovan'.");
  }

  let totalValue = event.params.totalEthValueLocked;
  if (priceAgg.decimals() == 18) {
    const roundDataResult = ethUsdAgg.try_latestRoundData();
    let ethUsdPrice = BigInt.fromI32(0);
    if (!roundDataResult.reverted) {
      ethUsdPrice = roundDataResult.value.value1;
    }
    totalValue = totalValue
      .times(ethUsdPrice)
      .div(BigInt.fromI32(10).pow(18 as u8));
  } else {
    assert(priceAgg.decimals() == 8);
  }

  const totalSupply = contract.totalSupply();

  createAndSaveApt(
    poolAddress,
    timestamp,
    blockNumber,
    totalValue,
    totalSupply
  );

  const user = sender;
  const cashflow = loadCashflow(user, poolAddress);

  const cashflowPointId =
    poolAddress.toHexString() + user.toHexString() + timestamp.toString();
  const cashflowPoint = new CashflowPoint(cashflowPointId);
  cashflowPoint.userAddress = user;
  cashflowPoint.poolAddress = poolAddress;
  cashflowPoint.timestamp = timestamp;
  cashflowPoint.blockNumber = blockNumber;
  cashflowPoint.userAptBalance = contract.balanceOf(user);

  const priceResult = contract.try_getUnderlyerPrice();
  let price = BigInt.fromI32(0);
  if (!priceResult.reverted) {
    price = priceResult.value;
    if (priceAgg.decimals() == 18) {
      const roundDataResult = ethUsdAgg.try_latestRoundData();
      let ethUsdPrice = BigInt.fromI32(0);
      if (!roundDataResult.reverted) {
        ethUsdPrice = roundDataResult.value.value1;
      }
      price = price.times(ethUsdPrice).div(BigInt.fromI32(10).pow(18 as u8));
    }
  }
  const decimals = underlyer.decimals() as u8;
  const inflow = event.params.redeemedTokenAmount
    .times(price)
    .div(BigInt.fromI32(10).pow(decimals));

  cashflow.total = cashflow.total.plus(inflow);
  cashflowPoint.total = cashflow.total;

  cashflow.save();
  cashflowPoint.save();
}

function createAndSaveApt(
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

function loadCashflow(user: Bytes, poolAddress: Bytes): Cashflow {
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
