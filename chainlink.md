# Chainlink aggregation of the deployed TVL of APY Finance

During the execution of the APY Finance platform, certain actions (such as a rebalance) require an up-to-date total value of the assets being actively managed in strategies. This **deployed TVL** will be the total USD value of all LP tokens from DeFi protocols such as Curve, Balancer, etc., and other assets, such as governance or rewards tokens issued by the protocols.

The deployed TVL value is critical to the proper functioning of the platform. The **mAPT** token is an IOU issued by the system for funds that are pulled from the three stablecoin pools that provide liquidity to the system. This token owns a proportional share of the deployed TVL and this is how the system calculates how much is owed back to each liquidity pool.

Chainlink will provide APY Finance with an on-chain contract (an "aggregator") that can be queried for the deployed TVL. Their setup relies on these components:

1. Chainlink node:\
   an "oracle" that reads on-chain information and submits values on-chain
2. TVL adapter:\
   an external adapter used in the node's jobs pipeline (located [here](https://github.com/smartcontractkit/external-adapters-js/tree/develop/composite/apy-finance))
3. Chainlink registry:\
   an on-chain contract provided by AFY Finance, which the adapter queries for the list of tokens and token balances. (Its Mainnet address can always be located by calling `chainlinkRegistryAddress` [here](https://etherscan.io/address/0x7ec81b7035e91f8435bdeb2787dcbd51116ad303#readProxyContract)). The interface is given by the [IAssetAllocation](contracts/interfaces/IAssetAllocation.sol)

**TODO**: links to some Chainlink docs

## Quick start

Fuller explanations of all the key steps are given in the other sections below. This section is a simple guide to let a developer run the Chainlink setup to do some ad-hoc testing.

It is assumed the developer has installed:

- Docker: [Mac](https://www.docker.com/docker-mac) | [Ubuntu](https://www.docker.com/docker-ubuntu)\
  Note that Docker Desktop for Mac will include Docker Compose but a Linux user will need to install Docker Compose separately.
- GNU Make (this is installed by default on Mac)
- git (duh? Linux may not have it though.. :))

### Clone the Chainlink repo for external adapters

- `make clone_chainlink_repo`
  This will `git clone` the repo to a `external-adapters-js` directory in `apy-core`.

### Run the Ethereum node

- in one terminal, run `MNEMONIC='' yarn fork:mainnet` to start the Ethereum node in forked mainnet mode

**Note**: the setup relies upon deterministic addresses so it is important to not use a mnemonic that has a non-zero nonce. This is automatic for our ganache fork script as long as the `MNEMONIC` env var is not set.

### Run Docker

- start the containers (in another terminal):
  - `make up` will build and start the containers for the Chainlink node and adapter and the Postgres database that backs the node
    (building the adapter takes a long time, but will be cached for subsequent runs);
  - ctrl-c will let you detach from the logs to run other commands, but if you prefer, you can open a 3rd terminal to work out of
  - `make logs` wiill re-attach you to logging; `make clear_logs` will clear the logs
  - `make log name=node` will show output only from the `node` container. Container names are `node` (Chainlink node), `adapter` (TVL adapter), `db` (postgres)
- stop the containers:
  - `make down`
- `make help` will show you a menu of further commands

### Deploy the Aggregator

- `HARDHAT_NETWORK=localhost node scripts/chainlink/deploy_agg.js` - this deploys the FluxAggregator contract with the correct parameters and funds it and the node
- `HARDHAT_NETWORK=localhost node scripts/chainlink/check_agg_value.js` will display the latest round data from the `FluxAggregator`
  (until a value is saved to the contract, `latestRoundData` called on the contract will revert with "No data present".)
- `HARDHAT_NETWORK=localhost node scripts/fund_accounts/fund_stablecoins.js` will fund account 0 with stablecoins, so that it can manipulate the stablecoin pools (our test setup has the manager reading from them for the "deployed TVL")
- `HARDHAT_NETWORK=localhost node scripts/chainlink/update_tvl.js` will deposit some stablecoin into a pool to update the TVL

Note that the round data does update even without the use of the `update_tvl` script. This is because the Chainlink node polls periodically and will run the TVL adapter and check if the TVL has changed. If the deviation threshold allows it, it will then send a transaction, which will get mined by ganache, advancing the block number, which means the next poll by the Chainlink node will retrieve a fresh on-chain value for the TVL.

## Chainlink aggregator contract

The aggregator interface is given by [`AggregatorV3Inteface`](https://github.com/smartcontractkit/chainlink/blob/develop/evm-contracts/src/v0.6/interfaces/AggregatorV3Interface.sol). It is implemented by their [`FluxAggregator`](https://github.com/smartcontractkit/chainlink/blob/develop/evm-contracts/src/v0.6/FluxAggregator.sol) contract, for which they've created a special "fluxmonitor" job that can be run in a Chainlink node.

## Chainlink jobs

A node job consists of two stages:

1. initiator
2. tasks

Chainlink has created a external adapter for us based on their token-allocation adapter. Adapters can get added to an initiator as part of its "feeds" pipeline.

The `FluxAggregator` relies upon the [`fluxmonitor` initiator](https://docs.chain.link/docs/initiators#fluxmonitor) which monitors for changes on-chain based on threshold values and then invokes its bridges (adapters). It is configured to use a price feed from an API such as Coingecko, Amberdata, etc. The initiator will aggregate the results from the bridges automatically and return the median value.

Subsequent tasks in the "tasks" section only need to convert to the right data type (`int256` in our case) and submit the transaction. The initiator will do the right thing and configure the node to submit the final transaction properly to the `FluxAggregator` contract using its `submit` function.

Jobs can be created through the UI, but we created a script to connect to the node's docker container and use the Chainlink CLI to create a job (with the TVL adapter as bridge). This is explained further in the Makefile section.

Thus our job pipeline is:

1. `fluxmonitor` initiator
2. `ethint256` task
3. `ethtx` task

The job spec is located [here](docker/tvlAgg-spec.json).

## Chainlink node

The Chainlink node will subscribe to the Ethereum node using `eth_subscribe`. It will fail to completely startup (and open port 6688) unless it has connected to the Ethereum node, so it's important to start the Eth node first!

**TODO**: more explanation of how a node works

## Ethereum node (forked mainnet)

The Chainlink node can use a local Ethereum node as long as the `ETH_URL` env variable and network/port configuration is properly setup.

Start the forked mainnet: `MNEMONIC='' yarn fork:mainnet`

**Note**: This will use Ganache. Do not use Hardhat node for this, as it has a bug with `eth_subscribe`, so will not pick up on events from the blockchain.

Ganache has been setup with a fresh test mnemonic. This is necessary so that it will start account 0 with nonce 0, making the addresses of deployed contracts deterministic. We use this to simplify the setup, as the deployed FluxAggregator contract address is used in the TVL job spec and utility scripts.

## FluxAggregator

Deploying the FluxAggregator contract requires:

- correct constructor args, including the payment amount paid for each oracle submission
- funding it with LINK; there must be enough in the contract's LINK reserve for any oracles registered. The logic is based on having enough LINK for two rounds of submissions for every oracle.
- register our node as an oracle, keeping in mind the LINK reserve requirement and valid constructor args
- fund the node with ETH

Utility scripts

- check TVL:
  `HARDHAT_NETWORK=localhost node scripts/chainlink/check_agg_value.js`
- update TVL:\
  `HARDHAT_NETWORK=localhost node scripts/chainlink/update_tvl.js`\
  Current mainnet setup is to have the `balanceOf` being read from our stablecoin pools. So depositing or withdrawing from a pool will change the TVL.\
  Deposits can be done using:\
  `HARDHAT_NETWORK=localhost node scripts/fund_accounts/fund_stablecoins.js`

**TODO**: explanation of contract functions
