// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./IGiantPoolBase.sol";

interface IGiantMevAndFeesPool is IGiantPoolBase {
    function claimRewards(
        address _recipient,
        address[] calldata _stakingFundsVaults,
        bytes[][] calldata _blsPublicKeysForKnots
    ) external;

    function batchDepositETHForStaking(
        address[] calldata _stakingFundsVault,
        uint256[] calldata _ETHTransactionAmounts,
        bytes[][] calldata _blsPublicKeyOfKnots,
        uint256[][] calldata _amounts
    ) external;
}
