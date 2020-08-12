#!/usr/bin/env bash
source .env

if [ -n "${INFURA_KEY_MAINNET}" ]; then
    NODE_URL="https://mainnet.infura.io/v3/${INFURA_KEY_MAINNET}";
else
    # an ok fallback, but somewhat flakey behavior
    NODE_URL="https://cloudflare-eth.com";
fi

echo "Using node: ${NODE_URL}"
echo ""

mkdir -p .ganache/logs

ganache-cli --networkId=10312008 \
    --deterministic --fork="${NODE_URL}" \
    2>&1 | tee .ganache/logs/$(date +%Y-%m-%d-%H:%M:%S).log

