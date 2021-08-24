// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/EnumerableSet.sol";
import {INameIdentifier} from "contracts/interfaces/INameIdentifier.sol";

library NamedAddressSet {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Set {
        EnumerableSet.AddressSet _namedAddresses;
        mapping(string => INameIdentifier) _nameLookup;
    }

    function add(Set storage set, INameIdentifier namedAddress) internal {
        require(Address.isContract(address(namedAddress)), "INVALID_ADDRESS");
        require(
            !set._namedAddresses.contains(address(namedAddress)),
            "DUPLICATE_ADDRESS"
        );

        string memory name = namedAddress.NAME();
        require(bytes(name).length != 0, "INVALID_NAME");
        require(address(set._nameLookup[name]) != address(0), "DUPLICATE_NAME");

        set._namedAddresses.add(address(namedAddress));
        set._nameLookup[name] = namedAddress;
    }

    function remove(Set storage set, string memory name) internal {
        address namedAddress = address(set._nameLookup[name]);
        require(namedAddress != address(0), "INVALID_NAME");

        set._namedAddresses.remove(namedAddress);
        delete set._nameLookup[name];
    }

    function get(Set storage set, string memory name)
        internal
        view
        returns (INameIdentifier)
    {
        return set._nameLookup[name];
    }

    function names(Set storage set) internal view returns (string[] memory) {
        uint256 length = set._namedAddresses.length();
        string[] memory names_ = new string[](length);

        for (uint256 i = 0; i < length; i++) {
            INameIdentifier namedAddress =
                INameIdentifier(set._namedAddresses.at(i));
            names_[i] = namedAddress.NAME();
        }

        return names_;
    }
}
