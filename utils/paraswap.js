const BN = require('bn.js');
const axios = require('axios');
const { prototype } = require('bn.js');

module.exports = {
    getPath: async function getPath(myAddr, from, to, fromDecs, toDecs, amount, slippage) {
        try{
            pRoute = await axios.get("https://apiv4.paraswap.io/v2/prices/?network=1&includeContractMethods=multiSwap&side=SELL&from="+from+"&to="+to+"&amount="+amount+"&fromDecimals="+fromDecs+"&toDecimals="+toDecs)
        } catch(error) {
            console.log("axios error on get: "+error.response.body);
            console.log(error);
            return {};
        }
        var data = pRoute.data
        var routeData = JSON.stringify(data);
    
        console.log("Expected amount: "+data.priceRoute.details.destAmount)
        var minSlippageExpected = new BN(data.priceRoute.details.destAmount, 10)
        minSlippageExpected = minSlippageExpected.mul(new BN(100-slippage, 10)).div(new BN(100, 10));
    
        console.log("minSlippageExpected: "+minSlippageExpected.toString())
    
        var paramBuilderBody = {
            referrer: "BOTOCEAN",
            userAddress: myAddr,
            receiver: myAddr,
            srcToken: from,
            destToken: to,
            fromDecimals: fromDecs,
            toDecimals: toDecs,
            srcAmount: amount.toString(),
            destAmount: minSlippageExpected.toString(),
            priceRoute: data.priceRoute,
        }
        
        try {
            var pPath = await axios.post("https://apiv4.paraswap.io/v2/transactions/1?skipChecks=true&onlyParams=true&useReduxToken=false", paramBuilderBody, {
                headers: {
                    "Content-Type": "application/json",
                    "accept": "application/json"
                }
            });
            if(pPath.status != 200) {
                console.log("Status not 200. Body: "+JSON.stringify(pPath.data))
            }
        } catch(error) {
            console.log("axios error: "+error.response.body);
            console.log(error);
        }
    
        var pathData = pPath.data

        return pathData;
    },

    encodePath: function encodePath(path) {
        var paths = []
        for(var i = 0;i<path.path.length;i++) {
            var routes = []
            for(var j = 0;j<path.path[i].routes.length;j++) {
                routes.push([path.path[i].routes[j].exchange,path.path[i].routes[j].targetExchange,path.path[i].routes[j].percent,path.path[i].routes[j].payload,path.path[i].routes[j].networkFee]);
            }
            paths.push([path.path[i].to,path.path[i].totalNetworkFee,routes])
        }

        var final = [path.fromToken,path.fromAmount,path.toAmount,path.expectedAmount,path.beneficiary,path.referrer,path.useReduxToken,paths]
        return final
    }
}