import json,subprocess,concurrent.futures,pathlib,datetime
repos=['Frankie-Xu/threadport','rosehgal/handoff','conorbronsdon/agent-context-os','Ryu0118/ctxmv','entireio/cli','entireio/skills','steveyegge/beads','thedotmack/claude-mem','mem0ai/mem0','getzep/graphiti','Dicklesworthstone/coding_agent_session_search','00PrabalK00/Continuum','ashahi10/ai-capsules','megarampo/threadport']
p=pathlib.Path('research/evidence');p.mkdir(exist_ok=True)
def get(repo):
 raw=subprocess.check_output(['curl','-sS','--retry','2','https://api.github.com/repos/'+repo],text=True)
 try:d=json.loads(raw)
 except:return {'repo':repo,'error':raw[:100]}
 (p/(repo.replace('/','__')+'.json')).write_text(raw)
 return {'repo':repo,**{k:d.get(k) for k in ['stargazers_count','forks_count','created_at','pushed_at','description','archived','message']}}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex: rows=list(ex.map(get,repos))
(p/'repository-snapshot.json').write_text(json.dumps({'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repositories':rows},ensure_ascii=False,indent=2))
print(json.dumps(rows,ensure_ascii=False,indent=2))
for name,ep in [('pulls','pulls?state=all&per_page=100'),('issues','issues?state=all&per_page=100'),('runs','actions/runs?per_page=10'),('releases','releases'),('contributors','contributors')]:
 raw=subprocess.check_output(['curl','-sS','--retry','2','https://api.github.com/repos/Frankie-Xu/threadport/'+ep],text=True);(p/('threadport-'+name+'.json')).write_text(raw)
