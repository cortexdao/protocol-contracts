![CI](https://github.com/apy-finance/apy-core/workflows/CI/badge.svg?branch=develop)

# CORTEX DAO Smart Contracts

## Install Dependencies

`yarn install`

## Compile Contracts

`yarn compile`

## Run Tests

### Unit tests

`yarn test:unit`

### Integration tests

`yarn test:integration`

Comments:

- Hardhat node is used with mainnet forking which requires `ALCHEMY_API_KEY` to be set in a `.env` file
- the timeout for tests may need to be adjusted; the mocha `timeout` variable is set in `hardhat.config.js`

## Mainnet contracts

- LP Account
- TVL Manager
- Oracle Adapter

- Index Token (not deployed)
- LP Account Funder (not deployed)

## System architecture

Vault

- user deposits 3CRV tokens to mint index tokens
- user redeems index tokens to receive 3CRV tokens

LP Account

- funded by capital borrowed from the vault
- holds positions in multiple Convex gauges
- periodically harvests and re-invests rewards
- periodically rebalances the portfolio
- can only transfer funds using authorized routes, e.g. to the vault or into Convex position

TVL Manager

- Convex positions are registered here
- Chainlink nodes can query the manager for a list of all positions
- each position data includes the LP Account's balances in stablecoins
  and the symbol and decimals info for each stablecoin
- Chainlink nodes can therefore value each position using market prices
  and submit the TVL on-chain

Oracle Adapter

- wrapper contract around Chainlink price feeds
- all necessary oracle pricing, such as 3CRV price or system TVL, is obtained via this contract
- validation checks and safeguards allow proper functioning of the system were Chainlink to fail

## Periphery contracts

The core contracts for the system are listed in the previous section. The LP Account contract allows the registration of types of contracts used as "logic" contracts for delegate-calls from the LP Account:

- zap
- swap

### Zaps and Swaps

Zaps "install" the functionality for entering and withdrawing from Convex positions. Each zap has a name identifying the Convex position by pool name and enables the following functions on the LP Account for that position:

- deployStrategy
- unwindStrategy
- ...

A Swap "installs" the functionality for a particular set of swap routes. This enables swapping rewards or airdropped tokens to stablecoins tto be re-invested into the portfolio.

#### Registering a new zap

Zap registration is the only means of controlling the flow of funds from the LP Account and thus must be done after proper review of the zap contract. Registration can only be done through the Emergency Safe.

Zap state is never used; a zap is purely a logic contract for the delegatecalls made by the LP Account.

#### Removing an existing zap

### Allocations

The TVL Manager requires allocation contracts to be registered with it. An allocation contract for a Convex position decomposes the positioninto underlying balances that are reliably priced by Chainlink. This often requires decomposing LP tokens into its underlying coins and possibly, as in the case of lending protocols, a further unwrapping into base coins. The important observation here is that the allocation interface is general and allows a multitude of decompositions, as long as they reflect a realistic liquidation value for the position.

#### Registering a new allocation

### Removing an existing allocation
