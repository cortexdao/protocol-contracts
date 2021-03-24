#!/usr/bin/env bash

# populate option args using a script or hardcoded-value
fork="$(node scripts/ganache/infura.js)"
mnemonic="$(node scripts/ganache/mnemonic.js)"
# This mnemonic was generated purely for testing on forked mainnet and should never
# be used for anything else. Using a fresh mnemonic is needed so Ganache will assign
# nonce 0, rather than reading values off of Mainnet for the test accounts.
default_mnemonic="today column drill funny reduce toilet strategy jump assault arctic boss umbrella"
unlocked_addresses="$(node scripts/ganache/unlocked_addresses.js)"
gas_limit=12500000  # 12.5 million, current mainnet block gas limit
gas_price=40000000000  # 40 gwei
default_balance_ether=10000
host="0.0.0.0"
chain_id=1

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
  # args+=( --deterministic ); 
  args+=( --mnemonic "${default_mnemonic}" );  # see note above for default_mnemonic
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
if [ -n "${chain_id}" ]; then
  args+=( --chainId "${chain_id}" );
fi

echo "args: ${args[@]}"
ganache-cli "${args[@]}"
