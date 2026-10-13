// Ephemeral encrypted CLI account; no private key is extracted or exported.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
if(!process.env.GITHUB_ACTIONS||!process.env.GITHUB_ENV)throw Error('This bootstrap is for a disposable GitHub Actions runner');
const password=crypto.randomBytes(24).toString('hex');
console.log('::add-mask::'+password);
const cli=path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'genlayer/dist/index.js');
const run=args=>cp.execFileSync(process.execPath,[cli,...args],{windowsHide:true,stdio:['ignore','ignore','pipe']});
try{
  run(['account','create','--name','probe-proof','--password',password]);
  run(['network','set','studionet']);
  run(['account','use','probe-proof']);
  fs.appendFileSync(process.env.GITHUB_ENV,`GENLAYER_CLI_PATH=${cli}\nPROBE_ACCOUNT=probe-proof\nPROBE_PASSWORD=${password}\n`);
  console.log('Encrypted ephemeral StudioNet account prepared');
}catch(error){console.error('CLI account bootstrap failed',String(error.stderr||'').slice(-600));process.exitCode=1;}
