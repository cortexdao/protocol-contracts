require('dotenv').config();
const { TOKEN_AGG_MAP } = require('../utils/constants.js')
const { updateDeployJsons } = require('../utils/helpers.js')

const ContractData = artifacts.require(
  "APYLiquidityPoolImplementation"
);

async function main() {
  const NETWORK_NAME = network.name.toUpperCase()
  console.log(`${NETWORK_NAME} selected`)

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin")
  const APYLiquidityPoolImplementation = await ethers.getContractFactory("APYLiquidityPoolImplementation")
  const APYLiquidityPoolProxy = await ethers.getContractFactory("APYLiquidityPoolProxy")

  const proxyAdmin = await ProxyAdmin.attach('0x6Ba40096c7629d3C5501b5b077dFC1d3F54f58FC')

  const logic = await APYLiquidityPoolImplementation.deploy()
  await logic.deployed()
  console.log(`Implementation Logic: ${logic.address}`)

  const proxy = await APYLiquidityPoolProxy.attach('0x6856903E7087fbdB5459362250426c878C5FdD73')

  const iImplementation = new ethers.utils.Interface(ContractData.abi);
  const initData = iImplementation.encodeFunctionData("initializeUpgrade", [])

  // NOTE: Select 1 of the following
  await proxyAdmin.upgradeAndCall(proxy.address, logic.address, initData)
  // await proxyAdmin.upgrade(proxy.address, newLogic.address)

  //Update Jsons
  let deploy_data = {}
  deploy_data['APYLiquidityPoolImplementation'] = logic.address
  await updateDeployJsons(NETWORK_NAME, deploy_data)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });