var AssetOracle = artifacts.require("AssetOracle");
const BN = require('bn.js');
var catchRevert = require('./../utils/revert_exceptions.js').catchRevert;

function getParsedPortofolio(port){
    var assets = []
    var amounts = []

    for (const [key, value] of Object.entries(port)) {
        assets.push(key);
        amounts.push(value);
    }

    return [assets, amounts];
}

contract("Assetoracle", async function (accounts){
    it("Gets good prices", async function () {
        var instance = await AssetOracle.deployed();
        var wbtc_1_value = await instance.assetValue("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 100000000);
        wbtc_1_value /= 10**8; // 8 decimals USD feeds
        console.log("wbtc_1_value decs: "+wbtc_1_value.toString())

        var usdt_1_value = await instance.assetValue("0xdAC17F958D2ee523a2206206994597C13D831ec7", 1000000);
        usdt_1_value /= 10**8; // 8 decimals USD feeds

        var usdt_5_value = await instance.assetValue("0xdAC17F958D2ee523a2206206994597C13D831ec7", 5000000);
        usdt_5_value /= 10**8; // 8 decimals USD feeds

        var weth_1_value = await instance.assetValue("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", new BN('1000000000000000000', 10));
        weth_1_value /= 10**8; // 8 decimals USD feeds
        console.log("weth_1_value decs: "+weth_1_value.toString())

        var dai_1_value = await instance.assetValue("0x6b175474e89094c44da98b954eedeac495271d0f", new BN('1000000000000000000', 10));
        dai_1_value /= 10**8; // 8 decimals USD feeds

        var dai_22_value = await instance.assetValue("0x6b175474e89094c44da98b954eedeac495271d0f", new BN('22000000000000000000', 10));
        dai_22_value /= 10**8; // 8 decimals USD feeds

        var usdt_1_check_value = Math.round(usdt_1_value);
        var usdt_5_check_value = Math.round(usdt_5_value);
        var dai_1_check_value = Math.round(dai_1_value);
        var dai_22_check_value = Math.round(dai_22_value);

        assert.equal(usdt_1_check_value, 1);
        assert.equal(usdt_5_check_value, 5);
        assert.equal(dai_1_check_value, 1);
        assert.equal(dai_22_check_value, 22);
    });

    it("permissions", async () => {
        var unauthorizedAccount = accounts[1];
        var assets = ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"]
        var feeds = ["0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"]

        var instance = await AssetOracle.deployed();
        await catchRevert(instance.addSupportedAssets(assets, feeds, {from: unauthorizedAccount}));
    });

    it("isSupportedAsset", async () => {
        var supportedAsset = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        var unsupportedAsset = "0xf9FBE825BFB2bF3E387af0Dc18caC8d87F29DEa8";

        var instance = await AssetOracle.deployed();
        var shouldBeSupported = await instance.isSupportedAsset(supportedAsset);
        var shouldntBeSupported = await instance.isSupportedAsset(unsupportedAsset);

        assert.equal(shouldBeSupported, true);
        assert.equal(shouldntBeSupported, false);
    });

    it("AUM", async () => {
        var portofolio1 = {
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": new BN('1000000000000000000', 10), // 1 WETH
            "0x6b175474e89094c44da98b954eedeac495271d0f": new BN('1000000000000000000000', 10), // 1000 DAI
            "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": 100000000, // 1 BTC
            "0xdAC17F958D2ee523a2206206994597C13D831ec7": 5000000000 // 5000 USDT
        }
        var portofolio2 = {
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": new BN('5000000000000000000', 10), // 5 WETH
        }

        var [assets1, amounts1] = getParsedPortofolio(portofolio1);
        var [assets2, amounts2] = getParsedPortofolio(portofolio2);
        
        var instance = await AssetOracle.deployed();

        var wethPrice = await instance.assetValue("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", new BN('1000000000000000000', 10));
        wethPrice /= 10**8;

        var aum1USD = await instance.aum(assets1, amounts1);
        aum1USD /= 10**8;
        console.log("aum1 USD: "+aum1USD.toString())

        var aum1WETH = await instance.aumDepositAsset("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", assets1, amounts1);
        aum1WETH /= 10**18; // WETH decimals
        console.log("aum1 WETH: "+aum1WETH.toString());

        var aum2USD = await instance.aum(assets2, amounts2);
        aum2USD /= 10**8;
        console.log("aum2 USD: "+aum2USD.toString())

        var aum2WETH = await instance.aumDepositAsset("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", assets2, amounts2);
        aum2WETH /= 10**18; // WETH decimals
        console.log("aum2 WETH: "+aum2WETH.toString());

        var priceAUM1FromUSD = parseFloat(aum1USD) / parseFloat(wethPrice);

        assert.equal(priceAUM1FromUSD.toFixed(4), aum1WETH.toFixed(4));
        assert.equal(Math.round(aum2WETH), 5);
    });
});