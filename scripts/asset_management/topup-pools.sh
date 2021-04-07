#!/usr/bin/env bash

export HARDHAT_NETWORK=localhost

for pool in dai usdc usdc; do
    echo "${pool} pool:"
    echo "  Total value: " $(node scripts/audit_testing/pool_metrics.js -p ${pool} -m total-value)
    topup_amount=$(node scripts/audit_testing/pool_metrics.js -p ${pool} -m topup)
    echo "  Topup amount: " ${topup_amount}
    # FIXME: this will throw a Chainlink stale data error if previous iteration did a top-up
    transfer_amount=$(node scripts/audit_testing/topup.js -p ${pool} --amount ${topup_amount})
    echo "  Transferred: " ${transfer_amount}
done
