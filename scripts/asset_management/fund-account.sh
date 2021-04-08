#!/usr/bin/env bash

export HARDHAT_NETWORK=localhost


pools=(
    dai
    usdc
    usdt
)
funded_pools=()
fund_amounts=()
for pool in "${pools[@]}"; do
    amount=$(node scripts/asset_management/pool_metrics.js -p ${pool} -m topup)
    echo "${pool} topup amount: " ${amount}
    if [[ ${amount} == -* ]]; then # amount starts with negative sign
        amount=${amount#-}
        echo "Adding to fund_amounts: ${amount}"
        fund_amounts+=("${amount}")
        funded_pools+=("${pool}")
    fi
done

node scripts/asset_management/fund.js -p "${funded_pools[@]}" --amounts "${fund_amounts[@]}"

echo "Funded account with: "
for i in "${!funded_pools[@]}"; do
    echo "  ${funded_pools[i]} amount: " ${fund_amounts[i]}
done
