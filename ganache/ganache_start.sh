#!/usr/bin/env bash

mkdir -p .ganache/logs

ganache-cli --networkId=10312008 \
    --deterministic --fork="https://cloudflare-eth.com" \
    2>&1 | tee .ganache/logs/$(date +%Y-%m-%d-%H:%M:%S).log

