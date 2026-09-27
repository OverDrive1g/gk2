(function (root) {
  'use strict';
  function connectionError(state, from, to, input) {
    const a = state.nodes.find(n => n.id === from), b = state.nodes.find(n => n.id === to);
    if (!a || !b || from === to) return 'Нельзя соединить ноду с самой собой.';
    const ar = state.recipes.find(r => r.id === a.recipe), br = state.recipes.find(r => r.id === b.recipe);
    if (!Number.isInteger(input) || ar.output !== br.inputs[input]) return 'Материалы входа и выхода должны совпадать.';
    if (state.edges.some(e => e.to === to && e.input === input)) return 'Этот вход уже занят. Сначала удалите соединение.';
    const seen = new Set(), stack = [to];
    while (stack.length) { const id = stack.pop(); if (id === from) return 'Соединение создаёт цикл в дереве.'; if (seen.has(id)) continue; seen.add(id); state.edges.filter(e => e.from === id).forEach(e => stack.push(e.to)); }
    return '';
  }
  function validate(data) {
    const fail = () => { throw new Error('Некорректный JSON мастерской: проверьте структуру и связи.'); };
    if (!data || data.version !== 1) fail();
    for (const key of ['materials', 'recipes', 'nodes', 'edges']) {
      if (!Array.isArray(data[key]) || data[key].length > 10000) fail();
      const ids = new Set();
      for (const item of data[key]) { if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)) fail(); ids.add(item.id); }
    }
    for (const m of data.materials) if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 100 || typeof m.icon !== 'string' || m.icon.length > 2000000 || !(m.icon.length <= 16 || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(m.icon))) fail();
    const materials = new Set(data.materials.map(m => m.id)), recipes = new Set(data.recipes.map(r => r.id));
    for (const r of data.recipes) if (!materials.has(r.output) || !Array.isArray(r.inputs) || r.inputs.length < 1 || r.inputs.length > 2 || r.inputs.some(i => !materials.has(i)) || new Set(r.inputs).size !== r.inputs.length || r.inputs.includes(r.output)) fail();
    for (const n of data.nodes) if (!recipes.has(n.recipe) || !Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x) > 1000000 || Math.abs(n.y) > 1000000) fail();
    const clean = { version: 1, materials: data.materials.map(({id,name,icon}) => ({id,name,icon})), recipes: data.recipes.map(({id,output,inputs}) => ({id,output,inputs:[...inputs]})), nodes: data.nodes.map(({id,recipe,x,y}) => ({id,recipe,x,y})), edges: [] };
    for (const e of data.edges) { if (connectionError(clean, e.from, e.to, e.input)) fail(); clean.edges.push({id:e.id,from:e.from,to:e.to,input:e.input}); }
    return clean;
  }
  function demo() {
    return {version:1,materials:[{id:'ore',name:'Железная руда',icon:'🪨'},{id:'coal',name:'Уголь',icon:'◈'},{id:'wood',name:'Древесина',icon:'🪵'},{id:'iron',name:'Железный слиток',icon:'▰'},{id:'plank',name:'Доски',icon:'🪵'},{id:'handle',name:'Рукоять',icon:'🦴'},{id:'pick',name:'Железная кирка',icon:'⛏️'},{id:'nail',name:'Гвозди',icon:'🔩'},{id:'chest',name:'Сундук',icon:'🧰'}],recipes:[{id:'smelt',output:'iron',inputs:['ore','coal']},{id:'saw',output:'plank',inputs:['wood']},{id:'grip',output:'handle',inputs:['plank']},{id:'forge',output:'pick',inputs:['iron','handle']},{id:'nails',output:'nail',inputs:['iron']},{id:'box',output:'chest',inputs:['plank','nail']}],nodes:[{id:'n1',recipe:'smelt',x:60,y:80},{id:'n2',recipe:'saw',x:60,y:355},{id:'n3',recipe:'grip',x:385,y:355},{id:'n4',recipe:'forge',x:710,y:135}],edges:[{id:'e1',from:'n1',to:'n4',input:0},{id:'e2',from:'n2',to:'n3',input:0},{id:'e3',from:'n3',to:'n4',input:1}]};
  }
  const api = { connectionError, validate, demo };
  if (typeof module !== 'undefined') module.exports = api; else root.CraftCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
