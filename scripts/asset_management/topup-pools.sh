#!/usr/bin/env bash

export HARDHAT_NETWORK=localhost


all_topup_amounts=()
pools=(
    dai
    usdc
    usdt
)
for pool in "${pools[@]}"; do
    echo "${pool} pool:"
    echo "  Total value: " $(node scripts/asset_management/pool_metrics.js -p ${pool} -m total-value)
    topup_amount=$(node scripts/asset_management/pool_metrics.js -p ${pool} -m topup)
    echo "  Topup amount: " ${topup_amount}
    all_topup_amounts+=("${topup_amount}")
done

# printf -v topup_amounts_csv '%s,' "${all_topup_amounts[@]}"
# echo "${topup_amounts_csv%,}"
# echo "${all_topup_amounts[@]}"
echo $(printf "'%s' " "${all_topup_amounts[@]}")

transfer_amounts=($(node scripts/asset_management/topup.js -p "${pools[@]}" --amounts $(printf "'%s' " "${all_topup_amounts[@]}")))
echo "  Transferred: "
for i in "${!pools[@]}"; do
    echo "    ${pools[i]} pool: " ${transfer_amounts[i]}
done
