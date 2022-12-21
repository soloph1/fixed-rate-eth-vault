// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IStrategy {
    function withdraw(address user, uint256 amount) external;
}
