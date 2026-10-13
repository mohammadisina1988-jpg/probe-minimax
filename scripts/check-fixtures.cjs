// Offline proof-verifier checks. These constructed entries are not onchain receipts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {assert,verifyEntry}=require('./proof-checks.cjs');
const root=path.resolve(__dirname,'..'),probes=JSON.parse(fs.readFileSync(path.join(root,'config/probes.json'))),targets=JSON.parse(fs.readFileSync(path.join(root,'config/expected.json')));
const leaf=i=>({candidates:[i],probe:-1});
const trees={
  adaptive:{candidates:[0,1,2,3],probe:0,yes:{candidates:[0,1],probe:1,yes:leaf(0),no:leaf(1)},no:{candidates:[2,3],probe:2,yes:leaf(2),no:leaf(3)}},
  'cost-limit':{candidates:[0,1,2,3],probe:1,yes:{candidates:[0,1],probe:2,yes:leaf(0),no:leaf(1)},no:{candidates:[2,3],probe:2,yes:leaf(2),no:leaf(3)}},
  overlap:{candidates:[0,1,2],probe:0,yes:{candidates:[0,2],probe:2,yes:leaf(0),no:leaf(2)},no:{candidates:[1,2],probe:1,yes:leaf(2),no:leaf(1)}}
};
for(const [name,target] of Object.entries(targets)){
  const bytes=fs.readFileSync(path.join(root,'profiles',name+'.json')),source=JSON.parse(bytes),hash=crypto.createHash('sha256').update(bytes).digest('hex'),url='https://fixture.invalid/'+name;
  const entry={url,sha256:hash,source,rows:source.profiles.map((p,i)=>({id:p.id,cells:target.matrix[i].map((answer,j)=>({answer,paragraph:answer==='UNKNOWN'?-1:j}))})),solution:{status:target.status,optimal_cost:target.cost,budget:3,tree:trees[name]||null,witness:name==='ambiguous'?{profiles:[2,3],shared_answers:['NO','YES','NO']}:null}};
  verifyEntry(entry,target,probes,3,source,url,hash);
  const forged=JSON.parse(JSON.stringify(entry));
  if(name==='ambiguous')forged.solution.witness.shared_answers[2]='YES';
  else forged.solution.optimal_cost=1;
  let rejected=false;try{verifyEntry(forged,target,probes,3,source,url,hash);}catch{rejected=true;}
  assert(rejected,'Proof verifier accepted forged '+name);
}
console.log('4 authored fixture trees/witnesses accepted; 4 forged solutions rejected. Offline only.');
