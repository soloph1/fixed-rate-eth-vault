# Fixed Rate ETH Vault

## Specifications

Hopefully, you are familiar with the LSD product offered on top of the Stakehouse protocol; if not, please take a look here: https://docs.joinstakehouse.com/lsd/overview

Take a look at the section on giant pools. Users can stake in either to either choose between a fixed rate of return from consensus layer yield or get unpredictable but potentially higher returns from the fees and mev pool.

What if users can get a fixed rate of return using both sources? The idea is that they supply ETH, and someone else manages that ETH to ensure a fixed rate of return.  

Challenge:
Create a yearn vault-style contract that will take ETH from users and give them an LP token back. The vault manager can choose to re-market that with either giant pool mentioned above in order to get LP tokens from those contracts. The ETH from users cannot be used for other purposes other than depositing ETH into giant pools (using `depositETH` method as appropriate). 

- Withdraw dETH from giant savETH pool contract and method for selling the dETH for ETH on UniswapClaim
- ETH rewards from giant fees and mev pool contract into your contract
- Claim percentage of profits i.e. the contract will give users a fixed rate of return where any excess profits go to the manager of the contract

You can get a preview of the LSD contracts here to give you an idea of methods available for this: https://github.com/stakehouse-dev/lsd-arena 

You can also use docs on LSD wizard above to find out other info.
Take a look here for contract addresses for giant pools: https://github.com/stakehouse-dev/contract-deployments#goerli-deployment-1 

## Development steps

- Review Giant Pools (https://docs.joinstakehouse.com/lsd/giantPools)
- Review Giant Pools contracts (https://github.com/stakehouse-dev/lsd-arena/tree/main/contracts/liquid-staking)
  Mainly GiantMevAndFeesPool and GiantSavETHVaultPool contracts. (including SavETHVault, LiquidStakingManager, SyndicateRewardsProcessor contracts)
- Check contract addresses deployed on Goerli network (https://github.com/stakehouse-dev/contract-deployments#goerli-deployment)
  Check verified status - not verified
  Check some example transaction history available on etherscan
- Setup repositroy / hardhat configuration
- Introduce GiantPool contracts interface
- Introduce Uniswap V3 interface
- Write Vault contract
- Write Strategy contract
- Write tests for vault contract
- Write tests for strategy contract
  example transaction for withdrawDETH - https://goerli.etherscan.io/tx/0x6c2046f241629179b9e7fa93beb6e4cee894213dace93f267407389b0965f119
  example transaction for claimRewards - https://goerli.etherscan.io/tx/0xb47e1ee404b70707216d4ffca46b4b90eb2828684a9a7a4ae4b5d901499d1fa5
- Increase test coverage

## Hardhat

### Update `.env`
```
GOERLI_URL=goerli rpc url for forking
ETHERSCAN_API_KEY=etherscan api key for contracts verification
```

### Compile contracts
```
yarn compile
```

### Run tests
```
yarn test
```

### Run coverage tests
```
yarn coverage
```
