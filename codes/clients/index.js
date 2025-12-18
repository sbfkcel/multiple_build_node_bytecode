import path,{dirname} from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
// import { parseDeviceAddress } from "../../../lib/device/deviceAddressUtil.js";
// import { osDefine } from "../../../lib/device/deviceDefine.js";
// import AndroidClient from "./AndroidClient/index.js";
// import IOSClient from "./IOSClient/index.js";
// import { getDirFuns } from "../../../lib/dynamicFuns.js";

const getModules = (loadFun,dir,relativePath)=>{
    const modulePath = path.join(dir,relativePath);
    const fileAgree = process.platform === 'win32' ? 'file:\/\/' : '';
    return loadFun(fileAgree + modulePath);
};

/**
 * 获取本机Mac地址
 */
const localMacs = (()=>{
    const result = [];
    const obj = os.networkInterfaces();
    const ignore = new Array(6).fill('00').join(':');
    for(const key in obj){
        const list = obj[key];
        list.forEach(item => {
            if(item.mac && item.mac !== ignore){
                result.push(item.mac);
            };
        });
    };
    return Array.from(new Set(result));
})();

/**
 * 实现OpenSSL的EVP_BytesToKey函数
 * @param {*} password 
 * @param {*} salt 
 * @param {*} keyLen 
 * @param {*} ivLen 
 * @returns 
 */
const evpBytesToKey = (password, salt, keyLen, ivLen)=>{
    const keyAndIV = Buffer.alloc(keyLen + ivLen);
    let keyAndIVPos = 0;
    let prev = Buffer.alloc(0);
    while (keyAndIVPos < keyLen + ivLen) {
        const hash = crypto.createHash('md5');
        hash.update(prev);
        hash.update(Buffer.from(password, 'utf8'));
        hash.update(salt);
        prev = hash.digest();
        
        const copyLen = Math.min(prev.length, keyLen + ivLen - keyAndIVPos);
        prev.copy(keyAndIV, keyAndIVPos, 0, copyLen);
        keyAndIVPos += copyLen;
    };
    return {
        key: keyAndIV.slice(0, keyLen),
        iv: keyAndIV.slice(keyLen, keyLen + ivLen)
    };
};

const getMacList = (dir)=>{
    const result = [];
    let encryptedData;
    let lastDir = dir;
    while (true) {
        try {
            encryptedData = fs.readFileSync(path.join(lastDir,'reg.key'));
            break;
        } catch (error) {
            const nextDir = path.join(lastDir,'..');
            if(nextDir === lastDir){
                break;
            }else{
                lastDir = nextDir;
            };
        }
    };
    const password = 'love4399';
    if (encryptedData.length < 16 || encryptedData.slice(0, 8).toString() !== 'Salted__') {         // 检查OpenSSL格式
        throw new Error('不是有效的OpenSSL加密文件格式');
    };
    const salt = encryptedData.slice(8, 16);                                                        // 提取salt和加密数据
    const dataToDecrypt = encryptedData.slice(16);
    const { key, iv } = evpBytesToKey(password, salt, 32, 16);                                      // 生成密钥和IV
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);                               // 创建解密器
    decipher.setAutoPadding(true);

    let decrypted = decipher.update(dataToDecrypt, null, 'utf8');                                   // 解密数据
    decrypted += decipher.final('utf8');

    if(decrypted){
        const lines = decrypted.split(/\r|\n/).filter(item => item !== '');
        for(let i=0,len=lines.length; i<len; i++){
            const line = lines[i];
            if(/^((\w{2}\:){5}\w{2})/.test(line)){
                result.push(line.slice(0,17));
            };
        };
    };
    return result;
};

/**
 * 设备校验方法
 * @param {string} dir 当前目录
 * @param {boolean} isThrow 是否抛出错误
 */
const deviceVerify = (dir,isThrow = true)=>{
    const macList = getMacList(dir);
    const isPass = (()=>{
        for(let i=0,len=localMacs.length; i<len; i++){
            const localMac = localMacs[i];
            if(macList.indexOf(localMac) > -1){
                return true;
            };
        };
        return false;
    })();
    if(!isPass && isThrow){
        console.log('localMacs:',localMacs);
        console.log('白名单:',macList);
        throw new Error(`Device not allowed`);
    };
};

const createDeviceClient = async (arg,dir,loadFun)=>{
    const {deviceInfo} = arg;
    deviceVerify(dir,true);
    const {getDirFuns} = (await getModules(loadFun,dir,'../../../lib/dynamicFuns.js'));
    const {parseDeviceAddress} = (await getModules(loadFun,dir,'../../../lib/device/deviceAddressUtil.js'));
    const {osDefine} = (await getModules(loadFun,dir,'../../../lib/device/deviceDefine.js'));
    const addressObj = parseDeviceAddress(deviceInfo.address);
    const commonPath = path.join(dir,'common');
    const commonFunsObj = await getDirFuns(commonPath);
    let DeviceClient;
    if(addressObj.os === osDefine.android){
        DeviceClient = (await getModules(loadFun,dir,'./AndroidClient/index.js')).default;
        const dirPath = path.join(dir,'AndroidClient','funcs');
        const funsObj = Object.assign({},await getDirFuns(dirPath),commonFunsObj);
        for(const key in funsObj){
            deviceVerify(dir,true);
            DeviceClient['prototype'][key] = funsObj[key];
        };
        return new DeviceClient(arg);
    }else if(addressObj.os === osDefine.iOS){
        DeviceClient = (await getModules(loadFun,dir,'./IOSClient/index.js')).default;
        const dirPath = path.join(dir,'IOSClient','funcs');
        const funsObj = Object.assign({},await getDirFuns(dirPath),commonFunsObj);
        for(const key in funsObj){
            deviceVerify(dir,true);
            DeviceClient['prototype'][key] = funsObj[key];
        };
        return new DeviceClient(arg);
    }else if(addressObj.os === osDefine.harmonyos){
        DeviceClient = (await getModules(loadFun,dir,'./OpenHarmonyClient/index.js')).default;
        const dirPath = path.join(dir,'OpenHarmonyClient','funcs');
        const funsObj = Object.assign({},await getDirFuns(dirPath),commonFunsObj);
        for(const key in funsObj){
            deviceVerify(dir,true);
            DeviceClient['prototype'][key] = funsObj[key];
        };
        return new DeviceClient(arg);
    }else{
        throw new Error(`不支持的设备系统${addressObj.os}`);
    };
};

// const __dirname = dirname(fileURLToPath(import.meta.url));
// const iosClient = await createDeviceClient({
//     _id:"",
//     maxSize:1280,
//     version:"3.2",
//     perf:false,
//     deviceInfo:{
//         _id:"",
//         address:"i---dea21e2fdf39866bc6b676a1ee28daab8d5df10a",
//         screenWidth: 750,
//         screenHeight: 1334,
//         allotId:155,
//         name:"4399的iPhone"
//     },
//     external:{
//         staticDir:""
//     }
// },__dirname);
// iosClient.init();

// console.log("运行结果",await iosClient.forwardZXTouchPort());

// iosClient.control.touch(100,200,10);
// iosClient.start();
// iosClient.addClient();

export default createDeviceClient;
