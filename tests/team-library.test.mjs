import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSkillLibrary } from '../server/team-library.mjs';
import { createApp } from '../server/app.mjs';
import { client, request } from './http-helper.mjs';
import { initialState, createProject, reducer } from '../src/team-state.mjs';
import { skillIsAssigned, knowledgeGraph, contextPreview, workflows } from '../src/team-library-data.mjs';

test('library reads real contents, folded descriptions and changing versions; skips symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'white-skill-library-'));
  try {
    mkdirSync(join(root,'test'));
    writeFileSync(join(root,'test','SKILL.md'), '---\nname: test\ndescription: >-\n  first line\n  second line\n---\n# Real instructions');
    mkdirSync(join(root,'linked'));
    symlinkSync(join(root,'test','SKILL.md'), join(root,'linked','SKILL.md'));
    symlinkSync(join(root,'test'), join(root,'linked-folder'));
    const first = readSkillLibrary(root);
    assert.equal(first.length,1); assert.equal(first[0].description,'first line second line');
    assert.match(first[0].content,/# Real instructions/);
    writeFileSync(join(root,'test','SKILL.md'),'# Changed');
    assert.notEqual(readSkillLibrary(root)[0].version,first[0].version);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('real library endpoint requires a session and does not accept arbitrary paths', async () => {
  const dir=mkdtempSync(join(tmpdir(),'white-library-api-'));
  const runtime=createApp({dir});
  try {
    assert.equal((await request(runtime.app,'/api/team-library/skills')).status,401);
    const c=await client(runtime.app);
    const response=await c.request('/team-library/skills?path=/etc/passwd');
    assert.equal(response.status,200);
    assert.ok(response.data.skills.some(s=>s.id==='copy-carousel'));
    assert.ok(response.data.skills.every(s=>s.source.startsWith('.agents/skills/')));
  } finally { runtime.close(); rmSync(dir,{recursive:true,force:true}); }
});
test('workflow connections respect member scope and required skills exist', () => {
  const team=initialState().teams[0]; team.skills=[{id:'ig-caption',scope:'writer'}];
  assert.equal(skillIsAssigned(team,'ig-caption','director'),false);
  assert.equal(skillIsAssigned(team,'ig-caption','writer'),true);
  team.skills[0].scope='team'; assert.equal(skillIsAssigned(team,'ig-caption','director'),true);
  const available=new Set(readSkillLibrary().map(s=>s.id));
  for(const w of workflows) for(const step of w.steps) for(const id of step.skills) assert.ok(available.has(id),id);
});
test('graph and context contain only selected project records, not fabricated vector relationships', () => {
  const team=initialState().teams[0], project=team.projects[0];
  project.memory='brand facts'; project.guardrails='do not invent metrics'; project.resources=[{id:'one',name:'source',kind:'note',content:'real text'}];
  const other=createProject('private other'); other.memory='must not leak'; team.projects.push(other);
  const graph=knowledgeGraph(team,project);
  assert.equal(graph.nodes.length,4); assert.equal(graph.edges.length,3);
  assert.ok(graph.edges.every(e=>e.from==='project'));
  const context=contextPreview(team,project);
  assert.match(context,/do not invent metrics/); assert.doesNotMatch(context,/must not leak/);
});
test('asynchronous file records append without overwriting earlier uploads or crossing projects', () => {
  let state=initialState(); const teamId=state.activeTeamId, projectId=state.teams[0].activeProjectId;
  state=reducer(state,{type:'addProject',teamId,project:createProject('other')});
  for(const id of ['a','b']) state=reducer(state,{type:'appendResources',teamId,projectId,resources:[{id,name:id,kind:'file'}]});
  assert.deepEqual(state.teams[0].projects[0].resources.map(r=>r.id),['a','b']);
  assert.deepEqual(state.teams[0].projects[1].resources,[]);
});
