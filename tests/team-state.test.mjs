import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam, createProject, initialState, parseState, reducer, skillCatalog } from '../src/team-state.mjs';
import { existsSync } from 'node:fs';

test('same-template teams keep skills, model settings and projects separate', () => {
  let state = initialState();
  const first = state.teams[0];
  state = reducer(state, { type: 'patchTeam', teamId: first.id, patch: { model: 'Claude Code', skills: [{ id: 'ig-caption', scope: 'writer' }] } });
  const second = createTeam(first.name);
  state = reducer(state, { type: 'addTeam', team: second });
  assert.notEqual(second.id, first.id);
  assert.equal(second.model, 'Codex');
  assert.deepEqual(second.skills, []);
  assert.deepEqual(second.projects, []);
  assert.equal(state.teams[0].model, 'Claude Code');
  assert.equal(state.teams[0].skills.length, 1);
});
test('project drafts, messages, memories and references remain isolated', () => {
  let state = initialState();
  const teamId = state.activeTeamId, firstId = state.teams[0].activeProjectId;
  const second = createProject('第二個專案');
  state = reducer(state, { type: 'addProject', teamId, project: second });
  state = reducer(state, { type: 'patchProject', teamId, projectId: firstId, patch: { draft: 'first draft', memory: 'brand A', messages: [{ text: 'first' }], resources: [{ name: 'source A' }] } });
  const a = state.teams[0].projects[0], b = state.teams[0].projects[1];
  assert.equal(a.memory, 'brand A');
  assert.equal(b.memory, '');
  assert.equal(b.draft, '');
  assert.deepEqual(b.messages, []);
  assert.deepEqual(b.resources, []);
  assert.equal(state.teams[0].activeProjectId, second.id);
});
test('switching recipient preserves the same project timeline', () => {
  let state = initialState();
  const teamId = state.activeTeamId, projectId = state.teams[0].activeProjectId;
  const messages = [{ text: '給總監', recipient: 'director' }];
  state = reducer(state, { type: 'patchProject', teamId, projectId, patch: { messages } });
  state = reducer(state, { type: 'patchProject', teamId, projectId, patch: { recipient: 'writer' } });
  assert.equal(state.teams[0].projects.length, 1);
  assert.deepEqual(state.teams[0].projects[0].messages, messages);
  assert.equal(state.teams[0].projects[0].recipient, 'writer');
  assert.deepEqual(parseState(JSON.stringify(state)), state);
});
test('invalid stored state is rejected rather than silently overwritten', () => {
  assert.throws(() => parseState('{'));
  assert.throws(() => parseState(JSON.stringify({ version: 1, teams: [] })));
  assert.throws(() => parseState(JSON.stringify({ ...initialState(), version: 2 })));
});
test('every advertised existing skill resolves to a project skill file', () => {
  for (const skill of skillCatalog) assert.ok(existsSync(new URL(`../.agents/skills/${skill.id}/SKILL.md`, import.meta.url)), skill.id);
});
