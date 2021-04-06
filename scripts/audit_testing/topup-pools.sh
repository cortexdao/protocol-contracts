#!/usr/bin/env bash

export HARDHAT_NETWORK=localhost

for pool in dai usdc usdc; do
    echo "${pool} pool:"
    echo "  Total value: " $(node scripts/audit_testing/poolMetrics.js -p ${pool} -m total-value)
    echo "  Topup amount: "$(node scripts/audit_testing/poolMetrics.js -p ${pool} -m topup)
done
