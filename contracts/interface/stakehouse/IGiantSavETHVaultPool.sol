// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./IGiantPoolBase.sol";

interface IGiantSavETHVaultPool is IGiantPoolBase {
    function withdrawDETH(
        address[] calldata _savETHVaults,
        address[][] calldata _lpTokens,
        uint256[][] calldata _amounts
    ) external;

    function batchDepositETHForStaking(
        address[] calldata _savETHVaults,
        uint256[] calldata _ETHTransactionAmounts,
        bytes[][] calldata _blsPublicKeys,
        uint256[][] calldata _stakeAmounts
    ) external;
}
