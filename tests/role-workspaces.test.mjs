import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, createProject, createTeam, reducer } from '../src/team-state.mjs';
import { roleData, numericMetric, summarizeMetrics, roleSummary } from '../src/role-workspaces.mjs';

test('role settings merge without erasing another role, project or team',()=>{
  let state=initialState();const teamId=state.activeTeamId,projectId=state.teams[0].activeProjectId;
  state=reducer(state,{type:'addProject',teamId,project:createProject('other')});
  state=reducer(state,{type:'addTeam',team:createTeam('other team')});
  const patch=(role,patch)=>state=reducer(state,{type:'patchRole',teamId,projectId,role,patch});
  patch('writer',{title:'title',content:'draft'});patch('designer',{style:'style'});patch('writer',{caption:'caption'});
  const project=state.teams[0].projects[0];
  assert.deepEqual(roleData(project,'writer'),{title:'title',content:'draft',caption:'caption'});
  assert.equal(roleData(project,'designer').style,'style');
  assert.deepEqual(roleData(state.teams[0].projects[1],'writer'),{});
  assert.deepEqual(state.teams[1].projects,[]);
});
test('unknown metrics stay unknown; real zeros are preserved',()=>{
  assert.equal(numericMetric(''),null);assert.equal(numericMetric('0'),0);
  assert.throws(()=>numericMetric('-1'));assert.throws(()=>numericMetric('1.5'));
  assert.throws(()=>numericMetric('not a number'));
  assert.deepEqual(summarizeMetrics([]),{views:null,comments:null,count:0});
  assert.deepEqual(summarizeMetrics([{views:0,comments:null},{views:15,comments:0}]),{views:15,comments:0,count:2});
});
test('user handoff appends to the same timeline and routes to director without touching other projects',()=>{
  let state=initialState();const teamId=state.activeTeamId,projectId=state.teams[0].activeProjectId;
  state=reducer(state,{type:'addProject',teamId,project:createProject('other')});
  state=reducer(state,{type:'patchProject',teamId,projectId,patch:{recipient:'writer',messages:[{id:'original',text:'brief'}]}});
  state=reducer(state,{type:'handoff',teamId,projectId,message:{id:'report',kind:'handoff',from:'writer',recipient:'director',text:'draft'}});
  const p=state.teams[0].projects[0];assert.equal(p.recipient,'director');assert.equal(p.messages[0].id,'original');assert.equal(p.messages[1].from,'writer');assert.equal(state.teams[0].projects[1].messages.length,0);
});
test('tasks retain assignments through review and summaries only use selected project saved data',()=>{
  let state=initialState();const teamId=state.activeTeamId,projectId=state.teams[0].activeProjectId;
  state=reducer(state,{type:'addTask',teamId,projectId,task:{id:'task',title:'design',assignee:'designer',status:'待處理'}});
  state=reducer(state,{type:'reviewTask',teamId,projectId,taskId:'task',status:'待總監審核'});
  assert.deepEqual(state.teams[0].projects[0].tasks[0],{id:'task',title:'design',assignee:'designer',status:'待總監審核'});
  state=reducer(state,{type:'patchRole',teamId,projectId,role:'writer',patch:{content:'saved text',caption:'caption'}});
  assert.match(roleSummary(state.teams[0].projects[0],'writer'),/saved text/);
  assert.match(roleSummary(state.teams[0].projects[0],'writer'),/caption/);
  assert.doesNotMatch(roleSummary(createProject('empty'),'writer'),/saved text/);
});
