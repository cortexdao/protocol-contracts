#!/usr/bin/env bash

# populate option args using a script or hardcoded-value
fork="$(node scripts/infura.js)"
mnemonic="$(node scripts/mnemonic.js)"
unlocked_addresses="$(node scripts/unlocked_addresses.js)"
gas_limit=12500000  # 12.5 million, current mainnet block gas limit
gas_price=40000000000  # 40 gwei

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
  args+=( --unlock "${unlocked_addresses}" );
fi
if [ -n "${gas_limit}" ]; then
  args+=( --gasLimit "${gas_limit}" );
fi
if [ -n "${gas_price}" ]; then
  args+=( --gasPrice "${gas_price}" );
fi

# echo "args: ${args[@]}"

ganache-cli "${args[@]}"
