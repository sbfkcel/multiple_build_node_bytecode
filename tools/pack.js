import vm from "node:vm";
import fs from "fs-extra";
import v8 from "node:v8";
import {build} from "esbuild";
import {fileURLToPath} from "url";
import path,{dirname} from "path";
import {spawn} from "child_process";
import config from "../package.json" assert {type:"json"};
v8.setFlagsFromString("--no-lazy");                                                                 // V8 默认是惰性解析（并不会一次性解析），https://zhuanlan.zhihu.com/p/400470592

const run = (exe,args,option={shell:true}) => {
    return new Promise((resolve,reject)=>{
        const run = spawn(exe,args,option);
        const cmdStr = `Run -> ${exe} ${args.join(" ")}`;
        console.log(cmdStr);
        run.stdout.on('data',data=>{
            console.log(data.toString());
        });
        run.stderr.on('data',err=>{
            console.log(err.toString());
        });
        run.on('close',code => {
            if(code === 0){
                console.log(`${cmdStr} Succcess`);
                resolve();
            }else{
                console.error(`${cmdStr} Error`);
                reject();
            };
        });

    })

};
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const createEntry = (str,obj)=>{                                                                    // 创建入口
    const re = /#{\w+}/g;
    const arr = str.match(re);
    if(arr){
        for(let i=0,len=arr.length; i<len; i++){
            const item = arr[i];
            const data = obj[item.slice(2,-1)];
            str = str.replaceAll(item,data)
        };
    };
    return str;
};
const camelToKebab = str => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const generateVersion = async (packageName) => {
    const data = await (await fetch(`https://registry.npmjs.org/${packageName}`)).json();
    const arr = data['dist-tags']?.latest.split('.') || [0];
    return `${+arr[0] + 1}.0.0`;
};

(async()=>{
    const no_publish = process.env.NO_PUBLISH ? true : false;                                       // 环境变量判断是否发布
    const entryFiles = process.argv.slice(2);
    const res = await build({                                                                       // 打包代码
        entryPoints: entryFiles,
        bundle: true,
        write:false,
        format: 'cjs',
        platform: 'node',
        external: ['usb','axios'],
    });
    const npmUser = '4399tdc-autotest';
    for(let i=0,len=res.outputFiles.length; i<len; i++){
        const jsCode = res.outputFiles[i].text;
        const srcPathObj = path.parse(entryFiles[i]);
        const packageName =  process.env.pkgName || (srcPathObj.name === 'index' ? path.basename(srcPathObj.dir) :  srcPathObj.name);
        const npmPackageName = `${npmUser}-${camelToKebab(packageName)}`;
        const outputDir = path.join(path.resolve(),'node_modules',npmPackageName);
        const outputFileBc = path.join(outputDir,`${process.platform}_${process.arch}.bc`);
        const outputFileJs = path.join(outputDir,`${process.platform}_${process.arch}.js`);         // 保存JS代码（用于调试）
        fs.ensureDirSync(outputDir);                                                                // 保证目录存在
        const script = new vm.Script(jsCode);
        const byteCode = script.createCachedData();                                                 // 得到 vm 中缓存的字节码
        fs.writeFileSync(outputFileBc,byteCode);
        // fs.writeFileSync(outputFileJs,jsCode);
        const packageObj = {};
        packageObj.name = npmPackageName;
        packageObj.version = config.version;
        packageObj.main = 'index.js';

        const entryTpl = path.join(__dirname,'index.tpl');
        const entryData = {};
        entryData.name = `${process.platform}_${process.arch}.bc`;
        const entryCode = createEntry(fs.readFileSync(entryTpl,'utf-8'),entryData);                 // 创建入口内容
        fs.writeFileSync(path.join(outputDir,'index.js'),entryCode);                                // 写入入口文件
        fs.writeFileSync(path.join(outputDir,'package.json'),JSON.stringify(packageObj,null,2));    // 写入包配置文件
        console.log("@@@",outputDir);
        // !no_publish && await run('npm',['publish'],{shell:true,cwd:outputDir,windowsHide:true});    // 尝试向 npm 提交
    };
})()