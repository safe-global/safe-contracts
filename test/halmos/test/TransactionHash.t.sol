// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import {Safe} from "../../../contracts/Safe.sol";
import {CompatibilityFallbackHandler} from "../../../contracts/handler/CompatibilityFallbackHandler.sol";
import {SafeProxy} from "../../../contracts/proxies/SafeProxy.sol";
import {Enum} from "../../../contracts/interfaces/Enum.sol";

interface Vm {
    function chainId(uint256 newChainId) external;
}

contract TransactionHashTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool delegateCall;
        uint256 safeTxGas;
        uint256 baseGas;
        uint256 gasPrice;
        address gasToken;
        address refundReceiver;
        uint256 nonce;
    }

    Safe private safe;
    CompatibilityFallbackHandler private handlerThroughSafe;

    function setUp() public {
        Safe singleton = new Safe();
        CompatibilityFallbackHandler handler = new CompatibilityFallbackHandler();
        address payable proxy = payable(address(new SafeProxy(address(singleton))));
        safe = Safe(proxy);
        handlerThroughSafe = CompatibilityFallbackHandler(proxy);

        address[] memory owners = new address[](1);
        owners[0] = address(this);
        safe.setup(owners, 1, address(0), "", address(handler), address(0), 0, address(0));
    }

    function checkTransactionHash(Transaction memory txn, uint256 chainId) public {
        vm.chainId(chainId);
        Enum.Operation operation = txn.delegateCall ? Enum.Operation.DelegateCall : Enum.Operation.Call;
        bytes32 actual;
        try safe.getTransactionHash(
            txn.to, txn.value, txn.data, operation, txn.safeTxGas,
            txn.baseGas, txn.gasPrice, txn.gasToken, txn.refundReceiver, txn.nonce
        ) returns (bytes32 hash) {
            actual = hash;
        } catch {
            fail();
        }

        try handlerThroughSafe.encodeTransactionData(
            txn.to, txn.value, txn.data, operation, txn.safeTxGas,
            txn.baseGas, txn.gasPrice, txn.gasToken, txn.refundReceiver, txn.nonce
        ) returns (bytes memory preimage) {
            if (actual != keccak256(preimage)) fail();
        } catch {
            fail();
        }
    }

    function fail() private pure {
        // Halmos recognizes Panic(0x01) as an assertion failure.
        // Solidity 0.7.6 emits INVALID for assert, so encode Panic explicitly.
        assembly {
            mstore(0, shl(224, 0x4e487b71))
            mstore(4, 1)
            revert(0, 36)
        }
    }
}
