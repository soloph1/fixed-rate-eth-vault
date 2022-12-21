// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ISavETHVault {
    function isDETHReadyForWithdrawal(address _lpTokenAddress)
        external
        view
        returns (bool);
}
