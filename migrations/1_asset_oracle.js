var AssetOracle = artifacts.require("AssetOracle");

module.exports = async function(deployer) {
    await deployer.deploy(AssetOracle);
    var instance = await AssetOracle.deployed()
    var assets = [
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", //WETH
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", //WBTC
        "0xdAC17F958D2ee523a2206206994597C13D831ec7", //USDT
        "0x6b175474e89094c44da98b954eedeac495271d0f" //DAI
    ]
    var priceFeeds = [
        "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
        "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
        "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
        "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"
    ]
    await instance.addSupportedAssets(assets, priceFeeds)
}