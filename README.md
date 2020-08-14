# APY Smart Contracts

TODOs:
- [ ] Continuous integration
- [ ] Links to architectural diagrams / specs

## Install Dependencies

`npm install`

## Compile Contracts

`npx buidler compile`

## Run Tests

### Unit tests
`npx buidler test` or `npm test`

### Integration tests
In one console:

`npm run ganache`

and in another console:

`npm run integration`

Comments:
- ganache script runs a forked mainnet using `ganache-cli`.
- the timeout for tests may need to be adjusted; the `timeout`
  variable is near the top of `integration/test_1inch.js`
