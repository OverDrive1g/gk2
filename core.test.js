const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, demo, connectionError } = require('./core.js');
test('JSON round trip preserves materials, icons and graph', () => {
  const data = demo(); assert.deepEqual(validate(JSON.parse(JSON.stringify(data))), data);
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
