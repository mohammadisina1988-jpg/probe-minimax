const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {assert,equal,verifyEntry}=require('./proof-checks.cjs');
const root=path.resolve(__dirname,'..'),cli=process.env.GENLAYER_CLI_PATH;
assert(cli&&fs.existsSync(cli),'Set GENLAYER_CLI_PATH to installed genlayer/dist/index.js');
const journal=path.join(root,'.proof-journal'),proofs=path.join(root,'proofs');
for(const p of [journal,proofs])fs.mkdirSync(p,{recursive:true});
const source=fs.readFileSync(path.join(root,'contracts/probe_minimax.py'));
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const sourceHash=digest(source),repo='mohammadisina1988-jpg/probe-minimax';
const probes=JSON.parse(fs.readFileSync(path.join(root,'config/probes.json'))),budget=3;
const revision=fs.readFileSync(path.join(root,'config/fixture-revision.txt'),'utf8').trim();
const expected=JSON.parse(fs.readFileSync(path.join(root,'config/expected.json')));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const sanitize=x=>Array.isArray(x)?x.map(sanitize):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='node_config').map(([k,v])=>[k,/private.?key|api.?key|password|secret|authorization/i.test(k)?'REDACTED':sanitize(v)])):x;
const save=(name,value)=>fs.writeFileSync(path.join(proofs,name+'.json'),JSON.stringify(sanitize(value),null,2)+'\n');
function recovery(label,hash){
  const file=path.join(proofs,'resume.json'),record=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{source_sha256:sourceHash,hashes:{}};
  assert(record.source_sha256===sourceHash,'Recovery source mismatch');record.hashes[label]=hash;save('resume',record);
}
function seed(label,args,hash){
  if(!hash)return;
  assert(/^0x[0-9a-f]{64}$/i.test(hash),'Invalid resume hash');
  const file=path.join(journal,label+'.json');
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({started:true,args,sourceHash,hash}));
  recovery(label,hash);
}
const parse=output=>{const i=output.indexOf('Result:');assert(i>=0,'Missing CLI result');return JSON.parse(output.slice(i+7).trim());};
function invoke(label,args){
  const file=path.join(journal,label+'.json'),prior=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
  const mutation=['deploy','write'].includes(args[0]);
  if(mutation&&prior.hash){assert(prior.sourceHash===sourceHash&&equal(prior.args,args),'Unsafe hash recovery');return Promise.resolve(prior.hash);}
  if(mutation&&prior.started)throw Error('Ambiguous previous send; inspect journal before retrying '+label);
  console.log('RUN',label);
  if(mutation)fs.writeFileSync(file,JSON.stringify({started:true,args,sourceHash}));
  return new Promise((resolve,reject)=>{
    const child=cp.spawn(process.execPath,['--require',path.join(__dirname,'cli-json.cjs'),cli,...args],{cwd:root,windowsHide:true,env:{...process.env,NO_COLOR:'1'},stdio:['pipe','pipe','pipe']});
    child.stdin.end((process.env.PROBE_PASSWORD||'')+'\n');let stdout='',stderr='',hash;
    const timer=setTimeout(()=>{console.log('CLI TIMEOUT',label,hash||'no hash; inspect before retry');child.kill();},90000);
    child.stdout.on('data',chunk=>{
      stdout+=String(chunk);const found=stdout.match(/(?:Deployment|Write) Transaction Hash:\s*(0x[0-9a-f]{64})/i)?.[1];
      if(found&&!hash){hash=found;fs.writeFileSync(file,JSON.stringify({started:true,args,sourceHash,hash}));recovery(label,hash);console.log('SUBMITTED',label,hash);}
    });
    child.stderr.on('data',chunk=>stderr+=String(chunk));child.on('error',reject);
    child.on('close',code=>{
      clearTimeout(timer);fs.writeFileSync(file,JSON.stringify({started:true,args,sourceHash,hash,stdout,stderr,code}));
      if(mutation&&hash)resolve(hash);
      else if(code!==0)reject(Error(label+': '+stderr.slice(-800)));
      else resolve(stdout);
    });
  });
}
async function read(label,args){
  for(let i=0;i<3;i++){try{return parse(await invoke(label,args));}catch(error){if(i===2)throw error;await delay(7000);}}
}
async function rpc(method,params){
  assert(['eth_chainId','eth_getTransactionByHash','gen_getContractCode'].includes(method),'Read-only RPC helper');
  for(let i=0;i<3;i++){
    try{const r=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(30000)});const data=await r.json();assert(r.ok&&!data.error,JSON.stringify(data.error||r.status));return data.result;}
    catch(error){if(i===2)throw error;await delay(7000);}
  }
}
async function receipt(label,hash,success=true){
  let r;
  for(let i=0;i<100;i++){
    r=await rpc('eth_getTransactionByHash',[hash]);
    if((r?.status_name||r?.statusName||r?.status)==='FINALIZED')break;
    await delay(6000);
  }
  assert(r,'Receipt missing');r.status_name=r.status_name||r.statusName||r.status;r.result_name=r.result_name||r.result;r.hash=r.hash||r.tx_id;
  save(label+'-receipt',r);
  const execution=r.consensus_data?.leader_receipt?.[0]?.execution_result;
  console.log('RECEIPT',label,r.status_name,execution,r.result_name,JSON.stringify(r.consensus_data?.votes));
  assert(r.status_name==='FINALIZED','Not finalized');
  if(success){const votes=Object.values(r.consensus_data.votes);assert(r.result_name==='MAJORITY_AGREE'&&['SUCCESS','FINISHED_WITH_RETURN'].includes(execution)&&votes.filter(v=>v==='agree').length>votes.length/2,'Execution/consensus failure '+label);}
  return r;
}
async function main(){
  console.log('PREFLIGHT StudioNet');
  assert(await rpc('eth_chainId',[])==='0xf22f','Wrong network');
  const inputs={};
  for(const name of Object.keys(expected)){
    const bytes=fs.readFileSync(path.join(root,'profiles',name+'.json')),url=`https://raw.githubusercontent.com/${repo}/${revision}/profiles/${name}.json`;
    let acquired;
    for(let attempt=0;attempt<3;attempt++){
      try {const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert(r.ok,'Public fixture HTTP '+r.status);acquired=Buffer.from(await r.arrayBuffer());break;}
      catch(error){console.log('PREFLIGHT RETRY',name,error.cause?.message||error.message);if(attempt===2)throw error;await delay(7000);}
    }
    assert(bytes.equals(acquired),'Public fixture differs '+name);
    inputs[name]={url,sha256:digest(bytes),source:JSON.parse(bytes)};
  }
  const deployArgs=['deploy','--contract','contracts/probe_minimax.py','--args',repo,JSON.stringify(JSON.stringify(probes)),String(budget)];
  seed('deployment',deployArgs,process.env.PROBE_RESUME_DEPLOY_TX);
  const deployHash=await invoke('deployment',deployArgs);
  const deployed=await receipt('deployment',deployHash);
  const address=deployed.to_address||deployed.recipient;
  assert(/^0x[0-9a-f]{40}$/i.test(address),'Missing contract address');
  assert(source.equals(Buffer.from(await rpc('gen_getContractCode',[address]),'base64')),'Deployed source mismatch');
  save('deployment',{network:'studionet',chain_id:61999,contract:address,transaction:deployHash,source_sha256:sourceHash,exact_source_match:true,repository:repo,probes,budget,fixture_revision:revision,inputs});
  console.log('DEPLOYED',address);
  const resumedWrites=JSON.parse(process.env.PROBE_RESUME_WRITES||'{}');
  assert(Object.keys(resumedWrites).every(name=>Object.hasOwn(expected,name)||name==='tamper'),'Unknown resume scenario');
  for(const [index,name] of Object.keys(expected).entries()){
    const input=inputs[name],before=await read(name+'-before',['call',address,'get_state']);
    assert(before.repository===repo&&equal(before.probes,probes)&&before.budget===budget,'Configuration mismatch');
    const args=['write',address,'compile','--args',input.url,input.sha256];seed(name,args,resumedWrites[name]);
    const prior=path.join(journal,name+'.json'),resumed=fs.existsSync(prior)&&JSON.parse(fs.readFileSync(prior)).hash;
    assert(before.results.length===index||(resumed&&before.results.length>=index+1),'Existing batch requires its exact saved transaction hash');
    const hash=await invoke(name,args);
    const confirmed=await receipt(name,hash);
    assert((confirmed.to_address||confirmed.recipient).toLowerCase()===address.toLowerCase(),'Wrong write destination');
    const state=await read(name+'-state',['call',address,'get_state']);
    const prefix={...state,results:state.results.slice(0,index+1)};
    save(name,{contract:address,transaction:hash,index,expected:expected[name],state_before:resumed?null:before,historical_prefix:state.results.length!==index+1,observed_batch_count:state.results.length,state:prefix});
    assert(state.results.length>=index+1,'Missing appended batch');
    verifyEntry(state.results[index],expected[name],probes,budget,input.source,input.url,input.sha256);
    const walks=[];
    if(expected[name].status==='READY'){
      const paths=name==='adaptive'?[[],['YES'],['NO'],['YES','YES'],['YES','NO'],['NO','YES'],['NO','NO']]:[['YES'],['NO'],['YES','NO'],['NO','YES']];
      for(const answers of paths){await delay(1200);walks.push({answers,result:await read(name+'-walk-'+(answers.join('-')||'root'),['call',address,'walk','--args',String(index),JSON.stringify(answers)])});}
    }
    save(name+'-walks',walks);console.log('VERIFIED',name,expected[name].status,expected[name].cost);
    await delay(5000);
  }
  const original=inputs.adaptive,bad=(original.sha256[0]==='0'?'1':'0')+original.sha256.slice(1);
  const before=await read('tamper-before',['call',address,'get_state']);
  const tamperArgs=['write',address,'compile','--args',original.url,bad];seed('tamper',tamperArgs,resumedWrites.tamper);
  const hash=await invoke('tamper',tamperArgs);
  const rejected=await receipt('tamper',hash,false);
  const decoded=await read('tamper-decoded',['receipt',hash,'--status','FINALIZED','--retries','2','--interval','3000']);save('tamper-decoded-receipt',decoded);
  const after=await read('tamper-after',['call',address,'get_state']);
  const reason=JSON.stringify(decoded).includes('[EXTERNAL] Source commitment mismatch');
  save('tamper',{contract:address,transaction:hash,url:original.url,wrong_sha256:bad,correct_sha256:original.sha256,state_unchanged:equal(before,after),reason_verified:reason,state:after});
  assert(rejected.consensus_data.leader_receipt[0].execution_result==='ERROR'&&equal(before,after)&&reason,'Tampered commitment not rejected as expected');
  console.log('VERIFIED tamper rejection; no state mutation');
}
module.exports={main,rpc,read,receipt,save};
if(require.main===module)main().catch(error=>{console.error(error.stack,error.cause?.message||'');process.exitCode=1;});
