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

// 查找可用的字节码文件
const findBytecodeFile = (dir) => {
    const files = fs.readdirSync(dir);
    // 优先查找当前平台架构的文件
    const preferredFile = `${process.platform}_${process.arch}.bc`;
    if (files.includes(preferredFile)) {
        return preferredFile;
    }
    // 如果没找到，查找同平台的其他架构文件
    const platformFiles = files.filter(file => file.startsWith(`${process.platform}_`) && file.endsWith('.bc'));
    if (platformFiles.length > 0) {
        return platformFiles[0];
    }
    // 如果还没找到，返回第一个.bc文件
    const bcFiles = files.filter(file => file.endsWith('.bc'));
    if (bcFiles.length > 0) {
        return bcFiles[0];
    }
    throw new Error('No bytecode file found');
};

const bytecodeFileName = findBytecodeFile(__dirname);
const byteCode = fs.readFileSync(path.join(__dirname, bytecodeFileName));
const codeLen = byteCode.subarray(8).readUInt32LE();
v8FlagBuf.copy(byteCode,12);

const dummyCode = (()=>{
    try{
        const jsFileName = bytecodeFileName.replace('.bc', '.js');
        return fs.readFileSync(path.join(__dirname, jsFileName),'utf8')
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