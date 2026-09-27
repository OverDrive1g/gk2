const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, demo, connectionError, deletionPlan, removeItem } = require('./core.js');
test('JSON round trip preserves materials, icons and graph', () => {
  const data = demo(); assert.deepEqual(validate(JSON.parse(JSON.stringify(data))), data);
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
