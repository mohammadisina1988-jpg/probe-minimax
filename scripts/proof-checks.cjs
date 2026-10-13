const assert=(ok,message)=>{if(!ok)throw Error(message);};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const cache=new Map();
function everyTree(available){
  const key=available.join(',');if(cache.has(key))return cache.get(key);
  const trees=[null];
  for(const p of available){const children=everyTree(available.filter(q=>q!==p));for(const left of children)for(const right of children)trees.push([p,left,right]);}
  cache.set(key,trees);return trees;
}
function referenceCost(tree,matrix,costs,possible){
  if(possible.length<=1)return 0;if(tree===null)return Infinity;
  const [p,left,right]=tree,yes=possible.filter(i=>['YES','UNKNOWN'].includes(matrix[i][p])),no=possible.filter(i=>['NO','UNKNOWN'].includes(matrix[i][p]));
  return costs[p]+Math.max(referenceCost(left,matrix,costs,yes),referenceCost(right,matrix,costs,no));
}
function checkTree(node,matrix,probes,candidates,unused){
  assert(equal(node.candidates,candidates),'Tree invents or drops a candidate');
  if(node.probe===-1){assert(candidates.length<=1,'Premature ambiguous leaf');return 0;}
  const p=node.probe;assert(Number.isInteger(p)&&unused.includes(p),'Invalid/repeated probe');
  const remaining=unused.filter(q=>q!==p),yes=candidates.filter(i=>matrix[i][p]!=='NO'),no=candidates.filter(i=>matrix[i][p]!=='YES');
  return probes[p].cost+Math.max(checkTree(node.yes,matrix,probes,yes,remaining),checkTree(node.no,matrix,probes,no,remaining));
}
function verifyEntry(entry,target,probes,budget,source,url,sha256){
  assert(entry.url===url&&entry.sha256===sha256&&equal(entry.source,source),'Source binding mismatch');
  const matrix=entry.rows.map((row,i)=>{
    assert(row.id===source.profiles[i].id&&row.cells.length===probes.length,'Matrix alignment');
    for(const cell of row.cells){assert(['YES','NO','UNKNOWN'].includes(cell.answer),'Invalid cell');assert(Number.isInteger(cell.paragraph)&&(cell.answer==='UNKNOWN'?cell.paragraph===-1:cell.paragraph>=0&&cell.paragraph<source.profiles[i].paragraphs.length),'Invalid anchor');}
    return row.cells.map(c=>c.answer);
  });
  assert(equal(matrix,target.matrix),'Unexpected semantic extraction');
  const indices=matrix.map((_,i)=>i),costs=probes.map(p=>p.cost),unused=probes.map((_,i)=>i);
  let best=Infinity;for(const tree of everyTree(unused))best=Math.min(best,referenceCost(tree,matrix,costs,indices));
  const s=entry.solution;
  assert(s.status===target.status&&s.optimal_cost===target.cost&&s.budget===budget,'Unexpected solution');
  if(best===Infinity){
    assert(s.status==='AMBIGUOUS'&&s.tree===null&&s.optimal_cost===null,'False complete plan');
    const [i,j]=s.witness.profiles;assert(i<j&&j<matrix.length&&s.witness.shared_answers.length===probes.length,'Invalid ambiguity witness');
    for(let p=0;p<probes.length;p++)for(const row of [i,j])assert([s.witness.shared_answers[p],'UNKNOWN'].includes(matrix[row][p]),'Witness does not overlap');
  }else{
    assert(s.optimal_cost===best&&s.status===(best<=budget?'READY':'COST_LIMIT')&&s.witness===null,'Nonoptimal or wrong budget decision');
    assert(checkTree(s.tree,matrix,probes,indices,unused)===best,'Tree cost differs from independent exhaustive optimum');
  }
}
module.exports={assert,equal,verifyEntry};
