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

unlocked_addresses=(
    0x9759A6Ac90977b93B58547b4A71c78317f391A28  # DAI minter address
)

delim=""
unlocked_arg=""
for item in "${unlocked_addresses[@]}"; do
  unlocked_arg="$unlocked_arg$delim$item"
  delim=","
done
echo "Unlocked addresses: ${unlocked_arg}"
echo ""

mkdir -p .ganache/logs

ganache-cli --networkId=10312008 \
    --deterministic --fork="${NODE_URL}" \
    --unlock "${unlocked_arg}" \
    --gasLimit 8000000 \
    2>&1 | tee .ganache/logs/$(date +%Y-%m-%d-%H:%M:%S).log
