![CI](https://github.com/apy-finance/apy-core/workflows/CI/badge.svg?branch=develop)

# APY Smart Contracts

TODOs:

- [ ] Continuous deployment
- [ ] Links to architectural diagrams / specs

## Install Dependencies

`yarn install`

## Compile Contracts

`yarn compile`

## Run Tests

### Unit tests

`yarn test:unit`

### Integration tests

In one console:

`yarn fork:mainnet`

and in another console:

`yarn test:integration --network localhost`

Comments:

- Forked mainnet uses `ganache-cli` with variables read from `.env` file.
  Get the `.env` values from a teammate.
- the timeout for tests may need to be adjusted; the `timeout`
  variable is near the top of the `integration/*.js` files.

## Generating mnemonics

Install Trezor's `mnemonic` python package:

```sh
pip3 install mnemonic
```

Then in your python console:

```python
>>> from mnemonic import Mnemonic
>>> mnemo = Mnemonic("english")
>>> words = mnemo.generate(strength=128)
>>> words
'autumn recycle monkey luxury draft cup cage scrub march bacon ask wisdom'
```
