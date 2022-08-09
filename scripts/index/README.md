# Index Token

## Forked mainnet testing

Following instructions all rely on working directory being the index protocol contracts repo.

In one terminal, start a forked mainnet node:
`yarn fork_mainnet`

### Deploy index token and setup depositor balance

`HARDHAT_NETWORK=localhost node scripts/index/deploy_index_token.js`

### Deploy factory pool

`HARDHAT_NETWORK=localhost node scripts/index/deploy_factory_pool.js`

### Deploy deposit zap

`HARDHAT_NETWORK=localhost node scripts/index/deploy_deposit_zap.js`
