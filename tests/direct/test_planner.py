import ast
import copy
import hashlib
import itertools
import json
import random
import re
from functools import lru_cache
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
REPO = 'mohammadisina1988-jpg/probe-minimax'
PROBES = json.loads((ROOT / 'config/probes.json').read_text())
EXPECTED = json.loads((ROOT / 'config/expected.json').read_text())

@pytest.fixture
def planner(direct_deploy):
    return direct_deploy(str(ROOT / 'contracts/probe_minimax.py'), REPO, json.dumps(PROBES), 3)

def source(name):
    body = (ROOT / 'profiles' / (name+'.json')).read_bytes()
    url = f'https://raw.githubusercontent.com/{REPO}/' + 'a'*40 + '/profiles/'+name+'.json'
    return url, hashlib.sha256(body).hexdigest(), body

def rows(name):
    profiles = json.loads(source(name)[2])['profiles']
    return [{'id':p['id'],'cells':[{'answer':a,'paragraph':-1 if a=='UNKNOWN' else j} for j,a in enumerate(values)]} for p,values in zip(profiles,EXPECTED[name]['matrix'])]

def mock(vm,name='adaptive',candidate=None,own=None,anchor=True,body=None):
    vm.clear_mocks()
    url, digest, raw = source(name)
    vm.mock_web(re.escape(url),{'status':200,'body':raw if body is None else body})
    vm.mock_llm(r'.*PROBE-LEADER.*',json.dumps({'rows':rows(name) if candidate is None else candidate}))
    vm.mock_llm(r'.*PROBE-VALIDATOR.*',json.dumps({'rows':rows(name) if own is None else own}))
    vm.mock_llm(r'.*PROBE-ANCHORS.*',json.dumps({'valid':anchor}))
    return url,digest

@pytest.mark.parametrize('name',list(EXPECTED))
def test_four_outcomes_and_independent_validator(planner,direct_vm,name):
    planner.compile(*mock(direct_vm,name))
    entry=planner.get_state()['results'][0]
    assert entry['solution']['status']==EXPECTED[name]['status']
    assert entry['solution']['optimal_cost']==EXPECTED[name]['cost']
    assert [[c['answer'] for c in row['cells']] for row in entry['rows']]==EXPECTED[name]['matrix']
    assert direct_vm.run_validator() is True

def test_adaptive_paths_and_budget(planner,direct_vm):
    planner.compile(*mock(direct_vm))
    assert planner.walk(0,[])['next_probe']['id']=='metadata'
    assert planner.walk(0,['YES'])['next_probe']['id']=='stream'
    assert planner.walk(0,['NO'])['next_probe']['id']=='resume'
    for answers,name in [(['YES','YES'],'OPEN-STREAM'),(['YES','NO'],'OPEN-BASIC'),(['NO','YES'],'AUTH-RESUME'),(['NO','NO'],'AUTH-SINGLE')]:
        leaf=planner.walk(0,answers)
        assert leaf['status']=='CANDIDATE' and leaf['candidates']==[name] and leaf['spent']==3

def test_unknown_profile_survives_both_branches(planner,direct_vm):
    planner.compile(*mock(direct_vm,'overlap'))
    assert 'CONFIG-SINGLE' in planner.walk(0,['YES'])['candidates']
    assert 'CONFIG-SINGLE' in planner.walk(0,['NO'])['candidates']
    assert planner.walk(0,['YES','NO'])['candidates']==['CONFIG-SINGLE']
    assert planner.walk(0,['NO','YES'])['candidates']==['CONFIG-SINGLE']

@pytest.mark.parametrize('name',['ambiguous','cost-limit'])
def test_unready_plan_cannot_be_walked(planner,direct_vm,name):
    planner.compile(*mock(direct_vm,name))
    with direct_vm.expect_revert('not executable'):planner.walk(0,[])

