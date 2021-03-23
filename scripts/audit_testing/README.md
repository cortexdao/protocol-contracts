# Auditor Testing Framework

The framework is comprised of the scripts in the `scripts/audit_testing` directory, the dockerized Chainlink setup, and relevant commands in the `Makefile` located in the root directory of the repo.

This framework will allow a tester to:

- startup a local Ethereum node on port 8545, forking Mainnet state and configured for use with the scripts
- start a Chainlink node on port 6688, running the configured job to call the TVL adaptor based on polling and value deviation
- deploy the new and upgraded smart contracts of the APY.Finance system
- interact with the APY.Finance system as an admin running the platform and as a user doing normal operations

The admin operations are:

- fund a strategy account using tokens from APY.Finance stablecoin pools
- deposit strategy funds into a DeFi protocol
- withdraw fund from a DeFi protocol
- push funds to the APY.Finance stablecoin pools

The user operations are:

- deposit into the APY.Finance stablecoin pools
- withdraw from the APY.Finance stablecoin pools

Other user operations that are typically done through the webste, such as staking LP tokens or claiming rewards, are not intended to be covered by the framework.

## Requirements

- Docker: [Mac](https://www.docker.com/docker-mac) | [Ubuntu](https://www.docker.com/docker-ubuntu)\
  Note that Docker Desktop for Mac will include Docker Compose but a Linux user will need to install Docker Compose separately.
- GNU Make (this is installed by default on Mac)
- git
- node (scripts were tested under v12.18.3)
- yarn (tested under 1.22.5)

## Quickstart

- install javascript dependencies:  
  `yarn`
- run forked Mainnet:  
  `make forked_mainnet`
- start chainlink node (in another terminal):  
  `make up`  
  (the first time, this will build the TVL adaptor image, which can take more than 5 minutes...)
- deploy the upgraded APY.Finance system locally:  
  `make audit_testing step=deploy`

At this point, everything should be good-to-go but here are a few key things you may want to do:

### Fund strategy accounts

- fund the deployed strategy account with stablecoins:  
  `make audit_testing step=fund`

### Register asset allocations

- register expected asset allocations from Curve 3pool strategy:  
  `make audit_testing step=register_curve`

### Execute strategy

- execute Curve 3pool strategy:  
  `make audit_testing step=execute_curve`

### Withdraw from strategy

- withdraw from Curve 3pool strategy:  
  `make audit_testing step=withdraw_curve`

### User operations

These scripts let you engage in user actions, e.g. depositing into APY.Finance.

- deposit into APY stablecoin pool:  
  `HARDHAT_NETWORK=localhost scripts/audit_testing/user_deposit.js --amount=1000 --pool=usdc`
- withdraw from APY stablecoin pool:  
  `HARDHAT_NETWORK=localhost scripts/audit_testing/user_withdraw.js --amount 125 --pool=usdc`

### Check

- check deployed TVL:  
  `make audit_testing step=check_tvl`

The scripts being run are located in `scripts/audit_testing` (same location as this README). Some of the scripts can take command-line arguments, but to do so, they will have to be run outside of the `make` command, e.g. `HARDHAT_NETWORK=localhost scripts/audit_testing/user_deposit.js --amount=100`.

### User operations

deposit/remove from stablecoin pools

## Chainlink TVL adapter

Further info: [APY.Finance Chainlink doc](../chainlink.md)

## Asset allocation registration

## Generic execution
