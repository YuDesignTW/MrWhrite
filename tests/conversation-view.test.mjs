import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleRuns,replyForRole} from '../src/conversation-view.mjs';

test('specialists see their direct conversations and assigned work only',()=>{
  const runs=[{role:'director',steps:[{role:'research'}]},{role:'writer',steps:[]},{role:'designer',steps:[]}];
  assert.deepEqual(visibleRuns(runs,'director'),runs);
  assert.deepEqual(visibleRuns(runs,'research'),[runs[0]]);
  assert.deepEqual(visibleRuns(runs,'writer'),[runs[1]]);
});
test('search acquisition does not claim the observation report is complete',()=>{
  const run={role:'director',search:{sources:[{}]},steps:[{role:'research',status:'running'}]};
  assert.match(replyForRole(run,'research'),/觀察報告尚未完成/);
  run.steps[0]={role:'research',status:'completed',output:'1. 已查得的觀察與限制'};
  assert.equal(replyForRole(run,'research'),'1. 已查得的觀察與限制');
});
test('writer shows copy while designer reports actual delivered page count and review state',()=>{
  const run={role:'director',steps:[],output:'總監審稿中',deliverable:{title:'品牌判斷',files:[{},{}],slides:[{},{}],caption:'這是已產出的完整文案。'}};
  assert.match(replyForRole(run,'writer'),/這是已產出的完整文案/);
  assert.match(replyForRole(run,'designer'),/共 2 頁，等待審稿/);
  assert.equal(replyForRole(run,'director'),'總監審稿中');
});
test('structured agent output becomes readable content without exposing unrelated output',()=>{
 const run={role:'director',output:'總監回覆',steps:[{role:'writer',status:'completed',output:'```json\n{"caption":"完整文字"}\n```'}]};
 assert.equal(replyForRole(run,'writer'),'完整文字');
 assert.equal(replyForRole(run,'designer'),'');
});