@pytest.mark.parametrize('answers',[['MAYBE'],['YES','YES','YES'],['NO','NO','NO']])
def test_bad_or_excess_answers(planner,direct_vm,answers):
    planner.compile(*mock(direct_vm))
    with direct_vm.expect_revert('Invalid or excess'):planner.walk(0,answers)

def test_replay_preserves_results(planner,direct_vm):
    args=mock(direct_vm);planner.compile(*args)
    with direct_vm.expect_revert('Fresh commit-pinned'):planner.compile(*args)
    assert len(planner.get_state()['results'])==1

def test_validator_reacquires_source(planner,direct_vm):
    planner.compile(*mock(direct_vm))
    mock(direct_vm,body=source('adaptive')[2]+b' ')
    assert direct_vm.run_validator() is False

@pytest.mark.parametrize('name,coordinate,replacement',[('adaptive',(0,0),'NO'),('adaptive',(1,1),'YES'),('ambiguous',(2,2),'YES'),('overlap',(2,0),'NO')])
def test_every_positive_negative_unknown_decision_is_consequential(planner,direct_vm,name,coordinate,replacement):
    planner.compile(*mock(direct_vm,name))
    own=rows(name);i,j=coordinate
    own[i]['cells'][j]={'answer':replacement,'paragraph':j}
    mock(direct_vm,name,own=own)
    assert direct_vm.run_validator() is False

@pytest.mark.parametrize('verdict',[False,1,'true',None])
def test_source_anchor_audit_is_substantive_and_strict(planner,direct_vm,verdict):
    planner.compile(*mock(direct_vm))
    mock(direct_vm,anchor=verdict)
    assert direct_vm.run_validator() is False

@pytest.mark.parametrize('mutation',['bool','float','missing-anchor','unknown-anchor','missing-row','wrong-id','bad-code','extra-key'])
def test_malformed_output_cannot_append(planner,direct_vm,mutation):
    candidate=rows('adaptive')
    if mutation=='bool':candidate[0]['cells'][0]['paragraph']=True
    if mutation=='float':candidate[0]['cells'][0]['paragraph']=0.0
    if mutation=='missing-anchor':candidate[0]['cells'][0]['paragraph']=99
    if mutation=='unknown-anchor':candidate[0]['cells'][0]['answer']='UNKNOWN'
    if mutation=='missing-row':candidate.pop()
    if mutation=='wrong-id':candidate[0]['id']='OTHER'
    if mutation=='bad-code':candidate[0]['cells'][0]['answer']='MAYBE'
    if mutation=='extra-key':candidate[0]['cells'][0]['confidence']=100
    with direct_vm.expect_revert('[LLM_ERROR]'):planner.compile(*mock(direct_vm,candidate=candidate))
    assert planner.get_state()['results']==[]

@pytest.mark.parametrize('kind',['hash','utf8','duplicate-key','duplicate-id','extra-field'])
def test_invalid_acquired_source_cannot_append(planner,direct_vm,kind):
    url,digest,body=source('adaptive')
    if kind=='hash':body+=b' '
    if kind=='utf8':body=b'\xff'
    if kind=='duplicate-key':body=b'{"profiles":[],"profiles":[]}'
    if kind in ('duplicate-id','extra-field'):
        data=json.loads(body)
        if kind=='duplicate-id':data['profiles'][1]['id']=data['profiles'][0]['id']
        else:data['profiles'][0]['trusted']=True
        body=json.dumps(data).encode()
    mock(direct_vm,body=body)
    if kind!='hash':digest=hashlib.sha256(body).hexdigest()
    with direct_vm.expect_revert('[EXTERNAL]'):planner.compile(url,digest)
    assert planner.get_state()['results']==[]

