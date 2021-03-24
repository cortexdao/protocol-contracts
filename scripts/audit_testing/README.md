# Auditor Testing Framework

The framework is comprised of the scripts in the `scripts/audit_testing` directory, the dockerized Chainlink setup, and relevant commands in the `Makefile` located in the root directory of the repo.

This framework will allow a tester to:

- startup a local Ethereum node on port 8545, forking Mainnet state and configured for use with the scripts
- start a Chainlink node on port 6688, running the configured job to call the TVL adaptor based on polling and value deviation
- deploy the new and upgraded smart contracts of the APY.Finance system
- interact with the APY.Finance system as an admin running the platform and as a user doing normal operations

The admin operations are:

- fund a strategy account using tokens from APY.Finance stablecoin pools
- register asset allocations for TVL computation
- deposit strategy funds into a DeFi protocol
- liquidate funds from a DeFi protocol
- withdraw funds to the APY.Finance stablecoin pools

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
  **NOTE:** this requires `INFURA_API_KEY` be set as an env variable.
- start chainlink node (in another terminal):  
  `make up`  
  (the first time, this will build the TVL adaptor image, which can take more than 5 minutes...)
- deploy the upgraded APY.Finance system locally (in 3rd terminal):  
  `make audit_testing step=deploy`

At this point, everything should be good-to-go but here are a few key things you may want to do:

### Fund strategy account

As part of the deployment, a strategy account has already been provisioned with ID `bytes32("alpha")`. As demonstrated in the sample scripts, the account ID is always used for funding or execution as part of a safety mechanism.

- fund the deployed strategy account with stablecoins:  
  `make audit_testing step=fund`

The above script will fund the account with 1 million DAI and 5 million USDC. The pool choices and amounts can be adjusted in this portion of the script:

```javascript
await poolManager.fundAccount(accountId, [
  {
    poolId: bytes32("daiPool"),
    amount: daiAmount,
  },
  {
    poolId: bytes32("usdcPool"),
    amount: usdcAmount,
  },
]);
```

### Register asset allocations

Each asset allocation is a token placed in a particular way within the APY.Finance system. The same token may have multiple allocations
managed in differing ways, whether they are held by different contracts or subject to different holding periods.

Each asset allocation must be registered with the TVL Manager, in order for Chainlink nodes to include it within the TVL computation.

The data required in an allocation is:

- data: a struct with address and bytes fields where the bytes are encoded function
  calldata to be used at the target address
- symbol (string): the token symbol
- decimals (uint256): the token decimals

The general approach we have taken is to deploy one or more periphery contracts for each protocol. This is necessary in most cases as the tokens being held are not priced in the market but represent underlyers that _are_ priced. Thus the primary use of a periphery contract is to return the balance for a particular asset allocation, e.g. the DAI underlyer balance for a Curve LP token.

Sample scripts have been provided for the following:

- Aave lending pool:  
  `make audit_testing step=register_aave`
- Uniswap:  
  `make audit_testing step=register_uniswap`
- Curve 3pool:  
  `make audit_testing step=register_curve`

These examples are of varying complexity.

The Aave protocol mints aTokens 1-1 (par) in exchange for the underlyer being lent. Depositing 100 DAI results in 100 aDAI. The aDAI is interest-bearing and the resulting amount of DAI upon withdrawal is simply the accumulated amount of aDAI. Thus, strictly speaking, no periphery contract is needed to track the amount of DAI for Aave since we could simply target the aToken address with the appropriate `balanceOf` for the asset allocation, but for the purpose of illustration, we have one that simply takes in the aToken and account addresses and returns `aToken.balanceOf(account)`.

The Uniswap example requires computing the underlyer amount from the LP token amount and total supply.

The Curve example is similar to Uniswap but also requires obtaining balances from the liquidity gauge, aka staking contract.

### Execute strategy

The APY.Finance system is able to able to interact with any DeFi protocol through the use of "generic execution". Simply put, off-chain scripts use encoded function calldata passed into the Account Manager's `execute` function.

As with registration, examples are provided:

- `make audit_testing step=execute_aave`
- `make audit_testing step=execute_uniswap`
- `make audit_testing step=execute_curve`

### Liquidate strategy

The example scripts will remove liquidity from the protocol.

- `make audit_testing step=liquidate_aave`
- `make audit_testing step=liquidate_uniswap`
- `make audit_testing step=liquidate_curve`

### Withdraw from account to pools

Similar to funding an account, the pool manager's `withdrawFromAccount` function takes in an ID and pool distribution.

- withdraw funds from strategy account to pools
  `make audit_testing step=withdraw`

### User operations

These scripts let you engage in user actions, e.g. depositing into APY.Finance.

- deposit into APY stablecoin pool:  
  `HARDHAT_NETWORK=localhost scripts/audit_testing/user_deposit.js --amount=1000 --pool=usdc`
- withdraw from APY stablecoin pool:  
  `HARDHAT_NETWORK=localhost scripts/audit_testing/user_withdraw.js --amount 125 --pool=usdc`

### Check deployed TVL

The deployed TVL may take some time to update after an account has been funded or pushed funds to the pools. Note that after any transfer between pool(s) and account, the TVL must be updated by Chainlink before any further transfers in or out of pools are allowed (there is an explicit check in the mAPT token to revert any `getTVL` call until the Chainlink update has happened).

- check deployed TVL:  
  `make audit_testing step=check_tvl`

## Chainlink TVL adapter

Further info: [APY.Finance Chainlink doc](../../chainlink.md)

## Generic execution

When constructing encoded function calldata thats passed into the Account Manager's execute function, the data is constructed with both the executable bytecode and the target address the bytecode will be executed against. The executable bytecode is the function signature + the function parameters encoded.

For example consider an approval made against the DAI ERC20 contract that allows `0xD95C560b7662cB209725941bd9828644Bbf19Cb1` to move the max uint256 funds.

```
[
  '0x6b175474e89094c44da98b954eedeac495271d0f'
  '0x095ea7b3000000000000000000000000d95c560b7662cb209725941bd9828644bbf19cb1ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
]
```

When passed into the AccountManager's `execute()` targeting a deployed account, the result is the deployed account giving the allowance of max uint256 to `0xD95C560b7662cB209725941bd9828644Bbf19Cb1`

Note: the same scheme is used for registering look up data within the TVL Manager.

## Error/Revert messages

- `ProviderError: VM Exception while processing transaction: revert No data present`  
  Only happens when no TVL has been submitted to the FluxAggregator yet. Usually happens when attempting an operation too soon after starting the Chainlink node.
- `ProviderError: VM Exception while processing transaction: revert CHAINLINK_STALE_DATA`  
  Likely means that the TVL has not updated since funds were transferred between the account and the pool(s). Waiting until the TVL updates will likely resolve the issue.
