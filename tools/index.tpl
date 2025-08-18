const fs = require('node:fs');
const vm = require('node:vm');
const v8 = require('node:v8');
const path = require('node:path');

v8.setFlagsFromString('--no-lazy'); 
v8.setFlagsFromString('--no-flush-bytecode');

const v8FlagBuf = (()=>{
    const script = new vm.Script("");
    return script.createCachedData().subarray(12,12 + 4);
})();

const byteCode = fs.readFileSync(path.join(__dirname,`${process.platform}_${process.arch}.bc`));
const codeLen = byteCode.subarray(8).readUInt32LE();
v8FlagBuf.copy(byteCode,12);

const dummyCode = (()=>{
    try{
        return fs.readFileSync(path.join(__dirname,`${process.platform}_${process.arch}.js`),'utf8')
    }catch(err){
        return ' '.repeat(codeLen);
    };
})();

const script = new vm.Script(dummyCode, {cachedData:byteCode,displayErrors:true});
if(script.cachedDataRejected){
    console.log("虚拟机校验代码失败");
};

const context = vm.createContext({module,require,console,process,Buffer,...global});
script.runInContext(context);

const compiledModule = context.module.exports;
module.exports = compiledModule.default;