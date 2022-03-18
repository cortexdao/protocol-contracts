const hre = require("hardhat");
const { ethers, web3 } = hre;
const { BigNumber } = ethers;
const { expect } = require("chai");
const { console } = require("../utils/helpers");

const ZERO_DATA =
  "0000000000000000000000000000000000000000000000000000000000000000";

/*
This is the expected storage layout of the GovernanceToken contract, based on
the following external package:

@openzeppelin/openzeppelin-ethereum-packages@3.0.0

-------------------------------------------------------------
The C3-linearization was logically derived and then validated using
the `surya` package:

$ yarn surya dependencies GovernanceToken contracts/rewards/GovernanceToken.sol

GovernanceToken
  ↖ ERC20UpgradeSafe
  ↖ OwnableUpgradeSafe
  ↖ Initializable

$ yarn surya dependencies GovernanceTokenV2 contracts/rewards/GovernanceTokenV2.sol

GovernanceTokenV2
  ↖ ITimeLocked
  ↖ ERC20UpgradeSafe
  ↖ OwnableUpgradeSafe
  ↖ Initializable

Initializable:
  0 bool initialized;
  0 bool initializing;
  1-50 uint256[50] ______gap;
ContextUpgradeSafe:
  51-100 uint256[50] __gap;
OwnableUpgradeSafe:
  101 address _owner; 
  102-150 uint256[49] __gap;
ERC20UpgradeSafe:
  151 mapping (address => uint256) _balances;
  152 mapping (address => mapping (address => uint256)) _allowances;
  153 uint256 _totalSupply;
  154 string _name;
  155 string _symbol;
  156 uint8 _decimals;
  157-200 uint256[44] __gap;

GovernanceToken V1
  201 address proxyAdmin;

// don't need to test these, since there is no possible conflict;
// just leaving for future reference
GovernanceToken V2
  202 uint256 lockEnd;
  203-204 EnumerableSet.AddressSet _lockers;
    struct Set {
        bytes32[] _values;
        mapping (bytes32 => uint256) _indexes;
    }
  205 mapping(address => uint256) _lockedAmount;

*/

describe("GovernanceTokenV2 retains V1 storage slot positions", () => {
  const [name, symbol, decimals] = ["APY Governance Token", "APY", 18];
  const [minted, transferred, allowance] = [100e6, 30e6, 10e6];

  let deployer;
  let user;
  let otherUser;

  let govToken;
  let proxyAdmin;

  before(async () => {
    [deployer, user, otherUser] = await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const GovernanceTokenProxy = await ethers.getContractFactory(
      "GovernanceTokenProxy"
    );
    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const GovernanceTokenV2 = await ethers.getContractFactory(
      "GovernanceTokenV2"
    );

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const logicV1 = await GovernanceToken.deploy();
    await logicV1.deployed();
    const proxy = await GovernanceTokenProxy.deploy(
      logicV1.address,
      proxyAdmin.address,
      minted
    );
    await proxy.deployed();

    const logicV2 = await GovernanceTokenV2.deploy();
    await logicV2.deployed();
    await proxyAdmin.connect(deployer).upgrade(proxy.address, logicV2.address);

    govToken = await GovernanceTokenV2.attach(proxy.address);

    await govToken.connect(deployer).transfer(user.address, transferred);
    await govToken.approve(otherUser.address, allowance);
  });

  it("Retains V1 storage slots 0 through 201", async () => {
    const numSlots = 205;
    const slots = [];
    for (let i = 0; i < numSlots; i++) {
      const data = await readSlot(govToken.address, i);
      console.debug(`${i}: ${data}`);
      slots.push(data);
    }

    // 0 bool initialized;
    // 0 bool initializing;
    // NOTE: tight-packing will right-align
    expect(slots[0].slice(-4, -2)).to.equal("00"); // initializing
    expect(slots[0].slice(-2)).to.equal("01"); // initialized

    // 101 address _owner;
    expect(parseAddress(slots[101])).to.equal(deployer.address);
    // 151 mapping (address => uint256) _balances;
    expect(slots[151]).to.equal(ZERO_DATA);
    // 152 mapping (address => mapping (address => uint256)) _allowances;
    expect(slots[152]).to.equal(ZERO_DATA);
    // 153 uint256 _totalSupply;
    expect(parseUint(slots[153])).to.equal(minted);
    // 154 string _name;
    expect(parseString(slots[154])).to.equal(name);
    // 155 string _symbol;
    expect(parseString(slots[155])).to.equal(symbol);
    // 156 uint8 _decimals;
    expect(parseUint(slots[156])).to.equal(decimals);
    // 201 address proxyAdmin;
    expect(parseAddress(slots[201])).to.equal(proxyAdmin.address);
  });

  it("Retains V1 storage slots for balances mapping", async () => {
    // _balances[deployer]
    let v = parseInt(
      await readSlot(
        govToken.address,
        addressMappingSlot(deployer.address, 151)
      ),
      16
    );
    expect(v).to.equal(minted - transferred);

    // _balances[user]
    v = parseInt(
      await readSlot(govToken.address, addressMappingSlot(user.address, 151)),
      16
    );
    expect(v).to.equal(transferred);
  });

  it("Retains V1 storage slots for allowances mapping", async () => {
    // _allowances[deployer][user]
    let v = parseInt(
      await readSlot(
        govToken.address,
        address2MappingSlot(deployer.address, user.address, 152)
      ),
      16
    );
    expect(v).to.equal(0);

    // _allowances[deployer][otherUser]
    v = parseInt(
      await readSlot(
        govToken.address,
        address2MappingSlot(deployer.address, otherUser.address, 152)
      ),
      16
    );
    expect(v).to.equal(allowance);
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
