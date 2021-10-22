import { AggregatorV3Interface } from "../../generated/DAI_PoolToken/AggregatorV3Interface";
import { Address, BigInt } from "@graphprotocol/graph-ts";

export function getEthUsdAggregator(network: string): AggregatorV3Interface {
    let ethUsdAgg: AggregatorV3Interface;
    if (network == "mainnet") {
        ethUsdAgg = AggregatorV3Interface.bind(
            Address.fromString("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419")
        );
    } else if (network == "kovan") {
        ethUsdAgg = AggregatorV3Interface.bind(
            Address.fromString("0x9326BFA02ADD2366b30bacB125260Af641031331")
        );
    } else {
        throw new Error(
            "Network not recognized: must be 'mainnet' or 'kovan'."
        );
    }
    return ethUsdAgg;
}

const symbolToAggAddress = {
    mainnet: {
        dai: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
        usdc: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
        usdt: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    },
    kovan: {
        dai: "0x777A68032a88E5A84678A77Af2CD65A7b3c0775a",
        usdc: "0x9211c6b3BF41A10F78539810Cf5c64e1BB78Ec60",
        usdt: "0x2ca5A90D34cA333661083F89D831f757A9A50148",
    },
};

export function getStableUsdAggregator(
    network: string,
    symbol: string
): AggregatorV3Interface {
    network = network.toLowerCase();
    symbol = symbol.toLowerCase();
    if (!["mainnet", "kovan"].includes(network)) {
        throw new Error(
            "Network not recognized: must be 'mainnet' or 'kovan'."
        );
    }
    if (!["dai", "usdc", "usdt"].includes(symbol)) {
        throw new Error(
            "Symbol not recognized: must be 'dai', 'usdc', or 'usdt'."
        );
    }
    const aggAddress: Address = Address.fromString(
        symbolToAggAddress[network][symbol]
    );
    const stableUsdAgg: AggregatorV3Interface =
        AggregatorV3Interface.bind(aggAddress);
    return stableUsdAgg;
}

export function getPriceFromAgg(aggContract: AggregatorV3Interface): BigInt {
    const roundDataResult = aggContract.try_latestRoundData();
    let price = BigInt.fromI32(0);
    if (!roundDataResult.reverted) {
        price = roundDataResult.value.value1;
    }
    return price;
}
