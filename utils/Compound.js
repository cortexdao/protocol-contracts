const Compound = require('@compound-finance/compound-js');
const Constants = require('@compound-finance/compound-js/dist/nodejs/src/constants.js')

const cDAI = {
  address: Compound.util.getAddress(Compound.cDAI),
  interface: new ethers.utils.Interface(Constants.abi.cErc20),
  abi: Constants.abi.cErc20
}

const DAI = {
  address: Compound.util.getAddress(Compound.DAI),
  interface: new ethers.utils.Interface(Constants.abi.Erc20),
  abi: Constants.abi.Erc20
}

const COMP = {
  address: Compound.util.getAddress(Compound.COMP),
  interface: new ethers.utils.Interface(Constants.abi.Erc20),
  abi: Constants.abi.Erc20
}

const COMPTROLLER = {
  address: Compound.util.getAddress(Compound.COMPTROLLER),
  interface: new ethers.utils.Interface(Constants.abi.Comptroller),
  abi: Constants.abi.Comptroller
}

module.exports = {
  cDAI,
  DAI,
  COMP,
  COMPTROLLER
}
