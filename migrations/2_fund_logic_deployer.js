var AssetOracle = artifacts.require("AssetOracle");
var FundLogic = artifacts.require("FundLogic");
var FundDeployer = artifacts.require("FundDeployer");
var BuybackVault = artifacts.require("BuybackVault");

module.exports = async function(deployer) {
    var buybackFee = 100;
    var paraswapTokenProxy = "0xb70bc06d2c9bf03b3373799606dc7d39346c06b3";
    var paraswapAugustus = "0x1bD435F3C054b6e901B7b108a0ab7617C808677b";
    var uniswapRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    var BOTS = "0xf9fbe825bfb2bf3e387af0dc18cac8d87f29dea8";


    var oracle = await AssetOracle.deployed();
    oracle = oracle.address;

    await deployer.deploy(
        BuybackVault,
        paraswapTokenProxy,
        paraswapAugustus,
        uniswapRouter,
        BOTS
    );

    var buybackVault = await BuybackVault.deployed();

    await deployer.deploy(FundLogic, {gas: 6721975});
    var logic = await FundLogic.deployed();
    logic = logic.address;

    console.log("Logic deployed at: "+logic);

    await deployer.deploy(
        FundDeployer,
        oracle,
        buybackFee,
        paraswapTokenProxy,
        paraswapAugustus,
        buybackVault.address,
        logic
    );
    var fundDeployer = await FundDeployer.deployed();
    await fundDeployer.changeFeeWaitPeriod(1); // Fee wait period 1 second for testing
    await buybackVault.changeDeployer(fundDeployer.address);

    console.log("Deployed FundDeployer with logic at: "+logic);
}