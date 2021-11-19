import {
    PoolTokenV2,
    Transfer as TransferEvent,
} from "../../generated/DAI_PoolToken/PoolTokenV2";
import { IDetailedERC20 } from "../../generated/DAI_PoolToken/IDetailedERC20";
import { AggregatorV3Interface } from "../../generated/DAI_PoolToken/AggregatorV3Interface";
import { Transfer, User, Pool } from "../../generated/schema";
import { Address, BigInt, dataSource } from "@graphprotocol/graph-ts";
import {
    getEthUsdAggregator,
    getPriceFromAgg,
    getStableUsdAggregator,
} from "../utils/chainlink";

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

    const poolToken = PoolTokenV2.bind(poolAddress);
    const underlyer = IDetailedERC20.bind(poolToken.underlyer());
    const totalValueResult = poolToken.try_getPoolTotalValue();
    let version = 2;
    if (totalValueResult.reverted) {
        version = 1;
    }

    const symbol = underlyer.symbol();
    const decimals = underlyer.decimals() as u8;
    const underlyerPriceAgg = getStableUsdAggregator(
        dataSource.network(),
        symbol,
        version
    );
    const ethUsdAgg: AggregatorV3Interface = getEthUsdAggregator(
        dataSource.network()
    );

    // Ensure underlyer is priced in USD as in V1 it is priced in ETH
    let underlyerPrice = getPriceFromAgg(underlyerPriceAgg);
    if (underlyerPriceAgg.decimals() == 18) {
        const ethUsdPrice = getPriceFromAgg(ethUsdAgg);
        underlyerPrice = underlyerPrice
            .times(ethUsdPrice)
            .div(BigInt.fromI32(10).pow(18 as u8));
    } else if (underlyerPriceAgg.decimals() != 8) {
        throw new Error("Price aggregator decimals must be 18 or 8.");
    }

    let totalValue = BigInt.fromI32(0);
    // In V2, the total value in USD is retrieved by `getPoolTotalValue`.
    // In V1, the total value is just the USD value of the underlyer
    // balance of the pool.
    if (version == 2) {
        totalValue = totalValueResult.value;
    } else {
        const underlyerBalance = underlyer.balanceOf(poolAddress);
        totalValue = underlyerBalance
            .times(underlyerPrice)
            .div(BigInt.fromI32(10).pow(decimals));
    }

    const poolId = poolAddress.toHexString();
    const pool = Pool.load(poolId) || new Pool(poolId);
    pool.underlyerPrice = underlyerPrice;
    pool.underlyerSymbol = underlyer.symbol();
    pool.underlyerDecimals = underlyer.decimals();
    pool.underlyerBalance = underlyer.balanceOf(poolAddress);
    pool.totalValue = totalValue;
    pool.address = poolAddress;
    pool.aptSupply = poolToken.totalSupply();
    pool.save();

    const toUserId = toAddress.toHexString() + poolAddress.toHexString();
    const toUser = User.load(toUserId) || new User(toUserId);
    toUser.poolAddress = poolAddress;
    toUser.address = toAddress;
    let balance = poolToken.balanceOf(toAddress);
    toUser.accountBalance = balance;
    toUser.save();

    const fromUserId = fromAddress.toHexString() + poolAddress.toHexString();
    const fromUser = User.load(fromUserId) || new User(fromUserId);
    fromUser.poolAddress = poolAddress;
    fromUser.address = fromAddress;
    balance = poolToken.balanceOf(fromAddress);
    fromUser.accountBalance = balance;
    fromUser.save();
}
