require("dotenv").config();
const { TOKEN_AGG_MAP } = require("../utils/constants.js");
const { updateDeployJsons, erc20 } = require("../utils/helpers.js");

const totalSupply = erc20("100000000", "18"); // 100MM

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");
  console.log(
    `Total supply: ${totalSupply.toString()}  (length: ${
      totalSupply.toString().length
    })`
  );
  console.log("");

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYGovernanceToken = await ethers.getContractFactory(
    "APYGovernanceToken"
  );
  const APYGovernanceTokenProxy = await ethers.getContractFactory(
    "APYGovernanceTokenProxy"
  );

  let deploy_data = {};

  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  deploy_data["APYProxyAdmin"] = proxyAdmin.address;
  console.log(`ProxyAdmin: ${proxyAdmin.address}`);

  const logic = await APYGovernanceToken.deploy();
  await logic.deployed();
  deploy_data["APYGovernanceToken"] = logic.address;
  console.log(`Implementation Logic: ${logic.address}`);

  const proxy = await APYGovernanceTokenProxy.deploy(
    logic.address,
    proxyAdmin.address,
    totalSupply
  );
  await proxy.deployed();
  deploy_data["APYGovernanceTokenProxy"] = proxy.address;
  console.log(`Proxy: ${proxy.address}`);

  await updateDeployJsons(NETWORK_NAME, deploy_data);
}

main()
  .then(() => {
    console.log("Deployment successful.");
    console.log("");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    console.log("");
    process.exit(1);
  });
