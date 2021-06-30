var AssetOracle = artifacts.require("AssetOracle");
var FundDeployer = artifacts.require("FundDeployer");
var FundLogic = artifacts.require("FundLogic");
var WETH = artifacts.require("WETH9");
var ERC20 = artifacts.require("ERC20");
var IERC20 = artifacts.require("IERC20");
var BuybackVault = artifacts.require("BuybackVault");
var IParaswapAugustus = artifacts.require("IParaswapAugustus");
const BN = require('bn.js');
var CrazyArb = artifacts.require("CrazyArb");

var catchRevert = require('./../utils/revert_exceptions.js').catchRevert;
var catchGenesisProtection = require('./../utils/revert_exceptions.js').catchGenesisProtection;
var catchArbProtection = require('./../utils/revert_exceptions.js').catchArbProtection;
var getParaswapPath = require('./../utils/paraswap').getPath;
var encodeParaswapPath = require('./../utils/paraswap').encodePath;
var catchDepositLimit = require('./../utils/revert_exceptions').catchDepositLimit;

var stablePerformanceFee;
var ethPerformanceFee;

var fundProxyStablecoin;
var fundProxyETH;
var ethPrice;

var stableBeforeSwapUSD;
var stableBeforeSwapDeposit;
var ethBeforeSwapUSD;
var ethBeforeSwapDeposit;

var stableAfterSwapUSD;
var stableAfterSwapDeposit;
var ethAfterSwapUSD;
var ethAfterSwapDeposit;

var user1depositedEth;
var user2depositedEth;
var user1depositedStable;
var user2depositedStable;

function getFeesFromEvent(tx) {
    var bbFee = 0;
    var mFee = 0;

    var logs = tx.receipt.logs;
    for(var i = 0; i < logs.length; i ++) {
        if(logs[i].event == "FeeMinted") {
            // bbFee += parseInt(/^[0-9a-fA-F]+$/.test(logs[i].args.sharesBuybackMinted) ? "0x"+logs[i].args.sharesBuybackMinted : logs[i].args.sharesBuybackMinted)
            // mFee += parseInt(/^[0-9a-fA-F]+$/.test(logs[i].args.sharesManagerMinted) ? "0x"+logs[i].args.sharesManagerMinted : logs[i].args.sharesManagerMinted)
            bbFee += parseInt(logs[i].args.sharesBuybackMinted);
            mFee += parseInt(logs[i].args.sharesManagerMinted)
            console.log("Found bbFee. Total: "+bbFee)
            console.log("Found mFee. Total: "+mFee)
        }
    }

    return [bbFee,mFee];
}