@pytest.mark.parametrize('kind',['main','foreign','bad-hash'])
def test_source_namespace(planner,direct_vm,kind):
    url,digest=mock(direct_vm)
    if kind=='main':url=url.replace('a'*40,'main')
    if kind=='foreign':url=url.replace(REPO,'other/probe-minimax')
    if kind=='bad-hash':digest='0'*63
    with direct_vm.expect_revert('Fresh commit-pinned'):planner.compile(url,digest)

@pytest.mark.parametrize('kind',['bool-cost','zero-cost','duplicate-probe','empty-probes','bad-budget'])
def test_invalid_configuration(direct_deploy,kind):
    probes=copy.deepcopy(PROBES);budget=3
    if kind=='bool-cost':probes[0]['cost']=True
    if kind=='zero-cost':probes[0]['cost']=0
    if kind=='duplicate-probe':probes[1]['id']=probes[0]['id']
    if kind=='empty-probes':probes=[]
    if kind=='bad-budget':budget=0
    with pytest.raises(Exception,match=r'\[EXPECTED\]'):direct_deploy(str(ROOT/'contracts/probe_minimax.py'),REPO,json.dumps(probes),budget)

@lru_cache(None)
def solver():
    tree=ast.parse((ROOT/'contracts/probe_minimax.py').read_text())
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='plan')
    def fail(message):raise ValueError(message)
    namespace={'fail':fail};exec(compile(ast.Module(body=[fn],type_ignores=[]),'<planner>','exec'),namespace)
    return namespace['plan']

@lru_cache(None)
def every_tree(available):
    trees=[None]
    for p in available:
        children=every_tree(tuple(q for q in available if q!=p))
        trees.extend((p,left,right) for left in children for right in children)
    return tuple(trees)

def exhaustive_tree_cost(tree,matrix,costs,possible=None):
    possible=list(range(len(matrix))) if possible is None else possible
    if len(possible)<=1:return 0
    if tree is None:return float('inf')
    p,left,right=tree
    yes=[i for i in possible if matrix[i][p] in ('YES','UNKNOWN')]
    no=[i for i in possible if matrix[i][p] in ('NO','UNKNOWN')]
    return costs[p]+max(exhaustive_tree_cost(left,matrix,costs,yes),exhaustive_tree_cost(right,matrix,costs,no))

def check_against_all_trees(matrix,costs):
    result=solver()(matrix,costs,3)
    best=min(exhaustive_tree_cost(tree,matrix,costs) for tree in every_tree(tuple(range(len(costs)))))
    if best==float('inf'):
        assert result['status']=='AMBIGUOUS'
        i,j=result['witness']['profiles']
        for p,answer in enumerate(result['witness']['shared_answers']):
            assert matrix[i][p] in (answer,'UNKNOWN') and matrix[j][p] in (answer,'UNKNOWN')
    else:
        assert result['optimal_cost']==best
        assert result['status']==('READY' if best<=3 else 'COST_LIMIT')

def test_exhaustive_810_small_ternary_tables_and_96_three_probe_samples():
    for n in (2,3):
        for flat in itertools.product(('YES','NO','UNKNOWN'),repeat=n*2):
            check_against_all_trees([list(flat[i*2:i*2+2]) for i in range(n)],[1,2])
    randomizer=random.Random(541)
    for _ in range(96):
        check_against_all_trees([[randomizer.choice(('YES','NO','UNKNOWN')) for _ in range(3)] for _ in range(3)],[1,2,2])

def test_adaptive_plan_beats_every_fixed_order():
    matrix=EXPECTED['adaptive']['matrix'];costs=[1,2,2]
    worst=[]
    for order in itertools.permutations(range(3)):
        totals=[]
        for actual in range(4):
            candidates=list(range(4));spent=0
            for p in order:
                if len(candidates)==1:break
                spent+=costs[p];answer=matrix[actual][p]
                candidates=[i for i in candidates if matrix[i][p]==answer]
            totals.append(spent)
        worst.append(max(totals))
    assert min(worst)==5
    assert solver()(matrix,costs,3)['optimal_cost']==3
