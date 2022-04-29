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