contract("FundDeployer", async (accounts) => {
    it("[USER] ERC20 get WETH and USDT", async () => {
        var user = accounts[3];
        var user2 = accounts[4];
        var wethaddr = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        var usdtaddr = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

        var paraswapAugustus = "0x1bD435F3C054b6e901B7b108a0ab7617C808677b";
        var paraswapProxy = "0xb70bc06d2c9bf03b3373799606dc7d39346c06b3";

        var wethContract = await WETH.at(wethaddr);
        
        await wethContract.deposit({from: user, value: new BN('11000000000000000000', 10)}) // Get 10 WETH for 10 ETH
        await wethContract.deposit({from: user2, value: new BN('11000000000000000000', 10)}) // Get 10 WETH for 10 ETH
        var wethBal = await wethContract.balanceOf(user);
        var wethBal2 = await wethContract.balanceOf(user2);

        // TODO: Implement USDT
        var path = await getParaswapPath(user, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xdAC17F958D2ee523a2206206994597C13D831ec7", 18, 6, new BN("1000000000000000000", 10), 3);
        var sellData = {
            fromToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            fromAmount: new BN("1000000000000000000", 10).toString(),
            toAmount: path.data.toAmount,
            expectedAmount: path.data.expectedAmount,
            beneficiary: user,
            referrer: "BOTOCEAN",
            useReduxToken: 0,
            path: path.data.path
        }

        var path2 = await getParaswapPath(user2, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xdAC17F958D2ee523a2206206994597C13D831ec7", 18, 6, new BN("1000000000000000000", 10), 3);
        var sellData2 = {
            fromToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            fromAmount: new BN("1000000000000000000", 10).toString(),
            toAmount: path2.data.toAmount,
            expectedAmount: path2.data.expectedAmount,
            beneficiary: user2,
            referrer: "BOTOCEAN",
            useReduxToken: 0,
            path: path2.data.path
        }

        // var encodedData = encodeParaswapPath(sellData);

        await wethContract.approve(paraswapProxy, 0, {from: user});
        await wethContract.approve(paraswapProxy, new BN("1000000000000000000", 10), {from: user});
        await wethContract.approve(paraswapProxy, 0, {from: user2});
        await wethContract.approve(paraswapProxy, new BN("1000000000000000000", 10), {from: user2});

        var USDT = await ERC20.at(usdtaddr);
        var usdtBefore = await USDT.balanceOf(user);
        var usdtBefore2 = await USDT.balanceOf(user2);
        var augustus = await IParaswapAugustus.at(paraswapAugustus);

        await augustus.multiSwap(sellData, {from: user});
        await augustus.multiSwap(sellData2, {from: user2});

        var usdtAfter = await USDT.balanceOf(user);
        var usdtAfter2 = await USDT.balanceOf(user2);

        assert.equal(wethBal >= 10000000000000000000, true);
        assert.equal(wethBal2 >= 10000000000000000000, true);
        assert.equal(usdtAfter > usdtBefore, true);
        assert.equal(usdtAfter2 > usdtBefore2, true);
    });

    it("[FUND] permissions", async () => {
        var unauthorizedAccount = accounts[5];
        var authorizedAccount = accounts[0];
        var mockAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

        var instance = await FundDeployer.deployed();

        // Authorized
        await instance.changeOwner(authorizedAccount, {from: authorizedAccount});

        // Unauthorized
        await catchRevert(instance.changeOwner(mockAddress, {from: unauthorizedAccount}));
        await catchRevert(instance.changeOracle(mockAddress, {from: unauthorizedAccount}));
        await catchRevert(instance.changeLogic(mockAddress, {from: unauthorizedAccount}));
        await catchRevert(instance.changeBuybackFee(1, {from: unauthorizedAccount}));
        await catchRevert(instance.upgradeParaswap(mockAddress, mockAddress, {from: unauthorizedAccount}));
    });

    it("[FUND DEPLOYER] deploy funds", async () => {
        
        var manager = accounts[2];
        var depositAssetSTABLECOIN = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT
        var depositAssetETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH

        var instance = await FundDeployer.deployed();
        var llogic = await instance.getFundLogic();
        var ooracle = await instance.getOracle();

        stablePerformanceFee = 0.2;
        ethPerformanceFee = 0.2;

        fundProxyETH = await instance.deployFund(
            "ETH Coin Fund",
            "The Cool Man",
            depositAssetETH,
            ethPerformanceFee * 10000,
            0,
            0,
            {from: manager, gas: 6500000}
        );

        fundProxyStablecoin = await instance.deployFund(
            "Stable Coin Fund",
            "The Cool Man",
            depositAssetSTABLECOIN,
            stablePerformanceFee * 10000,
            0,
            0,
            {from: manager, gas: 6500000}
        );

        fundProxyStablecoin = fundProxyStablecoin["receipt"]["logs"][0]["args"]["fund"];
        fundProxyETH = fundProxyETH["receipt"]["logs"][0]["args"]["fund"];

        console.log("FundProxy stablecoin at: "+fundProxyStablecoin);
        console.log("FundProxy ETH at: "+fundProxyETH);

        var bbvault = await BuybackVault.deployed();
        var t1 = await bbvault.getIsDeployedFund(fundProxyStablecoin);
        var t2 = await bbvault.getIsDeployedFund(fundProxyETH);

        assert.equal(t1, true);
        assert.equal(t2, true);
    });

    it("[FUND] Genesis Logic Protection", async () => {
        var instance = await FundLogic.deployed();
        var mockAddress = "0x0000000000000000000000000000000000000000";

        await catchGenesisProtection(instance.init(
            mockAddress,
            mockAddress,
            mockAddress,
            "",
            "",
            mockAddress,
            100000,
            mockAddress,
            mockAddress,
            mockAddress,
            0,
            0
        ));
    });

    it("[FUND] Get constants", async () => {
        var depositAssetETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
        var depositAssetSTABLE = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        var buybackVaultAddress = await BuybackVault.deployed();
        buybackVaultAddress = buybackVaultAddress.address;

        var instance = await FundLogic.at(fundProxyETH);
        var stable = await FundLogic.at(fundProxyStablecoin);
        var deployer = await FundDeployer.deployed();

        isSupported = await stable.getIsActiveAsset(depositAssetSTABLE);
        assert.equal(isSupported, true, "USDT not supported");

        var manager = await instance.getManager();
        var fundName = await instance.getName();
        var version = await instance.getVersion();

        var totalValueUSD = await instance.totalValueUSD();
        var totalValueDepositAsset = await instance.totalValueDepositAsset();
        var totalSupply = await instance.totalSupply();

        var depositAsset = await instance.depositAsset();
        var depositAssetDecimals = await instance.depositAssetDecimals();

        var usdt_totalValueUSD = await stable.totalValueUSD();
        var usdt_totalValueDepositAsset = await stable.totalValueDepositAsset();
        var usdt_totalSupply = await stable.totalSupply();

        var usdt_depositAsset = await stable.depositAsset();
        var usdt_depositAssetDecimals = await stable.depositAssetDecimals();

        var bbaddr = await deployer.getBuybackVault();

        assert.equal(manager, accounts[2]);
        assert.equal(fundName, "ETH Coin Fund");
        assert.equal(version, "v1.0");
        assert.equal(totalValueUSD.toString(), '0');
        assert.equal(totalValueDepositAsset.toString(), '0');
        assert.equal(totalSupply.toString(), '0');
        assert.equal(depositAsset, depositAssetETH);
        assert.equal(depositAssetDecimals.toString(), '18');
        assert.equal(usdt_totalValueUSD.toString(), '0');
        assert.equal(usdt_totalValueDepositAsset.toString(), '0');
        assert.equal(usdt_totalSupply.toString(), '0');
        assert.equal(usdt_depositAsset, depositAssetSTABLE);
        assert.equal(usdt_depositAssetDecimals.toString(), '6');
        assert.equal(bbaddr, buybackVaultAddress);
    });

    it("[FUND] Manager add and remove assets", async () => {
        var manager = accounts[2];

        var aS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"; // WBTC
        var assetEth = "0x6b175474e89094c44da98b954eedeac495271d0f"; // DAI

        var stableFund = await FundLogic.at(fundProxyStablecoin);
        var ethFund = await FundLogic.at(fundProxyETH);

        await stableFund.addActiveAsset(aS, {from: manager});
        await ethFund.addActiveAsset(assetEth, {from: manager});

        // Check if assets were added

        var wasAddedStable = await stableFund.getIsActiveAsset(aS);
        var wasAddedEth = await ethFund.getIsActiveAsset(assetEth);

        // Remove

        await stableFund.removeActiveAsset(aS, {from: manager});
        await ethFund.removeActiveAsset(assetEth, {from: manager});

        // Check if assets were removed

        var wasRemovedStable = await stableFund.getIsActiveAsset(aS);
        var wasRemovedEth = await ethFund.getIsActiveAsset(assetEth);

        assert.equal(wasAddedStable, true);
        assert.equal(wasAddedEth, true);
        assert.equal(wasRemovedStable, false);
        assert.equal(wasRemovedEth, false);
    });

    it("[FUND] Get Fund Logic", async() => {
        var logic = await FundLogic.deployed();
        logic = logic.address;

        var instance = await FundLogic.at(fundProxyStablecoin)
        var gottenLogic = await instance.getFundLogic();

        instance = await FundLogic.at(fundProxyETH)
        gottenLogic2 = await instance.getFundLogic()

        assert.equal(logic, gottenLogic);
        assert.equal(logic, gottenLogic2);
    });

    it("[FUND] Min Deposit", async() => {
        var wethaddr = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        var wethContract = await WETH.at(wethaddr);
        var user = accounts[3];
        var manager = accounts[2];
        var ethfund = await FundLogic.at(fundProxyETH);

        await ethfund.changeMinDeposit(2, {from: manager});

        await wethContract.approve(fundProxyETH, new BN('0', 10), {from: user});
        await wethContract.approve(fundProxyETH, new BN('1', 10), {from: user});
        await catchDepositLimit(ethfund.deposit(1, {from: user}));

        await ethfund.changeMinDeposit(0, {from: manager});
    });

    it("[FUND] Max Deposit", async() => {
        var wethaddr = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        var wethContract = await WETH.at(wethaddr);
        var user = accounts[3];
        var manager = accounts[2];
        var ethfund = await FundLogic.at(fundProxyETH);

        await ethfund.changeMaxDeposit(2, {from: manager});

        await wethContract.approve(fundProxyETH, new BN('0', 10), {from: user});
        await wethContract.approve(fundProxyETH, new BN('5', 10), {from: user});
        await catchDepositLimit(ethfund.deposit(5, {from: user}));

        await ethfund.changeMaxDeposit(0, {from: manager});
    });

    it("[FUND] Deposit and share emission (multiple accounts)", async () => {
        var wethaddr = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        var usdtaddr = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        var wethContract = await WETH.at(wethaddr);
        var usdtContract = await ERC20.at(usdtaddr);
        var user = accounts[3];
        var user2 = accounts[4];
        var ethfund = await FundLogic.at(fundProxyETH);
        var usdtfund = await FundLogic.at(fundProxyStablecoin);
        var totalSupplyBefore = await ethfund.totalSupply();
        var usdt_totalSupplyBefore = await usdtfund.totalSupply();
        var mySharesBefore1 = await ethfund.balanceOf(user);
        var usdt_mySharesBefore1 = await usdtfund.balanceOf(user);
        var mySharesBefore2 = await ethfund.balanceOf(user2);
        var usdt_mySharesBefore2 = await usdtfund.balanceOf(user2);

        var oracle = await AssetOracle.deployed();
        var weth_1_value = await oracle.assetValue("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", new BN('1000000000000000000', 10));
        weth_1_value /= 10**8; // 8 decimals USD feeds
        ethPrice = weth_1_value;

        // Deposit 1 WETH from user 1
        await wethContract.approve(fundProxyETH, new BN('0', 10), {from: user});
        await wethContract.approve(fundProxyETH, new BN('1000000000000000000', 10), {from: user});
        await ethfund.deposit(new BN('1000000000000000000', 10), {from: user});
        var mySharesAfter1 = await ethfund.balanceOf(user);
        var totalSupplyAfter1 = await ethfund.totalSupply();

        // Deposit 10 USDT from user 1
        await usdtContract.approve(fundProxyStablecoin, '0', {from: user});
        await usdtContract.approve(fundProxyStablecoin, '10000000', {from: user});
        await usdtfund.deposit('10000000', {from: user});
        var usdt_mySharesAfter1 = await usdtfund.balanceOf(user);
        var usdt_totalSupplyAfter1 = await usdtfund.totalSupply();

        // Deposit 5 WETH from user 2
        await wethContract.approve(fundProxyETH, new BN('0', 10), {from: user2});
        await wethContract.approve(fundProxyETH, new BN('5000000000000000000', 10), {from: user2});
        await ethfund.deposit(new BN('5000000000000000000', 10), {from: user2});
        var mySharesAfter2 = await ethfund.balanceOf(user2);
        var totalSupplyAfter2 = await ethfund.totalSupply();

        // Deposit 500 USDT from user 2
        await usdtContract.approve(fundProxyStablecoin, '0', {from: user2});
        await usdtContract.approve(fundProxyStablecoin, '500000000', {from: user2});
        await usdtfund.deposit('500000000', {from: user2});
        var usdt_mySharesAfter2 = await usdtfund.balanceOf(user2);
        var usdt_totalSupplyAfter2 = await usdtfund.totalSupply();

        user1depositedStable = 10;
        user2depositedStable = 500;
        user1depositedEth = 1 * ethPrice;
        user2depositedEth = 5 * ethPrice;

        // Asserts
        assert.equal(totalSupplyBefore, 0);
        assert.equal(mySharesBefore1, 0);
        assert.equal(mySharesBefore2, 0);
        assert.equal(mySharesAfter1.toString(), '1000000000000000000');
        assert.equal(totalSupplyAfter1.toString(), '1000000000000000000');
        assert.equal(mySharesAfter2.toString(), '5000000000000000000');
        assert.equal(totalSupplyAfter2.toString(), '6000000000000000000');

        assert.equal(usdt_totalSupplyBefore, 0);
        assert.equal(usdt_mySharesBefore1, 0);
        assert.equal(usdt_mySharesBefore2, 0);
        assert.equal(usdt_mySharesAfter1.toString(), '10000000000000000000');
        assert.equal(usdt_totalSupplyAfter1.toString(), '10000000000000000000');
        assert.equal(usdt_mySharesAfter2.toString(), '500000000000000000000');
        assert.equal(usdt_totalSupplyAfter2.toString(), '510000000000000000000');
    });

    it("[FUND] Total Values USD after deposit", async () => {

        var ethfund = await FundLogic.at(fundProxyETH);
        var usdtfund = await FundLogic.at(fundProxyStablecoin);

        var totalValueUSD = await ethfund.totalValueUSD();
        totalValueUSD /= 10**8;
        ethBeforeSwapUSD = totalValueUSD;
        var totalValueDepositAsset = await ethfund.totalValueDepositAsset();
        totalValueDepositAsset /= 10**18;
        ethBeforeSwapDeposit = totalValueDepositAsset;

        var virtualUSD = totalValueDepositAsset * ethPrice;
        var virtualETH = totalValueUSD / ethPrice;

        var usdt_totalValueUSD = await usdtfund.totalValueUSD();
        usdt_totalValueUSD /= 10**8;
        stableBeforeSwapUSD = usdt_totalValueUSD;
        var usdt_totalValueDepositAsset = await usdtfund.totalValueDepositAsset();
        usdt_totalValueDepositAsset /= 10**6;
        stableBeforeSwapDeposit = usdt_totalValueDepositAsset;

        assert.equal(totalValueDepositAsset.toString(), '6');
        assert.equal(Math.round(totalValueUSD), Math.round(virtualUSD));
        assert.equal(Math.round(virtualETH), totalValueDepositAsset);
        assert.equal(Math.round(usdt_totalValueUSD), 510);
        assert.equal(Math.round(usdt_totalValueUSD), 510);
    });

    it("[FUND] Manager swap STABLE", async() => {
        var to = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
        var toDecimals = 8;
        var from = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        var fromDecimals = 6;
        var amount = 200000000; // 200 USDT
        var manager = accounts[2];
        var usdtfund = await FundLogic.at(fundProxyStablecoin);

        var usdt = await IERC20.at(from);
        var wbtc = await ERC20.at(to);

        var usdtBefore = await usdt.balanceOf(fundProxyStablecoin);
        var wbtcBefore = await wbtc.balanceOf(fundProxyStablecoin);

        var path = await getParaswapPath(fundProxyStablecoin, from, to, fromDecimals, toDecimals, amount, 15);
        await usdtfund.addActiveAsset(to, {from: manager});
        await usdtfund.swap(
            from,
            to,
            amount,
            path.data.toAmount,
            path.data.expectedAmount,
            path.data.path,
            {from: manager}
        );

        var usdtAfter = await usdt.balanceOf(fundProxyStablecoin);
        var wbtcAfter = await wbtc.balanceOf(fundProxyStablecoin);

        assert.equal(usdtAfter < usdtBefore, true);
        assert.equal(wbtcAfter > wbtcBefore, true);

    });

    it("[FUND] Manager swap ETH", async() => {
        var to = "0x6b175474e89094c44da98b954eedeac495271d0f";
        var toDecimals = 18;
        var from = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        var fromDecimals = 18;
        var amount = new BN('1000000000000000000', 10); // 1 WETH
        var manager = accounts[2];
        var ethfund = await FundLogic.at(fundProxyETH);

        var eth = await ERC20.at(from);
        var dai = await ERC20.at(to);

        var ethBefore = await eth.balanceOf(fundProxyETH);
        var daiBefore = await dai.balanceOf(fundProxyETH);

        var path = await getParaswapPath(fundProxyETH, from, to, fromDecimals, toDecimals, amount, 15);
        await ethfund.addActiveAsset(to, {from: manager});
        await ethfund.swap(
            from,
            to,
            amount,
            path.data.toAmount,
            path.data.expectedAmount,
            path.data.path,
            {from: manager}
        );

        var ethAfter = await eth.balanceOf(fundProxyETH);
        var daiAfter = await dai.balanceOf(fundProxyETH);

        assert.equal(ethAfter < ethBefore, true);
        assert.equal(daiAfter > daiBefore, true);

    });

    it("[FUND] Total Values USD after swap", async () => {
        var ethfund = await FundLogic.at(fundProxyETH);
        var usdtfund = await FundLogic.at(fundProxyStablecoin);

        var totalValueUSD = await ethfund.totalValueUSD();
        totalValueUSD /= 10**8;
        ethAfterSwapUSD = totalValueUSD;
        var totalValueDepositAsset = await ethfund.totalValueDepositAsset();
        totalValueDepositAsset /= 10**18;
        ethAfterSwapDeposit = totalValueDepositAsset;

        var usdt_totalValueUSD = await usdtfund.totalValueUSD();
        usdt_totalValueUSD /= 10**8;
        stableAfterSwapUSD = usdt_totalValueUSD;
        var usdt_totalValueDepositAsset = await usdtfund.totalValueDepositAsset();
        usdt_totalValueDepositAsset /= 10**6;
        stableAfterSwapDeposit = usdt_totalValueDepositAsset;

        console.log("SWAP VALUE TESTS [BEFORE|AFTER]");
        console.log("-------------------------------");
        console.log("STABLE USD: ["+stableBeforeSwapUSD+"|"+stableAfterSwapUSD+"]");
        console.log("STABLE DEPOSIT: ["+stableBeforeSwapDeposit+"|"+stableAfterSwapDeposit+"]");
        console.log("ETH USD: ["+ethBeforeSwapUSD+"|"+ethAfterSwapUSD+"]");
        console.log("ETH DEPOSIT: ["+ethBeforeSwapDeposit+"|"+ethAfterSwapDeposit+"]");
        console.log("-------------------------------\n");

        assert.equal(
            stableBeforeSwapUSD - 0.05*stableBeforeSwapUSD < stableAfterSwapUSD && 
            stableBeforeSwapUSD + 0.05*stableBeforeSwapUSD > stableAfterSwapUSD, true
        );
        assert.equal(
            stableBeforeSwapDeposit - 0.05*stableBeforeSwapDeposit < stableAfterSwapDeposit && 
            stableBeforeSwapDeposit + 0.05*stableBeforeSwapDeposit > stableAfterSwapDeposit, true
        );
        assert.equal(
            ethBeforeSwapUSD - 0.05*ethBeforeSwapUSD < ethAfterSwapUSD && 
            ethBeforeSwapUSD + 0.05*ethBeforeSwapUSD > ethAfterSwapUSD, true
        );
        assert.equal(
            ethBeforeSwapDeposit - 0.05*ethBeforeSwapDeposit < ethAfterSwapDeposit && 
            ethBeforeSwapDeposit + 0.05*ethBeforeSwapDeposit > ethAfterSwapDeposit, true
        );
    });

    it("[FUND] Withdraw and share burn (multiple accounts) ETH", async () => {
        var wethaddr = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        var wethContract = await WETH.at(wethaddr);
        var daiContract = await ERC20.at("0x6b175474e89094c44da98b954eedeac495271d0f");
        var user = accounts[3];
        var user2 = accounts[4];
        var manager = accounts[2];
        await wethContract.transfer(fundProxyETH, new BN('10000000000000000', 10), {from: user})
        var ethfund = await FundLogic.at(fundProxyETH);
        ethAfterSwapUSD = await ethfund.totalValueUSD();
        ethAfterSwapUSD /= 10**8;
        var totalSupplyBefore = await ethfund.totalSupply();
        var mySharesBefore1 = await ethfund.balanceOf(user);
        var mySharesBefore2 = await ethfund.balanceOf(user2);
        var oracle = await AssetOracle.deployed();

        var buybackVault = await BuybackVault.deployed();
        var buybackSharesBefore = await ethfund.balanceOf(buybackVault.address);
        var managerSharesBefore = await ethfund.balanceOf(manager);

        var div1 = 2;
        var div2 = 3;

        var assets = [
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            "0x6b175474e89094c44da98b954eedeac495271d0f"
        ]

        var totalValueUSD = await ethfund.totalValueUSD();
        totalValueUSD /= 10**8;

        var user1weth_before = await wethContract.balanceOf(user);
        var user1dai_before = await daiContract.balanceOf(user);
        var user2weth_before = await wethContract.balanceOf(user2);
        var user2dai_before = await daiContract.balanceOf(user2);

        var user1percBefore = mySharesBefore1 / totalSupplyBefore;
        var user2percBefore = mySharesBefore2 / totalSupplyBefore;

        var user1value = ((mySharesBefore1 / totalSupplyBefore) * totalValueUSD) / div1;
        var user2value = ((mySharesBefore2 / totalSupplyBefore) * totalValueUSD) / div2;
        var tx1 = await ethfund.withdraw(new BN(mySharesBefore1, 10).div(new BN(div1.toString(), 10)), {from: user});
        var tx2 = await ethfund.withdraw(new BN(mySharesBefore2, 10).div(new BN(div2.toString(), 10)), {from: user2});
        var buybackSharesAfter = await ethfund.balanceOf(buybackVault.address);
        var managerSharesAfter = await ethfund.balanceOf(manager);
        var managerFee1 = 0;
        var managerFee2 = 0;
        var buybackFee1 = 0;
        var buybackFee2 = 0;

        var fees1 = getFeesFromEvent(tx1);
        var fees2 = getFeesFromEvent(tx2);

        buybackFee1 = fees1[0];
        buybackFee2 = fees2[0];
        managerFee1 = fees1[1];
        managerFee2 = fees2[1];

        console.log("Total buyback fee from event: "+(buybackFee1+buybackFee2).toString());
        console.log("Total manager fee from event: "+(managerFee1+managerFee2).toString());

        var user1weth_after = await wethContract.balanceOf(user);
        var user1dai_after = await daiContract.balanceOf(user);
        var user2weth_after = await wethContract.balanceOf(user2);
        var user2dai_after = await daiContract.balanceOf(user2);

        var balancesUser1 = [
            (new BN(user1weth_after.toString(), 10).sub(new BN(user1weth_before.toString(), 10))),
            (new BN(user1dai_after.toString(), 10).sub(new BN(user1dai_before.toString(), 10)))
        ]
        var balancesUser2 = [
            (new BN(user2weth_after.toString(), 10).sub(new BN(user2weth_before.toString(), 10))),
            (new BN(user2dai_after.toString(), 10).sub(new BN(user2dai_before.toString(), 10)))
        ]

        var user1withdrew = await oracle.aum(assets, balancesUser1);
        user1withdrew /= 10**8;
        var user2withdrew = await oracle.aum(assets, balancesUser2);
        user2withdrew /= 10**8;

        console.log("WITHDRAW VALUE TESTS: [DEPOSITED|EXPECTED VALUE|WITHDREW VALUE]");
        console.log("---------------------------------------------------------------");
        console.log("USER 1 ETH 50%: ["+user1depositedEth/div1+"|"+user1value+"|"+user1withdrew+"]");
        console.log("USER 2 ETH 33%: ["+user2depositedEth/div2+"|"+user2value+"|"+user2withdrew+"]");
        console.log("---------------------------------------------------------------\n");

        assert.equal(Math.round(user1value) - Math.round(user1value)*0.05 < Math.round(user1withdrew) &&
                    Math.round(user1value) + Math.round(user1value)*0.05 > Math.round(user1withdrew), true);
        assert.equal(Math.round(user2value) - Math.round(user2value)*0.05 < Math.round(user2withdrew) &&
                    Math.round(user2value) + Math.round(user2value)*0.05 > Math.round(user1withdrew), true);

        assert.equal(
            user1depositedEth/div1 - 0.05*user1depositedEth/div1 < user1withdrew && 
            user1depositedEth/div1 + 0.05*user1depositedEth/div1 > user1withdrew, true
        );
        assert.equal(
            user2depositedEth/div2 - 0.05*user2depositedEth/div2 < user2withdrew && 
            user2depositedEth/div2 + 0.05*user2depositedEth/div2 > user2withdrew, true
        );

        assert.equal(buybackSharesAfter-buybackSharesBefore, buybackFee1 + buybackFee2);
        assert.equal(managerSharesAfter - managerSharesBefore, managerFee1 + managerFee2);

        // Share nulling
        var mySharesAfter1 = await ethfund.balanceOf(user);
        var mySharesAfter2 = await ethfund.balanceOf(user2);
        var sharesBurned1 = mySharesBefore1-mySharesAfter1;
        var sharesBurned2 = mySharesBefore2-mySharesAfter2;
        var totalSupplyAfter = await ethfund.totalSupply();
        var totalValueUSDAfter = await ethfund.totalValueUSD();

        var user1percAfter = mySharesAfter1 / totalSupplyAfter;
        var user2percAfter = mySharesAfter2 / totalSupplyAfter;

        assert.equal(Math.round(sharesBurned1 / 1000), Math.round(mySharesBefore1 / div1 / 1000));
        assert.equal(Math.round(sharesBurned2 / 1000), Math.round(mySharesBefore2 / div2 / 1000));

        var supplyDelta = totalSupplyBefore-totalSupplyAfter
        var shareDelta = sharesBurned1+sharesBurned2
        // Fees
        var profit = (ethAfterSwapUSD.toFixed(8) - ethBeforeSwapUSD.toFixed(8))
        var sharesFee;
        if(profit <= 0.001){
            shareFee = 0;
            console.log("Profit under 0.001. Not calculating fee: "+profit);
        }else{
            console.log("Profit over $0.0001. Calculating profit fee: "+profit)
            var profitFeeUSD = profit * ethPerformanceFee;
            shareFee = (profitFeeUSD / totalValueUSD) * totalSupplyBefore;
            console.log("Share fee should have been minted with value of shares: "+shareFee);
        }
        ///////
        assert.equal(Math.round((supplyDelta+shareFee) / (10**14)).toString(), Math.round(shareDelta / (10**14)).toString());
        assert.equal(Math.round(totalValueUSDAfter / (10**8)), Math.round(totalValueUSD-(user1withdrew+user2withdrew)));

        assert.equal(user1percBefore.toFixed(2), 0.17);
        assert.equal(user2percBefore.toFixed(2), 0.83);
        assert.equal(user1percAfter.toFixed(2), 0.13);
        assert.equal(user2percAfter.toFixed(2), 0.87);
    });

    it("[FUND] Withdraw and share burn (multiple accounts) STABLE", async () => {
        var usdtContract = await ERC20.at("0xdAC17F958D2ee523a2206206994597C13D831ec7");
        var wbtcContract = await ERC20.at("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599");
        var user = accounts[3];
        var user2 = accounts[4];
        var manager = accounts[2];
        await usdtContract.transfer(fundProxyStablecoin, 10000000, {from: user})
        var usdtfund = await FundLogic.at(fundProxyStablecoin);
        stableAfterSwapUSD = await usdtfund.totalValueUSD();
        stableAfterSwapUSD /= 10**8;
        var totalSupplyBefore = await usdtfund.totalSupply();
        var mySharesBefore1 = await usdtfund.balanceOf(user);
        var mySharesBefore2 = await usdtfund.balanceOf(user2);
        var oracle = await AssetOracle.deployed();

        var buybackVault = await BuybackVault.deployed();
        var buybackSharesBefore = await usdtfund.balanceOf(buybackVault.address);
        var managerSharesBefore = await usdtfund.balanceOf(manager);

        var assets = [
            "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"
        ]

        var div1 = 2;
        var div2 = 3;

        var totalValueUSD = await usdtfund.totalValueUSD();
        totalValueUSD /= 10**8;

        var user1usdt_before = await usdtContract.balanceOf(user);
        var user1wbtc_before = await wbtcContract.balanceOf(user);
        var user2usdt_before = await usdtContract.balanceOf(user2);
        var user2wbtc_before = await wbtcContract.balanceOf(user2);

        var user1percBefore = mySharesBefore1 / totalSupplyBefore;
        var user2percBefore = mySharesBefore2 / totalSupplyBefore;

        var user1value = ((mySharesBefore1 / totalSupplyBefore) * totalValueUSD) / div1;
        var user2value = ((mySharesBefore2 / totalSupplyBefore) * totalValueUSD) / div2;
        var tx1 = await usdtfund.withdraw(new BN(mySharesBefore1, 10).div(new BN(div1.toString(), 10)), {from: user});
        var tx2 = await usdtfund.withdraw(new BN(mySharesBefore2, 10).div(new BN(div2.toString(), 10)), {from: user2});
        var buybackSharesAfter = await usdtfund.balanceOf(buybackVault.address);
        var managerSharesAfter = await usdtfund.balanceOf(manager);
        var managerFee1 = 0;
        var managerFee2 = 0;
        var buybackFee1 = 0;
        var buybackFee2 = 0;

        var fees1 = getFeesFromEvent(tx1);
        var fees2 = getFeesFromEvent(tx2);

        buybackFee1 = fees1[0];
        buybackFee2 = fees2[0];
        managerFee1 = fees1[1];
        managerFee2 = fees2[1];

        console.log("Total buyback fee from event: "+(buybackFee1+buybackFee2).toString());
        console.log("Total manager fee from event: "+(managerFee1+managerFee2).toString());

        var user1usdt_after = await usdtContract.balanceOf(user);
        var user1wbtc_after = await wbtcContract.balanceOf(user);
        var user2usdt_after = await usdtContract.balanceOf(user2);
        var user2wbtc_after = await wbtcContract.balanceOf(user2);

        var balancesUser1 = [
            (new BN(user1usdt_after.toString(), 10).sub(new BN(user1usdt_before.toString(), 10))),
            (new BN(user1wbtc_after.toString(), 10).sub(new BN(user1wbtc_before.toString(), 10)))
        ]
        var balancesUser2 = [
            (new BN(user2usdt_after.toString(), 10).sub(new BN(user2usdt_before.toString(), 10))),
            (new BN(user2wbtc_after.toString(), 10).sub(new BN(user2wbtc_before.toString(), 10)))
        ]

        var user1withdrew = await oracle.aum(assets, balancesUser1);
        user1withdrew /= 10**8;
        var user2withdrew = await oracle.aum(assets, balancesUser2);
        user2withdrew /= 10**8;

        console.log("WITHDRAW VALUE TESTS: [DEPOSITED|EXPECTED VALUE|WITHDREW VALUE]");
        console.log("---------------------------------------------------------------");
        console.log("USER 1 STABLE 50%: ["+user1depositedStable/div1+"|"+user1value+"|"+user1withdrew+"]");
        console.log("USER 2 STABLE 33%: ["+user2depositedStable/div2+"|"+user2value+"|"+user2withdrew+"]");
        console.log("---------------------------------------------------------------\n");

        assert.equal(Math.round(user1value) - Math.round(user1value)*0.05 < Math.round(user1withdrew) &&
                    Math.round(user1value) + Math.round(user1value)*0.05 > Math.round(user1withdrew), true);
        assert.equal(Math.round(user2value) - Math.round(user2value)*0.05 < Math.round(user2withdrew) &&
                    Math.round(user2value) + Math.round(user2value)*0.05 > Math.round(user1withdrew), true);

        assert.equal(
            user1depositedStable/div1 - 0.05*user1depositedStable/div1 < user1withdrew && 
            user1depositedStable/div1 + 0.05*user1depositedStable/div1 > user1withdrew, true
        );
        assert.equal(
            user2depositedStable/div2 - 0.05*user2depositedStable/div2 < user2withdrew && 
            user2depositedStable/div2 + 0.05*user2depositedStable/div2 > user2withdrew, true
        );

        assert.equal(buybackSharesAfter-buybackSharesBefore, buybackFee1 + buybackFee2);
        assert.equal(managerSharesAfter - managerSharesBefore, managerFee1 + managerFee2);

        // Share nulling
        var mySharesAfter1 = await usdtfund.balanceOf(user);
        var mySharesAfter2 = await usdtfund.balanceOf(user2);
        var sharesBurned1 = mySharesBefore1-mySharesAfter1;
        var sharesBurned2 = mySharesBefore2-mySharesAfter2;
        var totalSupplyAfter = await usdtfund.totalSupply();
        var totalValueUSDAfter = await usdtfund.totalValueUSD();

        var user1percAfter = mySharesAfter1 / totalSupplyAfter;
        var user2percAfter = mySharesAfter2 / totalSupplyAfter;

        console.log("We asked to burn: "+Math.round(mySharesBefore1 / div1))
        console.log("We burned: "+sharesBurned1);
        console.log("We asked to burn: "+Math.round(mySharesBefore2 / div2))
        console.log("We burned: "+sharesBurned2)
        assert.equal(Math.round(sharesBurned1 / 1000).toString(), Math.round(mySharesBefore1 / div1 / 1000).toString());
        assert.equal(Math.round(sharesBurned2 / 10000000), Math.round(mySharesBefore2 / div2 / 10000000));

        var supplyDelta = totalSupplyBefore-totalSupplyAfter
        var shareDelta = sharesBurned1+sharesBurned2
        // Fees
        var profit = (stableAfterSwapUSD.toFixed(8) - stableBeforeSwapUSD.toFixed(8))
        var sharesFee;
        if(profit <= 0.001){
            shareFee = 0;
            console.log("Profit under 0.001. Not calculating fee: "+profit);
        }else{
            console.log("Profit over $0.0001. Calculating profit fee: "+profit)
            var profitFeeUSD = profit * stablePerformanceFee;
            shareFee = (profitFeeUSD / totalValueUSD) * totalSupplyBefore;
            console.log("Share fee should have been minted with value of shares: "+shareFee);
        }
        ///////
        assert.equal(Math.round((supplyDelta+shareFee) / (10**14)).toString(), Math.round(shareDelta / (10**14)).toString());
        assert.equal(Math.round(totalValueUSDAfter / (10**8)), Math.round(totalValueUSD-(user1withdrew+user2withdrew)));

        assert.equal(user1percBefore.toFixed(2), 0.02);
        assert.equal(user2percBefore.toFixed(2) == 0.98 || user2percBefore.toFixed(2) == 0.99, true);
        assert.equal(user1percAfter.toFixed(2), 0.01);
        assert.equal(user2percAfter.toFixed(2) == 0.99 || user2percAfter.toFixed(2) == 0.98, true);
    });

    it("[FUND] Arbitrage protection", async () => {
        var arbber = await CrazyArb.new();
        var user = accounts[3];
        var weth = await WETH.at("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")
        await weth.transfer(arbber.address, new BN('10000000000000000', 10), {from: user});
        await catchArbProtection(arbber.arb("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", fundProxyETH));
    });

    it("[FUND + FUND DEPLOYER] Migrations (Oracle Migration)", async () => {
        var manager = accounts[2];
        var fund = await FundLogic.at(fundProxyStablecoin);
        var oldOracle = await fund.oracle();
        var testOracle = "0x0000000000000000000000000000000000000000";
        var deployer = await FundDeployer.deployed();

        await deployer.changeOracle(testOracle);
        var changed = await deployer.getOracle();

        assert.equal(testOracle, changed);

        await fund.upgradeOracle({from: manager});

        changed = await fund.oracle();
        assert.equal(changed, testOracle);

        await deployer.changeOracle(oldOracle);
        changed = await deployer.getOracle();

        assert.equal(oldOracle, changed);

        await fund.upgradeOracle({from: manager});

        changed = await fund.oracle();
        assert.equal(changed, oldOracle);
    });

    it("[FUND + BUYBACK] Donate shares to buyback vault", async () => {
        var user = accounts[3];
        var user2 = accounts[4];

        var ethfund = await FundLogic.at(fundProxyETH);
        var usdtfund = await FundLogic.at(fundProxyStablecoin);

        var buybackVault = await BuybackVault.deployed()
        buybackVault = buybackVault.address;

        var mybal1 = await ethfund.balanceOf(user);
        var mybal2 = await ethfund.balanceOf(user2);
        await ethfund.transfer(buybackVault, mybal1, {from: user});
        await ethfund.transfer(buybackVault, mybal2, {from: user2});

        mybal1 = await usdtfund.balanceOf(user);
        mybal2 = await usdtfund.balanceOf(user2);
        await usdtfund.transfer(buybackVault, mybal1, {from: user});
        await usdtfund.transfer(buybackVault, mybal2, {from: user2});
    });

    // Buyback tests
    it("[BUYBACK] permissions", async () => {
        var owner = accounts[0];
        var unauthorized = accounts[1];

        var instance = await BuybackVault.deployed();

        var mockAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        var BOTS = "0xf9fbe825bfb2bf3e387af0dc18cac8d87f29dea8";

        // Unauthorized
        await catchRevert(instance.changeBots(mockAddress, {from: unauthorized}));

        // Auhtorized
        await instance.changeBots(BOTS);

    });

    it("[BUYBACK] Vault balances (after donation)", async () => {
        var instance = await BuybackVault.deployed();

        deployedFundsLength = await instance.getRegisteredFundsLength();

        console.log("Deployed funds length: "+deployedFundsLength.toString())

        // Check balances
        for(var i = 0; i < deployedFundsLength; i++) {
            var fundAddr = await instance.deployedFunds(i);
            console.log("Fund address: "+fundAddr);
            var fund = await ERC20.at(fundAddr);
            var bal = await fund.balanceOf(instance.address);
            assert.equal(bal > 0, true);
        }
    });

    it("[BUYBACK] Withdraw 1", async () => {
        var bbvault = await BuybackVault.deployed();

        var fundAddr = await bbvault.deployedFunds(0);
        var fund = await ERC20.at(fundAddr);
        var sharesBefore = await fund.balanceOf(bbvault.address);

        await bbvault.withdrawFromFunds([fundAddr]);

        var sharesAfter = await fund.balanceOf(bbvault.address);

        assert.equal(sharesBefore > sharesAfter, true);
        assert.equal(sharesAfter, 0);
    });

    it("[BUYBACK] Withdraw all", async () => {
        var bbvault = await BuybackVault.deployed();

        await bbvault.withdrawAllFunds();
    });

    it("[BUYBACK] Paraswap swap (to BOTS)", async () => {
        var from;
        var fromDecimals;
        var fromContract;
        var to = "0xf9fbe825bfb2bf3e387af0dc18cac8d87f29dea8";
        var toDecimals = 18;
        var bbbal;

        var buyback = await BuybackVault.deployed();
        var oracle = await AssetOracle.deployed();
        var supportedAssetsLength = await oracle.getSupportedAssetsLength();

        console.log("Supported asets length: "+supportedAssetsLength)

        var found = false;

        for(var i = 0; i < supportedAssetsLength; i++) {
            from = await oracle.supportedAssets(i);
            fromContract = await ERC20.at(from);
            fromDecimals = await fromContract.decimals();

            bbbal = await fromContract.balanceOf(buyback.address);
            console.log("Buyback bal of "+from+": "+bbbal)
            if(bbbal > 0){
                found = true;
                break;
            }
        }

        assert.equal(found, true);

        var fromName = await fromContract.name();

        console.log("Swapping from "+fromName+" to BOTS through Paraswap");

        var toContract = await ERC20.at(to); // BOTS

        var fromBefore = await fromContract.balanceOf(buyback.address);
        var BOTSBefore = await toContract.balanceOf(buyback.address);

        var path = await getParaswapPath(buyback.address, from, to, fromDecimals, toDecimals, new BN(bbbal.toString(), 10), 15);
        await buyback.paraswapSwap(
            from,
            bbbal,
            path.data.toAmount,
            path.data.expectedAmount,
            path.data.path,
        );

        var fromAfter = await fromContract.balanceOf(buyback.address);
        var BOTSAfter = await toContract.balanceOf(buyback.address);

        assert.equal(fromAfter < fromBefore, true);
        assert.equal(BOTSAfter > BOTSBefore, true);

    });

    it("[BUYBACK] Burn BOTS", async () => {
        var BOTS = await ERC20.at("0xf9fbe825bfb2bf3e387af0dc18cac8d87f29dea8");
        var bbvault = await BuybackVault.deployed();

        var botsBalBefore = await BOTS.balanceOf(bbvault.address);
        var totalSupplyBefore = await BOTS.totalSupply();
        assert.equal(botsBalBefore > 0, true);

        await bbvault.burnBOTS();

        var botsBalAfter = await BOTS.balanceOf(bbvault.address);
        var totalSupplyAfter = await BOTS.totalSupply();

        assert.equal(botsBalBefore > botsBalAfter, true);
        assert.equal(botsBalAfter, 0);

        assert.equal(totalSupplyBefore > totalSupplyAfter, true);
        assert.equal(Math.round(totalSupplyAfter / 10**18).toString(), Math.round((totalSupplyBefore-botsBalBefore) / 10**18).toString());
    });

    it("[BUYBACK] Uniswap swap (to BOTS)", async () => {
        var from;
        var fromContract;
        var to = "0xf9fbe825bfb2bf3e387af0dc18cac8d87f29dea8";
        var bbbal;

        var buyback = await BuybackVault.deployed();
        var oracle = await AssetOracle.deployed();
        var supportedAssetsLength = await oracle.getSupportedAssetsLength();

        console.log("Supported asets length: "+supportedAssetsLength)

        var found = false;

        for(var i = 0; i < supportedAssetsLength; i++) {
            from = await oracle.supportedAssets(i);
            fromContract = await ERC20.at(from);

            bbbal = await fromContract.balanceOf(buyback.address);
            console.log("Buyback bal of "+from+": "+bbbal)
            if(bbbal > 0){
                found = true;
                break;
            }
        }

        assert.equal(found, true);

        var fromName = await fromContract.name();

        console.log("Swapping from "+fromName+" to BOTS through Uniswap");

        var toContract = await ERC20.at(to); // BOTS

        var fromBefore = await fromContract.balanceOf(buyback.address);
        var BOTSBefore = await toContract.balanceOf(buyback.address);

        var path;
        if (from == "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")
            path = [from, to];
        else
            path = [from, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", to];
        
        console.log("PATH: "+path.toString());
        await buyback.uniswapSwap(
            bbbal,
            0,
            path
        );

        var fromAfter = await fromContract.balanceOf(buyback.address);
        var BOTSAfter = await toContract.balanceOf(buyback.address);

        assert.equal(fromAfter < fromBefore, true);
        assert.equal(BOTSAfter > BOTSBefore, true);
    });

    it("[BUYBACK] Burn BOTS (manual)", async () => {
        var BOTS = await ERC20.at("0xf9fbe825bfb2bf3e387af0dc18cac8d87f29dea8");
        var bbvault = await BuybackVault.deployed();

        var botsBalBefore = await BOTS.balanceOf(bbvault.address);
        var burnAddrBefore = await BOTS.balanceOf("0x0000000000000000000000000000000000000001");
        assert.equal(botsBalBefore > 0, true);

        await bbvault.manualBurnBOTS();

        var botsBalAfter = await BOTS.balanceOf(bbvault.address);
        var burnAddrAfter = await BOTS.balanceOf("0x0000000000000000000000000000000000000001");

        assert.equal(botsBalBefore > botsBalAfter, true);
        assert.equal(botsBalAfter, 0);

        assert.equal(burnAddrAfter > burnAddrBefore, true);
    });
});