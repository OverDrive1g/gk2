const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, demo, connectionError, deletionPlan, removeItem } = require('./core.js');
const { nodePorts } = require('./core.js');
test('producers have only output; terminators accept every material', () => {
  const data=demo();data.edges=[];
  const sink={id:'sink',type:'terminator',x:500,y:100};data.nodes.push(sink);
  assert.deepEqual(nodePorts(data,sink),{inputs:[null],outputs:[]});
  for(const m of data.materials){
    const source={id:'source-'+m.id,type:'producer',material:m.id,x:0,y:0};data.nodes.push(source);
    assert.deepEqual(nodePorts(data,source),{inputs:[],outputs:[m.id]});
    assert.equal(connectionError(data,source.id,'sink',0),'');
  }
  assert.equal(connectionError(data,'source-ore','n1',0),'');
  assert.match(connectionError(data,'source-wood','n1',0),/совпадать/);
  assert.match(connectionError(data,'n1','source-iron',0),/входной/);
  assert.match(connectionError(data,'sink','n1',0),/выходной/);
  assert.match(connectionError(data,'source-iron','sink',1),/входной/);
  data.edges.push({id:'supply',from:'source-ore',to:'sink',input:0});
  assert.match(connectionError(data,'source-wood','sink',0),/занят/);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(data))),data);
  const removed=removeItem(data,'material','ore');
  assert.ok(!removed.nodes.some(n=>n.id==='source-ore'));
  assert.ok(removed.nodes.some(n=>n.id==='sink'));
  assert.equal(removed.edges.length,0);
  assert.deepEqual(validate(removed),removed);
});
test('terminators accept recipes and all splitter outputs; invalid producer data is rejected', () => {
  const data=demo();data.edges=[];
  data.nodes.push({id:'sink',type:'terminator',x:0,y:0},{id:'split',type:'splitter',material:'iron',outputs:3,x:0,y:0});
  assert.equal(connectionError(data,'n1','sink',0),'');
  for(let output=0;output<3;output++)assert.equal(connectionError(data,'split','sink',0,output),'');
  data.nodes.push({id:'bad',type:'producer',material:'missing',x:0,y:0});
  assert.throws(()=>validate(data));
  assert.deepEqual(validate({version:1,materials:[],recipes:[],nodes:[{id:'sink',type:'terminator',x:0,y:0}],edges:[]}).nodes,[{id:'sink',type:'terminator',x:0,y:0}]);
});
test('JSON round trip preserves materials, icons and graph', () => {
  const data = demo(); assert.deepEqual(validate(JSON.parse(JSON.stringify(data))), data);
});
test('recipe quantities survive JSON export and import', () => {
  const data = demo();
  data.recipes[0].outputQuantity = 3;
  data.recipes[0].inputQuantities = [5, 2];
  assert.deepEqual(validate(JSON.parse(JSON.stringify(data))), data);
  data.edges = [];
  assert.equal(connectionError(data, 'n1', 'n4', 0), '');
});
test('legacy recipes default to one unit for every material', () => {
  const data = demo();
  for (const r of data.recipes) { delete r.outputQuantity; delete r.inputQuantities; }
  const migrated = validate(data);
  for (const r of migrated.recipes) {
    assert.equal(r.outputQuantity, 1);
    assert.deepEqual(r.inputQuantities, r.inputs.map(() => 1));
  }
});
test('invalid quantities and input quantity counts are rejected', () => {
  for (const value of [0, -1, 1.5, '2', null, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const data = demo(); data.recipes[0].outputQuantity = value;
    assert.throws(() => validate(data));
    data.recipes[0].outputQuantity = 1; data.recipes[0].inputQuantities[0] = value;
    assert.throws(() => validate(data));
  }
  for (const value of [[], [1], [1,2,3], null, '1,2']) {
    const data = demo(); data.recipes[0].inputQuantities = value;
    assert.throws(() => validate(data));
  }
});
test('splitters with two and three outputs preserve individual output connections in JSON', () => {
  for (const outputs of [2,3]) {
    const data = demo(); data.edges = [];
    data.nodes.push({id:'split',type:'splitter',material:'iron',outputs,x:200,y:200});
    data.edges.push({id:'feed',from:'n1',to:'split',input:0});
    for (let output=0;output<outputs;output++) {
      data.nodes.push({id:'consumer'+output,recipe:'nails',x:500,y:output*200});
      assert.equal(connectionError(data,'split','consumer'+output,0,output),'');
      data.edges.push({id:'branch'+output,from:'split',to:'consumer'+output,input:0,output});
    }
    assert.deepEqual(validate(JSON.parse(JSON.stringify(data))),data);
    assert.match(connectionError(data,'split','n4',0,outputs),/коннектор/);
    assert.match(connectionError(data,'n2','split',0),/совпадать/);
    assert.ok(!removeItem(data,'material','iron').nodes.some(n=>n.id==='split'));
    assert.deepEqual(validate(removeItem(data,'material','iron')),removeItem(data,'material','iron'));
  }
});
test('splitter cycles and invalid splitter data are rejected', () => {
  const data=demo();data.edges=[];
  data.nodes.push({id:'a',type:'splitter',material:'iron',outputs:2,x:0,y:0},{id:'b',type:'splitter',material:'iron',outputs:3,x:300,y:0});
  data.edges.push({id:'ab',from:'a',to:'b',input:0,output:1});
  assert.match(connectionError(data,'b','a',0,2),/цикл/);
  for (const change of [d=>d.nodes.at(-1).outputs=4,d=>d.nodes.at(-1).material='missing',d=>d.edges[0].output=-1,d=>d.edges[0].output=2]) {
    const copy=structuredClone(data);change(copy);assert.throws(()=>validate(copy));
  }
});
test('deleting a recipe removes its instances and edges but keeps materials and other nodes', () => {
  const data = demo();
  data.nodes.push({ id: 'extra', recipe: 'smelt', x: 0, y: 0 });
  const next = removeItem(data, 'recipe', 'smelt');
  assert.equal(next.nodes.length, 3);
  assert.equal(next.edges.length, 2);
  assert.deepEqual(next.materials, data.materials);
  assert.ok(next.nodes.some(n => n.id === 'n4'));
  assert.deepEqual(validate(next), next);
  assert.equal(data.nodes.length, 5);
});
test('deleting a material removes recipes using it as input or output and keeps unrelated content', () => {
  const data = demo();
  const plan = deletionPlan(data, 'material', 'iron');
  assert.deepEqual(plan.recipes.map(r => r.id), ['smelt', 'forge', 'nails']);
  assert.equal(plan.nodes.length, 2);
  assert.equal(plan.edges.length, 2);
  const next = removeItem(data, 'material', 'iron');
  assert.equal(next.materials.length, data.materials.length - 1);
  assert.deepEqual(next.nodes.map(n => n.id), ['n2', 'n3']);
  assert.deepEqual(next.edges.map(e => e.id), ['e2']);
  assert.deepEqual(validate(next), next);
});
test('deleting an unused material leaves graph and recipes intact', () => {
  const data = demo();
  data.materials.push({ id: 'unused', name: 'Unused', icon: '◇' });
  assert.deepEqual(removeItem(data, 'material', 'unused'), demo());
  assert.deepEqual(removeItem(data, 'recipe', 'missing'), data);
});
test('mismatched material and occupied input are rejected', () => {
  const data = demo();
  assert.match(connectionError(data, 'n2', 'n4', 0), /совпадать/);
  assert.match(connectionError(data, 'n1', 'n4', 0), /занят/);
  assert.match(connectionError(data, 'n1', 'n1', 0), /самой/);
  data.edges = []; assert.equal(connectionError(data, 'n1', 'n4', 0), '');
});
test('a matching-material cycle is rejected', () => {
  const data = {materials:[], recipes:[{id:'a',output:'x',inputs:['y']},{id:'b',output:'y',inputs:['x']}],nodes:[{id:'a',recipe:'a'},{id:'b',recipe:'b'}],edges:[{from:'a',to:'b',input:0}]};
  assert.match(connectionError(data,'b','a',0), /цикл/);
});
test('broken references, duplicate IDs, unsafe icons and nonfinite positions fail validation', () => {
  for (const mutate of [d=>d.nodes[0].recipe='missing',d=>d.materials[0].id=d.materials[1].id,d=>d.materials[0].icon='https://example.com/tracker.png',d=>d.nodes[0].x=Infinity,d=>d.edges[0].to='missing',d=>d.recipes[0].inputs.push('wood'),d=>d.version=2]) {
    const data=demo();mutate(data);assert.throws(()=>validate(data));
  }
});
