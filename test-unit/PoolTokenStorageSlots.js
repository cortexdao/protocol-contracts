const hre = require("hardhat");
const { artifacts, ethers, waffle, web3 } = hre;
const { BigNumber } = ethers;
const { expect } = require("chai");
const { deployMockContract } = waffle;
const { console, bytes32 } = require("../utils/helpers");
const AddressRegistryV2 = artifacts.require("AddressRegistryV2");

const ZERO_DATA =
  "0000000000000000000000000000000000000000000000000000000000000000";

/*
This is the expected storage layout of the APT contract, based on
the following external package:

@openzeppelin/openzeppelin-ethereum-packages@3.0.0

-------------------------------------------------------------
The C3-linearization was logically derived and then validated using
the `surya` package:

$ yarn surya dependencies PoolToken contracts/PoolToken.sol
yarn run v1.22.5
$ /Users/suh/git/apy-core/node_modules/.bin/surya dependencies PoolToken contracts/PoolToken.sol
PoolToken
  ↖ ERC20UpgradeSafe
  ↖ PausableUpgradeSafe
  ↖ ReentrancyGuardUpgradeSafe
  ↖ OwnableUpgradeSafe
  ↖ Initializable
  ↖ ILiquidityPool
✨  Done in 1.81s.
-------------------------------------------------------------

Initializable:
  0 bool initialized;
  0 bool initializing;
  1-50 uint256[50] ______gap;
ContextUpgradeSafe:
  51-100 uint256[50] __gap;
OwnableUpgradeSafe:
  101 address _owner;
  102-150 uint256[49] __gap;
ReentrancyGuardUpgradeSafe:
  151 bool _notEntered;
  152-200 uint256[49] __gap;
PausableUpgradeSafe:
  201 bool _paused;
  202-250 uint256[49] __gap;
ERC20UpgradeSafe:
  251 mapping (address => uint256) _balances;
  252 mapping (address => mapping (address => uint256)) _allowances;
  253 uint256 _totalSupply;
  254 string _name;
  255 string _symbol;
  256 uint8 _decimals;
  257-300 uint256[44] __gap;

APY.Finance APT V1
  301 address public proxyAdmin;
  301 bool public addLiquidityLock;
  301 bool public redeemLock;
  302 IDetailedERC20 public underlyer;
  // 303 AggregatorV3Interface public priceAgg; <-- removed in V2

APY.Finance APT V2
  303 IAddressRegistryV2 public addressRegistry; <-- replaces V1 slot
  304 uint256 public feePeriod;
  305 uint256 public feePercentage;
  306 mapping(address => uint256) public lastDepositTime;
*/

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("APT V2 uses V1 storage slot positions", () => {
  const [name, symbol, decimals] = ["APY Pool Token", "APT", 18];
  const [minted, transferred, allowance] = [100e6, 30e6, 10e6];

  let deployer;
  let emergencySafe;
  let adminSafe;
  let user;
  let otherUser;

  let poolToken;
  let proxyAdmin;
  let agg;
  let underlyer;
  let addressRegistry;

  before(async () => {
    [
      deployer,
      emergencySafe,
      adminSafe,
      user,
      otherUser,
    ] = await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const PoolTokenProxy = await ethers.getContractFactory("PoolTokenProxy");
    const PoolToken = await ethers.getContractFactory("TestPoolToken");
    const PoolTokenV2 = await ethers.getContractFactory("TestPoolTokenV2");

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    agg = await deployMockContract(deployer, []);
    underlyer = await deployMockContract(deployer, []);
    addressRegistry = await deployMockContract(deployer, AddressRegistryV2.abi);

    // these addresses are assigned roles in PoolTokenV2 init
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("adminSafe"))
      .returns(adminSafe.address);

    const logicV1 = await PoolToken.deploy();
    await logicV1.deployed();
    const proxy = await PoolTokenProxy.deploy(
      logicV1.address,
      proxyAdmin.address,
      underlyer.address,
      agg.address
    );
    await proxy.deployed();

    const logicV2 = await PoolTokenV2.deploy();
    await logicV2.deployed();

    const initData = PoolTokenV2.interface.encodeFunctionData(
      "initializeUpgrade(address)",
      [addressRegistry.address]
    );
    await proxyAdmin
      .connect(deployer)
      .upgradeAndCall(proxy.address, logicV2.address, initData);

    poolToken = await PoolTokenV2.attach(proxy.address);

    await poolToken.connect(emergencySafe).lock();
    await poolToken.testMint(deployer.address, minted);
    await poolToken.connect(emergencySafe).lockAddLiquidity();
    await poolToken.connect(emergencySafe).lockRedeem();
    await poolToken.testTransfer(deployer.address, user.address, transferred);
    await poolToken.approve(otherUser.address, allowance);
  });

  it("Retains original storage slots 0 through 302", async () => {
    const numSlots = 307;
    const slots = [];
    for (let i = 0; i < numSlots; i++) {
      const data = await readSlot(poolToken.address, i);
      console.debug(`${i}: ${data}`);
      slots.push(data);
    }

    // 0 bool initialized;
    // 0 bool initializing;
    // NOTE: tight-packing will right-align
    expect(slots[0].slice(-4, -2)).to.equal("00"); // initializing
    expect(slots[0].slice(-2)).to.equal("01"); // initialized

    // 101 address _owner;
    // NOTE: in the V2 upgrade, this slot has been repurposed
    // for AccessControl's _roles mapping
    expect(parseAddress(slots[101])).to.equal(deployer.address);
    // 151 bool _notEntered;
    expect(slots[151].slice(-2)).to.equal("01");
    // 201 bool _paused;
    expect(slots[201].slice(-2)).to.equal("01");
    // 251 mapping (address => uint256) _balances;
    expect(slots[251]).to.equal(ZERO_DATA);
    // 252 mapping (address => mapping (address => uint256)) _allowances;
    expect(slots[252]).to.equal(ZERO_DATA);
    // 253 uint256 _totalSupply;
    expect(parseUint(slots[253])).to.equal(minted);
    // 254 string _name;
    expect(parseString(slots[254])).to.equal(name);
    // 255 string _symbol;
    expect(parseString(slots[255])).to.equal(symbol);
    // 256 uint8 _decimals;
    expect(parseUint(slots[256])).to.equal(decimals);
    // 301 address public proxyAdmin;
    // 301 bool public addLiquidityLock;
    // 301 bool public redeemLock;
    expect(parseAddress(slots[301])).to.equal(proxyAdmin.address);
    expect(slots[301].slice(0, 24).slice(-4)).to.equal("0101");
    // 302 IDetailedERC20 public underlyer;
    expect(parseAddress(slots[302])).to.equal(underlyer.address);
  });

  it("Replaces original slot 303", async () => {
    // 303 AggregatorV3Interface public priceAgg; <-- removed in V2
    // 303 IAddressRegistryV2 public addressRegistry; <-- replaces V1 slot
    const data = await readSlot(poolToken.address, 303);
    console.debug(`${303}: ${data}`);
    expect(parseAddress(data)).to.equal(addressRegistry.address);
  });

  it("Retains original storage slots for balances mapping", async () => {
    // _balances[deployer]
    let v = parseInt(
      await readSlot(
        poolToken.address,
        addressMappingSlot(deployer.address, 251)
      ),
      16
    );
    expect(v).to.equal(minted - transferred);

    // _balances[user]
    v = parseInt(
      await readSlot(poolToken.address, addressMappingSlot(user.address, 251)),
      16
    );
    expect(v).to.equal(transferred);
  });

  it("Retains original storage slots for allowances mapping", async () => {
    // _allowances[deployer][user]
    let v = parseInt(
      await readSlot(
        poolToken.address,
        address2MappingSlot(deployer.address, user.address, 252)
      ),
      16
    );
    expect(v).to.equal(0);

    // _allowances[deployer][otherUser]
    v = parseInt(
      await readSlot(
        poolToken.address,
        address2MappingSlot(deployer.address, otherUser.address, 252)
      ),
      16
    );
    expect(v).to.equal(allowance);
  });

  it("Roles mapping replacing old storage slot uses expected slots", async () => {
    // PoolTokenV2's init function will setup roles, which is a
    //
    // mapping (bytes32 => struct)
    //
    // with the struct being
    //
    // RoleData {
    //   EnumerableSet.AddressSet members;
    //   bytes32 adminRole;
    // }
    //
    // The struct will start with a dynamic array of values in the
    // EnumerableSet, so its first slot will hold the length of
    // the array.
    const EMERGENCY_ROLE = await poolToken.EMERGENCY_ROLE();
    let data = await readSlot(
      poolToken.address,
      bytes32MappingSlot(EMERGENCY_ROLE, 101)
    );
    expect(data).to.not.equal(ZERO_DATA);

    const ADMIN_ROLE = await poolToken.ADMIN_ROLE();
    data = await readSlot(
      poolToken.address,
      bytes32MappingSlot(ADMIN_ROLE, 101)
    );
    expect(data).to.not.equal(ZERO_DATA);
  });
});

async function readSlot(address, slot) {
  const data = await web3.eth.getStorageAt(address, slot);
  return data.replace(/^0x/, "");
}

function parseAddress(hex) {
  return web3.utils.toChecksumAddress(hex.slice(-40).padStart(40, "0"));
}

function parseString(hex) {
  const len = parseInt(hex.slice(-2), 16);
  return Buffer.from(hex.slice(0, len), "hex").toString("utf8");
}

function parseUint(hex) {
  return BigNumber.from("0x" + hex);
}

function encodeUint(value) {
  return BigNumber.from(value).toHexString().padStart(64, "0");
}

function encodeAddress(address) {
  return address.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

function addressMappingSlot(address, position) {
  return web3.utils.keccak256(
    "0x" + encodeAddress(address) + encodeUint(position)
  );
}

function address2MappingSlot(address, address_2, position) {
  return web3.utils.keccak256(
    "0x" +
      encodeAddress(address_2) +
      addressMappingSlot(address, position).slice(2)
  );
}

function bytes32MappingSlot(address, position) {
  // same encoding logic as for address mapping
  return addressMappingSlot(address, position);
}
