const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {assert,equal,verifyEntry}=require('./proof-checks.cjs');
const {rpc,read}=require('./live-proof.cjs');
const root=path.resolve(__dirname,'..'),load=name=>JSON.parse(fs.readFileSync(path.join(root,'proofs',name+'.json')));
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
async function checkReceipt(name,hash,address,success){
  const saved=load(name+'-receipt'),live=await rpc('eth_getTransactionByHash',[hash]);
  assert((live.hash||live.tx_id)===hash&&(saved.hash||saved.tx_id)===hash,'Receipt hash mismatch');
  assert((live.status_name||live.statusName||live.status)==='FINALIZED','Receipt not finalized');
  assert((live.to_address||live.recipient).toLowerCase()===address.toLowerCase(),'Receipt destination mismatch');
  assert(equal(live.consensus_data.votes,saved.consensus_data.votes),'Saved votes differ from RPC');
  const execution=live.consensus_data.leader_receipt[0].execution_result;
  assert(execution===saved.consensus_data.leader_receipt[0].execution_result,'Execution result changed');
  const votes=Object.values(live.consensus_data.votes),result=live.result_name||live.result;
  if(success)assert(['SUCCESS','FINISHED_WITH_RETURN'].includes(execution)&&result==='MAJORITY_AGREE'&&votes.filter(v=>v==='agree').length>votes.length/2,'Unsuccessful consensus');
  else assert(execution==='ERROR','Expected rejection');
  return {hash,execution,result,agree:votes.filter(v=>v==='agree').length,disagree:votes.filter(v=>v==='disagree').length,idle:votes.filter(v=>v==='idle').length};
}
function walkExpected(entry,probes,answers){
  let node=entry.solution.tree,spent=0;
  for(const answer of answers){spent+=probes[node.probe].cost;node=node[answer==='YES'?'yes':'no'];}
  return {status:node.probe===-1?'CANDIDATE':'NEXT',candidates:node.candidates.map(i=>entry.source.profiles[i].id),spent,next_probe:node.probe===-1?null:probes[node.probe]};
}
async function main(){
  const deployment=load('deployment'),address=deployment.contract;
  assert(await rpc('eth_chainId',[])==='0xf22f','Wrong chain');
  const code=fs.readFileSync(path.join(root,'contracts/probe_minimax.py'));
  assert(code.equals(Buffer.from(await rpc('gen_getContractCode',[address]),'base64'))&&digest(code)===deployment.source_sha256,'Deployed source mismatch');
  const state=await read('verified-live-state',['call',address,'get_state']);
  assert(state.repository===deployment.repository&&equal(state.probes,deployment.probes)&&state.budget===deployment.budget,'Live configuration mismatch');
  const expected=JSON.parse(fs.readFileSync(path.join(root,'config/expected.json'))),names=Object.keys(expected);
  assert(state.results.length===names.length,'Unexpected live batch count');
  const summary={network:'studionet',chain_id:61999,contract:address,source_sha256:digest(code),exact_source_match:true,live_state_match:true,verified_at:new Date().toISOString(),deployment:await checkReceipt('deployment',deployment.transaction,address,true),scenarios:[]};
  for(const [i,name] of names.entries()){
    const snapshot=load(name),input=deployment.inputs[name];
    const bytes=fs.readFileSync(path.join(root,'profiles',name+'.json'));
    assert(digest(bytes)===input.sha256&&equal(JSON.parse(bytes),input.source),'Fixture differs');
    assert(snapshot.contract===address&&snapshot.state.results.length===i+1&&equal(state.results.slice(0,i+1),snapshot.state.results),'Snapshot differs from live state prefix');
    verifyEntry(state.results[i],expected[name],state.probes,state.budget,input.source,input.url,input.sha256);
    const receipt=await checkReceipt(name,snapshot.transaction,address,true);
    const walks=load(name+'-walks');
    for(const walk of walks)assert(equal(walk.result,walkExpected(state.results[i],state.probes,walk.answers)),'Incorrect recorded walk');
    if(expected[name].status==='READY'){
      const last=walks.at(-1),fresh=await read('verified-'+name+'-walk',['call',address,'walk','--args',String(i),JSON.stringify(last.answers)]);
      assert(equal(fresh,last.result),'Live walk differs');
    }
    summary.scenarios.push({name,status:expected[name].status,optimal_cost:expected[name].cost,...receipt});
  }
  const tamper=load('tamper');
  assert(tamper.contract===address&&tamper.state_unchanged===true&&tamper.reason_verified===true&&equal(tamper.state,state),'Rejection state binding');
  assert(JSON.stringify(load('tamper-decoded-receipt')).includes('[EXTERNAL] Source commitment mismatch'),'Rejection reason absent');
  summary.rejection=await checkReceipt('tamper',tamper.transaction,address,false);
  fs.writeFileSync(path.join(root,'proofs/verification.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
}
main().catch(error=>{console.error(error.stack,error.cause?.message||'');process.exitCode=1;});
