// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;
import {IERC165} from "../../interfaces/IERC165.sol";
import {BaseTransactionGuard, ITransactionGuard} from "../../base/GuardManager.sol";
import {BaseModuleGuard, IModuleGuard} from "../../base/ModuleManager.sol";

/**
 * @title BaseGuard - Inherits BaseTransactionGuard and BaseModuleGuard.
 */
abstract contract BaseGuard is BaseTransactionGuard, BaseModuleGuard {
    /**
     * @inheritdoc IERC165.supportsInterface
     */
    function supportsInterface(bytes4 interfaceId) external view virtual override(BaseTransactionGuard, BaseModuleGuard) returns (bool) {
        return
            interfaceId == type(ITransactionGuard).interfaceId || // 0xe6d7a83a
            interfaceId == type(IModuleGuard).interfaceId || // 0xe1ab3a1a
            interfaceId == type(IERC165).interfaceId; // 0x01ffc9a7
    }

    function checkAfterExecution(bytes32, bool) external virtual override(ITransactionGuard, IModuleGuard);
}
