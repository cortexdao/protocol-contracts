const Compound = require('@compound-finance/compound-js');
const Constants = require('@compound-finance/compound-js/dist/nodejs/src/constants.js')

const cDAI = {
  address: Compound.util.getAddress(Compound.cDAI),
  interface: new ethers.utils.Interface(Constants.abi.cErc20),
  abi: Constants.abi.cErc20
}

module.exports = {
  cDAI
}
