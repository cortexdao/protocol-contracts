#!/usr/bin/env bash

export AM_SCRIPTS_FOLDER=scripts/asset_management
export HARDHAT_NETWORK=localhost


pools=(
    dai
    usdc
    usdt
)
funded_pools=()
fund_amounts=()
for pool in "${pools[@]}"; do
    amount=$(node ${AM_SCRIPTS_FOLDER}/pool_metrics.js -p ${pool} -m topup)
    echo "${pool} topup amount: " ${amount}
    if [[ ${amount} == -* ]]; then # amount starts with negative sign
        amount=${amount#-}
        fund_amounts+=("${amount}")
        funded_pools+=("${pool}")
    fi
done

node ${AM_SCRIPTS_FOLDER}/fund.js -p "${funded_pools[@]}" --amounts "${fund_amounts[@]}"

echo "Funded account with: "
for i in "${!funded_pools[@]}"; do
    echo "  ${funded_pools[i]} amount: " ${fund_amounts[i]}
done
