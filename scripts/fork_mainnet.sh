#!/usr/bin/env bash

# populate option args using a script or hardcoded-value
fork="$(node scripts/infura.js)"
mnemonic="$(node scripts/mnemonic.js)"
unlocked_addresses="$(node scripts/unlocked_addresses.js)"
gas_limit=12500000  # 12.5 million, current mainnet block gas limit
gas_price=40000000000  # 40 gwei
default_balance_ether=10000
host="127.0.0.1"

# add option arg to args array
args=( )
if [ -n "${fork}" ]; then
  args+=( --fork "${fork}" );
else
  echo "Must have fork url in .env file.";
fi
if [ -n "${mnemonic}" ]; then
  args+=( --mnemonic "${mnemonic}" );
else
  args+=( --deterministic );
fi
if [ -n "${unlocked_addresses}" ]; then
  for address in $(echo $unlocked_addresses | sed "s/,/ /g"); do
    args+=( --unlock "${address}" );
  done
fi
if [ -n "${gas_limit}" ]; then
  args+=( --gasLimit "${gas_limit}" );
fi
if [ -n "${gas_price}" ]; then
  args+=( --gasPrice "${gas_price}" );
fi
if [ -n "${default_balance_ether}" ]; then
  args+=( --defaultBalanceEther "${default_balance_ether}" );
fi
if [ -n "${host}" ]; then
  args+=( -h "${host}" );
fi

echo "args: ${args[@]}"
ganache-cli "${args[@]}"
