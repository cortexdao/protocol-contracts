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

## Deployed addresses (Mainnet)

### APY Governance Token

Deployer: [0x7E9b0669018a70D6EfCCA2b11850A704DB0E5b04](https://etherscan.io/address/0x7E9b0669018a70D6EfCCA2b11850A704DB0E5b04)

Token (proxy): [0x95a4492F028aa1fd432Ea71146b433E7B4446611](https://etherscan.io/token/0x95a4492F028aa1fd432Ea71146b433E7B4446611)

- admin: [0x3DEA1f053ab24b0c5B0C663B1c07B6b702e973D9](https://etherscan.io/address/0x3DEA1f053ab24b0c5B0C663B1c07B6b702e973D9)
- logic: [0x561aF1eC26491A89E3907fb11eed479843240b62](https://etherscan.io/address/0x561aF1eC26491A89E3907fb11eed479843240b62)

### APY Pool Tokens

Deployer: [0x6EAF0ab3455787bA10089800dB91F11fDf6370BE](https://etherscan.io/address/0x6EAF0ab3455787bA10089800dB91F11fDf6370BE)\
Proxy admin: [0x7965283631253DfCb71Db63a60C656DEDF76234f](https://etherscan.io/address/0x7965283631253DfCb71Db63a60C656DEDF76234f)

DAI (proxy): [0x75CE0E501e2E6776FcAAa514f394a88a772A8970](https://etherscan.io/address/0x75CE0E501e2E6776FcAAa514f394a88a772A8970)

- logic: [0x213db3017dF4cB07338d7D3505296119649DfbD8](https://etherscan.io/address/0x213db3017dF4cB07338d7D3505296119649DfbD8)

USDC (proxy): [0xe18b0365D5D09F394f84eE56ed29DD2d8D6Fba5f](https://etherscan.io/address/0xe18b0365D5D09F394f84eE56ed29DD2d8D6Fba5f)

- logic: [0xe820B993D465B38443DC371C5Dcd47C6015C8f5e](https://etherscan.io/address/0xe820B993D465B38443DC371C5Dcd47C6015C8f5e)

USDT (proxy): [0xeA9c5a2717D5Ab75afaAC340151e73a7e37d99A7](https://etherscan.io/address/0xeA9c5a2717D5Ab75afaAC340151e73a7e37d99A7)

- logic: [0x21347bF816051ffa9a6456536Fcdd2CEA44BcE75](https://etherscan.io/address/0x21347bF816051ffa9a6456536Fcdd2CEA44BcE75)

### Liquidity-Bootstrapping Pool

Deployer: [0xC98A0A4d9D9F789b86f03AbfdcEaEE7e3538e3dF](https://etherscan.io/address/0xC98A0A4d9D9F789b86f03AbfdcEaEE7e3538e3dF)

CRP: [0xCB1a0b99755bdcaA9254219e1A22a6519b169F5f](https://etherscan.io/address/0xCB1a0b99755bdcaA9254219e1A22a6519b169F5f)

BPool: [0x86ecA06D0f1FeC418FaC3bd3ef5382A9F8981f0d](https://etherscan.io/address/0x86ecA06D0f1FeC418FaC3bd3ef5382A9F8981f0d)

Pokebot:[0xEebc210C5b12c5260C97D4b4b49bAa273Db93EB8](https://etherscan.io/address/0xEebc210C5b12c5260C97D4b4b49bAa273Db93EB8)

**Note:** LBP deployer also seeded the Uniswap and Balancer pools.

### Rewards claiming

Deployer: [0x6c38e52291dB5F080E85aB7a9c9405f9750df7B9](https://etherscan.io/address/0x6c38e52291dB5F080E85aB7a9c9405f9750df7B9)

Rewards Distributor: [0x2E11558316df8Dde1130D81bdd8535f15f70B23d](https://etherscan.io/address/0x2E11558316df8Dde1130D81bdd8535f15f70B23d)

### LP staking

Deployer: [0x24971BC1296A7F7408D3ddB985eB50813652dc82](https://etherscan.io/address/0x24971BC1296A7F7408D3ddB985eB50813652dc82)

Balancer Pool: [0xbC8B1f78ff5a0baF9945E145832ad79C494d4CF6](https://etherscan.io/address/0xbC8B1f78ff5a0baF9945E145832ad79C494d4CF6)\
Balancer Staking: [0xFe82ea0Ef14DfdAcd5dB1D49F563497A1a751bA1](https://etherscan.io/address/0xFe82ea0Ef14DfdAcd5dB1D49F563497A1a751bA1)

Uniswap Pool: [0xF043c39A106db6B58C76995F30Ba35fD211c3b76](https://etherscan.io/address/0xF043c39A106db6B58C76995F30Ba35fD211c3b76)\
Uniswap Staking: [0x0310DEE97b42063BbB46d02a674727C13eb79cFD](https://etherscan.io/address/0x0310DEE97b42063BbB46d02a674727C13eb79cFD)

# Deployment and Unroll of Capital

![deployment](https://github.com/apy-finance/apy-core/blob/d73b9121806b61d5d184447ab0dc9c339aa0b456/DeploymentOfCapital.png?raw=true)
![unroll](https://github.com/apy-finance/apy-core/blob/d73b9121806b61d5d184447ab0dc9c339aa0b456/UnrollOfCapital.png?raw=true)
