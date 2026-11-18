import test from 'node:test';
import assert from 'node:assert/strict';
import {knowledgeNetwork} from '../src/knowledge-network.mjs';
test('graph displays real resources including unparsed files and no project/task nodes',()=>{const g=knowledgeNetwork([{id:'a',name:'PDF',kind:'file'},{id:'b',kind:'research',content:'research'}]);assert.deepEqual(g.nodes.map(n=>n.id),['a']);assert.equal(g.edges.length,0);});
test('lexical vectors connect similar documents with inspectable shared terms; unrelated remains isolated',()=>{const text='核醫 放射藥物 同位素 診斷 治療';const g=knowledgeNetwork([{id:'a',content:text},{id:'b',content:text},{id:'c',content:'咖啡 烘焙 甜點 蛋糕'}]);assert.equal(g.edges.length,1);assert.ok(g.edges[0].score>.99);assert.ok(g.edges[0].terms.includes('同位素'));assert.equal(g.nodes.length,3);});
test('empty graph and documents have finite layout positions',()=>{assert.equal(knowledgeNetwork([]).nodes.length,0);const g=knowledgeNetwork([{id:'a',content:''},{id:'b',content:''}]);assert.equal(g.edges.length,0);assert.ok(Object.values(g.positions).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));});
