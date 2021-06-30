const PREFIX = "Returned error: VM Exception while processing transaction: ";
const PREFIX2 = "VM Exception while processing transaction: ";

async function tryCatch(promise, message) {
    try {
        await promise;
        throw null;
    }
    catch (error) {
        assert(error, "Expected an error but did not get one");
        assert(error.message.startsWith(PREFIX + message) || error.message.startsWith(PREFIX2 + message), "Expected an error starting with '" + PREFIX + message + "' but got '" + error.message + "' instead");
    }
};

module.exports = {
    catchDepositLimit      : async function(promise) {await tryCatch(promise, "revert Deposit too");},
    catchArbProtection : async function(promise) {await tryCatch(promise, "revert ARB PROTECTION");},
    catchGenesisProtection : async function(promise) {await tryCatch(promise, "revert Genesis Logic");},
    catchRevert            : async function(promise) {await tryCatch(promise, "revert"              );},
    catchOutOfGas          : async function(promise) {await tryCatch(promise, "out of gas"          );},
    catchInvalidJump       : async function(promise) {await tryCatch(promise, "invalid JUMP"        );},
    catchInvalidOpcode     : async function(promise) {await tryCatch(promise, "invalid opcode"      );},
    catchStackOverflow     : async function(promise) {await tryCatch(promise, "stack overflow"      );},
    catchStackUnderflow    : async function(promise) {await tryCatch(promise, "stack underflow"     );},
    catchStaticStateChange : async function(promise) {await tryCatch(promise, "static state change" );},
};