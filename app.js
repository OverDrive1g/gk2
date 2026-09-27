'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
const storageKey = 'underground-workshop-v1';
let state = CraftCore.validate(globalThis.DEFAULT_WORKSHOP), selected = null, pending = null, gesture = null, view = {x:0,y:0,scale:1}, modalMode = '', editId = null, draftIcon = '', toastTimer;
try { const saved = localStorage.getItem(storageKey); if (saved) state = CraftCore.validate(JSON.parse(saved)); } catch { setTimeout(() => toast('Сохранение не удалось прочитать. Загружено стартовое дерево.'), 300); }
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000); }
function save() { try { localStorage.setItem(storageKey, JSON.stringify(state)); $('#save-status').textContent = '● Сохранено локально'; } catch { $('#save-status').textContent = '● Не сохранено'; toast('Хранилище браузера недоступно или заполнено. Экспортируйте JSON.'); } }
const material = id => state.materials.find(m => m.id === id);
const recipe = id => state.recipes.find(r => r.id === id);
function icon(m, small = false) { return `<span class="item-icon${small ? ' small' : ''}">${m.icon.startsWith('data:image/') ? `<img src="${esc(m.icon)}" alt="">` : esc(m.icon || '◇')}</span>`; }
function selectedNodeIds() { return selected?.type === 'nodes' ? selected.ids : selected?.type === 'node' ? [selected.id] : []; }
function updateSelection() { const ids=new Set(selectedNodeIds());document.querySelectorAll('.node').forEach(n=>n.classList.toggle('selected',ids.has(n.dataset.node)));drawWires(); }
function renderCatalog() {
  const query = $('#search').value.trim().toLocaleLowerCase('ru');
  $('#recipe-count').textContent = state.recipes.length; $('#material-count').textContent = state.materials.length;
  $('#recipes').innerHTML = state.recipes.filter(r => [r.output,...r.inputs].some(id => material(id).name.toLocaleLowerCase('ru').includes(query))).map(r => `<div class="recipe-card" draggable="true" data-recipe="${esc(r.id)}" tabindex="0" title="Перетащите на поле или нажмите Enter"><button class="card-edit" data-edit-recipe="${esc(r.id)}" aria-label="Изменить рецепт ${esc(material(r.output).name)}">⋯</button>${icon(material(r.output))}<div class="recipe-info"><strong>${esc(material(r.output).name)} <span class="quantity">×${r.outputQuantity ?? 1}</span></strong><div class="ingredients">${r.inputs.map((id,i) => `<span class="ingredient">${icon(material(id), true)}${esc(material(id).name)} <span class="quantity">×${r.inputQuantities?.[i] ?? 1}</span></span>`).join('')}</div></div></div>`).join('') || '<div class="no-results">Рецептов пока нет</div>';
  $('#materials').innerHTML = state.materials.filter(m => m.name.toLocaleLowerCase('ru').includes(query)).map(m => `<button class="material-row" data-material="${esc(m.id)}" title="Изменить: ${esc(m.name)}">${icon(m,true)}<span>${esc(m.name)}</span></button>`).join('') || '<div class="no-results">Материалов пока нет</div>';
}
function renderNodes() {
  const selectedIds=new Set(selectedNodeIds());
  $('#nodes').innerHTML = state.nodes.map(n => {
    const ports = CraftCore.nodePorts(state,n), splitter = n.type === 'splitter', producer = n.type === 'producer', terminator = n.type === 'terminator';
    const m = terminator ? {name:'Любой материал',icon:'◎'} : material(ports.outputs[0]);
    const quantities = splitter || producer || terminator ? null : CraftCore.recipeQuantities(recipe(n.recipe));
    function rows(ids,kind) {
      const indices=ids.map((_,i)=>i);if(kind==='in'&&n.inputsReversed)indices.reverse();
      return indices.map(i => {
        const id=ids[i], item = id === null ? {name:'Любой материал',icon:'◎'} : material(id);
        const label = (kind==='out'?'Выход':'Вход')+' '+(i+1)+': '+item.name;
        const suffix = quantities ? ' <span class="quantity">×'+(kind==='out'?quantities.outputQuantity:quantities.inputQuantities[i])+'</span>' : splitter && kind==='out' ? ' · '+(i+1) : '';
        return '<div class="port-row'+(kind==='out'?' output':'')+'"><button class="port'+(kind==='out'?' out':'')+'" data-node="'+esc(n.id)+'" data-kind="'+kind+'" data-input="'+i+'" title="'+esc(label)+'" aria-label="'+esc(label)+'"></button>'+icon(item,true)+'<span>'+esc(item.name)+suffix+'</span></div>';
      }).join('');
    }
    const title = splitter ? 'Сплиттер 1 → '+n.outputs : producer ? 'Продьюсер' : terminator ? 'Терминатор' : m.name;
    const subtitle = splitter ? 'РАЗВЕТВЛЕНИЕ МАТЕРИАЛА' : producer ? 'ИСТОЧНИК МАТЕРИАЛА' : terminator ? 'УНИВЕРСАЛЬНЫЙ ПРИЁМНИК' : 'РЕЦЕПТ КРАФТА';
    const swap = ports.inputs.length > 1 ? '<button type="button" class="swap-inputs" data-swap-inputs="'+esc(n.id)+'" title="Поменять входы местами" aria-label="Поменять входы местами">⇅</button>' : '';
    return '<article class="node'+(selectedIds.has(n.id)?' selected':'')+'" data-node="'+esc(n.id)+'" style="left:'+n.x+'px;top:'+n.y+'px"><div class="node-header">'+icon(m)+'<div><div class="node-title">'+esc(title)+'</div><div class="node-subtitle">'+subtitle+'</div></div>'+swap+'</div><div class="node-body">'+rows(ports.inputs,'in')+rows(ports.outputs,'out')+'</div></article>';
  }).join('');
  $('#graph-count').textContent = `${state.nodes.length} нод · ${state.edges.length} связей`; $('#empty').hidden = state.nodes.length > 0;drawWires();
}
function render() { renderCatalog(); renderNodes(); }
function worldPoint(clientX, clientY) { const rect = $('#canvas').getBoundingClientRect(); return {x:(clientX-rect.left-view.x)/view.scale,y:(clientY-rect.top-view.y)/view.scale}; }
function portPoint(id, kind, input = 0) { const el = [...document.querySelectorAll('.port')].find(p => p.dataset.node === id && p.dataset.kind === kind && +p.dataset.input === input); if (!el) return {x:0,y:0}; const b = el.getBoundingClientRect(); return worldPoint(b.left+b.width/2,b.top+b.height/2); }
function curve(a,b) { const d = Math.max(65,Math.abs(b.x-a.x)*.45); return `M ${a.x} ${a.y} C ${a.x+d} ${a.y}, ${b.x-d} ${b.y}, ${b.x} ${b.y}`; }
function drawWires(preview) { $('#wires').innerHTML = state.edges.map(e => `<path class="wire${selected?.type==='edge' && selected.id === e.id ? ' selected' : ''}" data-edge="${esc(e.id)}" d="${curve(portPoint(e.from,'out',e.output ?? 0),portPoint(e.to,'in',e.input))}"/>`).join(''); if (pending && preview) { const a = portPoint(pending.node,pending.kind,pending.input); $('#wires').innerHTML += `<path class="wire preview" d="${pending.kind === 'out' ? curve(a,preview) : curve(preview,a)}"/>`; } }
function applyView() { $('#world').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`; $('#zoom-value').textContent = Math.round(view.scale*100)+'%'; $('#canvas').style.backgroundSize = `${22*view.scale}px ${22*view.scale}px`; $('#canvas').style.backgroundPosition = `${view.x}px ${view.y}px`; }
function zoom(factor, cx, cy) { if(gesture)return;const rect = $('#canvas').getBoundingClientRect(); cx ??= rect.left+rect.width/2; cy ??= rect.top+rect.height/2; const p = worldPoint(cx,cy); view.scale = Math.max(.25,Math.min(2,view.scale*factor)); view.x = cx-rect.left-p.x*view.scale; view.y = cy-rect.top-p.y*view.scale; applyView(); }
function fit() { if (!state.nodes.length) {view={x:0,y:0,scale:1};applyView();return;} const minX=Math.min(...state.nodes.map(n=>n.x)), minY=Math.min(...state.nodes.map(n=>n.y)), maxX=Math.max(...state.nodes.map(n=>n.x+236)), maxY=Math.max(...state.nodes.map(n=>n.y+(n.type==='splitter' && n.outputs===3 ? 300 : 245))); const b=$('#canvas').getBoundingClientRect();view.scale=Math.max(.25,Math.min(1,(b.width-90)/(maxX-minX),(b.height-115)/(maxY-minY)));view.x=(b.width-(maxX-minX)*view.scale)/2-minX*view.scale;view.y=(b.height-(maxY-minY)*view.scale)/2-minY*view.scale;applyView();drawWires(); }
function addNode(id,p) { if(!recipe(id))return; const n={id:uid(),recipe:id,x:p.x,y:p.y};state.nodes.push(n);selected={type:'node',id:n.id};renderNodes();save(); }
$('#search').addEventListener('input',renderCatalog);
$('#recipes').addEventListener('dragstart',e=>{const card=e.target.closest('[data-recipe]');if(card){e.dataTransfer.setData('text/plain',card.dataset.recipe);e.dataTransfer.effectAllowed='copy';}});
$('#recipes').addEventListener('keydown',e=>{if(e.key==='Enter' && e.target.matches('.recipe-card')){const b=$('#canvas').getBoundingClientRect();addNode(e.target.dataset.recipe,worldPoint(b.left+b.width/2-118,b.top+b.height/2-100));}});
$('#recipes').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-recipe]');if(edit)openRecipe(edit.dataset.editRecipe);});
$('#materials').addEventListener('click',e=>{const row=e.target.closest('[data-material]');if(row)openMaterial(row.dataset.material);});
const canvas=$('#canvas');
canvas.addEventListener('click',e=>{const button=e.target.closest('[data-swap-inputs]');if(!button)return;const node=state.nodes.find(n=>n.id===button.dataset.swapInputs);if(!node||CraftCore.nodePorts(state,node).inputs.length<2)return;node.inputsReversed=!node.inputsReversed;selected={type:'node',id:node.id};clearPending();renderNodes();save();});
canvas.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';canvas.classList.add('dragover');});
canvas.addEventListener('dragleave',()=>canvas.classList.remove('dragover'));
canvas.addEventListener('drop',e=>{e.preventDefault();canvas.classList.remove('dragover');const p=worldPoint(e.clientX,e.clientY);addNode(e.dataTransfer.getData('text/plain'),{x:p.x-118,y:p.y-35});});
function clearPending(){pending=null;document.querySelectorAll('.port.pending').forEach(p=>p.classList.remove('pending'));drawWires();}
function connectPort(port){const target={node:port.dataset.node,kind:port.dataset.kind,input:+port.dataset.input};if(!pending){pending=target;port.classList.add('pending');toast('Выберите совместимый коннектор: тот же материал или вход терминатора.');return;}if(pending.node===target.node&&pending.kind===target.kind){clearPending();return;}if(pending.kind===target.kind){toast('Соедините выход с входом.');return;}const from=pending.kind==='out'?pending:target,to=pending.kind==='in'?pending:target;const error=CraftCore.connectionError(state,from.node,to.node,to.input,from.input);if(error){toast(error);return;}state.edges.push({id:uid(),from:from.node,to:to.node,input:to.input,output:from.input});clearPending();renderNodes();save();}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0||gesture||e.target.closest('.zoom-controls, [data-swap-inputs]'))return;
  canvas.focus();const port=e.target.closest('.port');if(port){e.preventDefault();connectPort(port);return;}
  const edge=e.target.closest('[data-edge]');if(edge){selected={type:'edge',id:edge.dataset.edge};updateSelection();return;}
  const element=e.target.closest('.node');
  if(element){
    const id=element.dataset.node,ids=new Set(selectedNodeIds());
    if(e.shiftKey){if(ids.has(id))ids.delete(id);else ids.add(id);selected=ids.size?{type:'nodes',ids:[...ids]}:null;updateSelection();return;}
    if(!ids.has(id))selected={type:'node',id};updateSelection();
    if(!e.target.closest('.node-header'))return;
    const selectedIds=new Set(selectedNodeIds());
    gesture={type:'nodes',starts:state.nodes.filter(n=>selectedIds.has(n.id)).map(n=>({id:n.id,x:n.x,y:n.y})),startX:e.clientX,startY:e.clientY,scale:view.scale};
  }else{selected=null;updateSelection();gesture={type:'pan',startX:e.clientX,startY:e.clientY,x:view.x,y:view.y};}
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(gesture){const dx=e.clientX-gesture.startX,dy=e.clientY-gesture.startY;
    if(gesture.type==='nodes'){
      CraftCore.moveNodes(state,gesture.starts,dx/gesture.scale,dy/gesture.scale);
      const positions=new Map(state.nodes.map(n=>[n.id,n]));
      for(const el of document.querySelectorAll('.node')){const n=positions.get(el.dataset.node);el.style.left=n.x+'px';el.style.top=n.y+'px';}drawWires();
    }else{view.x=gesture.x+dx;view.y=gesture.y+dy;applyView();}
  }else if(pending)drawWires(worldPoint(e.clientX,e.clientY));
});
function endGesture(){if(gesture?.type==='nodes')save();gesture=null;}
canvas.addEventListener('pointerup',endGesture);canvas.addEventListener('pointercancel',endGesture);canvas.addEventListener('lostpointercapture',endGesture);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1,e.clientX,e.clientY);},{passive:false});
$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);$('#fit').onclick=()=>{if(!gesture)fit();};
document.addEventListener('keydown',e=>{
  if($('#modal').open||e.target.matches('input,select,textarea')||gesture)return;
  if(e.key==='Escape'){clearPending();selected=null;updateSelection();}
  if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();
    if(selected.type==='node'||selected.type==='nodes'){const ids=new Set(selectedNodeIds());state.nodes=state.nodes.filter(n=>!ids.has(n.id));state.edges=state.edges.filter(edge=>!ids.has(edge.from)&&!ids.has(edge.to));}
    else state.edges=state.edges.filter(edge=>edge.id!==selected.id);
    selected=null;clearPending();renderNodes();save();
  }
});

$('#clear').onclick=()=>{if(state.nodes.length&&confirm('Удалить все ноды и связи? Материалы и рецепты останутся.')){state.nodes=[];state.edges=[];selected=null;clearPending();renderNodes();save();}};
function options(value,optional=false){return (optional?'<option value="">Не требуется</option>':'<option value="" disabled selected>Выберите материал</option>')+state.materials.map(m=>`<option value="${esc(m.id)}" ${m.id===value?'selected':''}>${esc(m.name)}</option>`).join('');}
function uploadMarkup(){return `<div class="upload-area"><div id="icon-preview"></div><div><button type="button" id="pick-icon">↥ Загрузить иконку</button> <button type="button" id="paste-icon">Вставить</button></div><p>PNG, JPG, WebP, GIF · до 5 МБ<br>Также можно вставить изображение через Ctrl+V</p><input type="file" id="icon-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></div>`;}
const deleteItemButton = document.createElement('button');
deleteItemButton.type = 'button';
deleteItemButton.className = 'danger';
deleteItemButton.style.marginRight = 'auto';
deleteItemButton.hidden = true;
$('.modal-actions').prepend(deleteItemButton);
function initModal(title){$('#modal-title').textContent=title;$('#form-error').textContent='';$('#modal-form button[type="submit"]').hidden=false;deleteItemButton.hidden=!editId||!['material','recipe'].includes(modalMode);deleteItemButton.textContent=modalMode==='material'?'Удалить материал':'Удалить рецепт';enhanceMaterialSelectors();$('#modal').showModal();}
function enhanceMaterialSelectors() {
  $('#modal-body').querySelectorAll('select').forEach(select => {
    const required = select.required;
    const choices = [...select.options].filter(option => !option.disabled).map(option => ({value:option.value, label:option.textContent}));
    const wrapper = document.createElement('div'); wrapper.className = 'searchable-select';
    const input = document.createElement('input');
    input.type = 'text'; input.autocomplete = 'off'; input.placeholder = 'Поиск по части названия…';
    input.setAttribute('role','combobox'); input.setAttribute('aria-autocomplete','list'); input.setAttribute('aria-expanded','false');
    input.setAttribute('aria-label',select.closest('label').childNodes[0].textContent.trim());
    const list = document.createElement('div'); list.className = 'select-results'; list.id = select.id+'-results'; list.setAttribute('role','listbox'); list.hidden = true;
    input.setAttribute('aria-controls',list.id);
    select.before(wrapper); wrapper.append(input,list); select.hidden=true; select.required=false;
    let visible = [], active = -1;
    function restore() {
      input.value = choices.find(option => option.value === select.value)?.label || '';
      input.setCustomValidity(required && !select.value ? 'Выберите материал из списка.' : '');
    }
    function close() { list.hidden=true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); restore(); }
    function highlight() {
      [...list.children].forEach((el,i) => {el.classList.toggle('active',i===active);el.setAttribute('aria-selected',String(i===active));});
      if (active>=0) { input.setAttribute('aria-activedescendant',list.children[active].id); list.children[active].scrollIntoView({block:'nearest'}); }
      else input.removeAttribute('aria-activedescendant');
    }
    function show(query='') {
      visible=choices.filter(option=>!option.value || option.label.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
      active=-1; list.replaceChildren();
      visible.forEach((option,i)=>{const row=document.createElement('div');row.id=list.id+'-'+i;row.setAttribute('role','option');row.className='select-option';row.textContent=option.label;row.addEventListener('pointerdown',e=>e.preventDefault());row.addEventListener('click',e=>{e.preventDefault();choose(i);});list.append(row);});
      if(!visible.length){const empty=document.createElement('div');empty.className='select-empty';empty.textContent='Материалы не найдены';list.append(empty);}
      list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
    }
    function choose(index) { if(!visible[index])return;select.value=visible[index].value;select.dispatchEvent(new Event('change',{bubbles:true}));close(); }
    input.addEventListener('focus',()=>{show();input.select();});
    input.addEventListener('click',()=>{if(list.hidden)show();});
    input.addEventListener('input',()=>{input.setCustomValidity('Выберите материал из списка.');show(input.value);});
    input.addEventListener('blur',close);
    input.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!list.hidden){e.preventDefault();e.stopPropagation();close();}
      else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)show();if(visible.length){active=(active+(e.key==='ArrowDown'?1:-1)+visible.length)%visible.length;highlight();}}
      else if(e.key==='Enter'&&!list.hidden){e.preventDefault();if(active>=0)choose(active);else if(visible.length===1)choose(0);}
      else if(e.key==='Tab')close();
    });
    restore();
  });
}
deleteItemButton.onclick = () => {
  if (!editId || !['material', 'recipe'].includes(modalMode)) return;
  const plan = CraftCore.deletionPlan(state, modalMode, editId);
  const name = modalMode === 'material' ? material(editId).name : material(recipe(editId).output).name;
  const details = [];
  if (modalMode === 'material' && plan.recipes.length) details.push('Рецепты с этим материалом: ' + plan.recipes.map(r => material(r.output).name).join(', ') + '.');
  if (plan.nodes.length) details.push(`Затронутые ноды (включая сплиттеры и продьюсеры): ${plan.nodes.length}. Соединения: ${plan.edges.length}.`);
  if (!confirm(`Удалить ${modalMode === 'material' ? 'материал' : 'рецепт'} «${name}»?${details.length ? '\n\nТакже будут удалены:\n' + details.join('\n') : ''}`)) return;
  state = CraftCore.removeItem(state, modalMode, editId);
  selected = null;
  clearPending();
  $('#modal').close();
  render();
  save();
  toast(modalMode === 'material' ? 'Материал удалён.' : 'Рецепт удалён.');
};
function openMaterial(id=null){modalMode='material';editId=id;const m=id?material(id):null;draftIcon=m?.icon||'◇';$('#modal-body').innerHTML=`<label class="field">Название материала<input id="material-name" maxlength="100" required placeholder="Например, медная руда" value="${esc(m?.name||'')}"></label>${uploadMarkup()}<p class="form-note">Материал появится в списке и станет доступен для рецептов.</p>`;initModal(id?'Изменить материал':'Новый материал');bindUpload();$('#material-name').focus();}
function quantityField(id, label, value) {
  return '<label class="field quantity-field">'+label+'<input id="'+id+'" type="number" min="1" max="9007199254740991" step="1" required value="'+value+'"></label>';
}
function openRecipe(id=null) {
  if(!state.materials.length){toast('Сначала добавьте материалы.');openMaterial();return;}
  modalMode='recipe';editId=id;const r=id?recipe(id):null;draftIcon='';
  $('#modal-body').innerHTML = '<div class="recipe-material-fields"><label class="field">Результат крафта<select id="output-material" required>'+options(r?.output)+'</select></label>'+quantityField('output-quantity','Количество',r?.outputQuantity ?? 1)+'</div>'
    +'<div class="recipe-material-fields"><label class="field">Входящий материал 1<select id="input-one" required>'+options(r?.inputs[0])+'</select></label>'+quantityField('input-one-quantity','Количество',r?.inputQuantities?.[0] ?? 1)+'</div>'
    +'<div class="recipe-material-fields"><label class="field">Входящий материал 2 <span class="form-note">· необязательно</span><select id="input-two">'+options(r?.inputs[1],true)+'</select></label>'+quantityField('input-two-quantity','Количество',r?.inputQuantities?.[1] ?? 1)+'</div>'
    +'<p class="form-note">Количество единиц за один крафт. Только целые числа от 1.</p>'+uploadMarkup()+'<p class="form-note">Иконка относится к материалу результата и обновится во всём каталоге.</p>';
  initModal(id?'Изменить рецепт':'Новый рецепт');bindUpload();
  $('#output-material').onchange=()=>{draftIcon='';updatePreview();};
  const updateSecondQuantity=()=>{const active=Boolean($('#input-two').value);$('#input-two-quantity').disabled=!active;$('#input-two-quantity').required=active;};
  $('#input-two').onchange=updateSecondQuantity;updateSecondQuantity();
}
function updatePreview(){const m=modalMode==='recipe'?material($('#output-material').value):null;$('#icon-preview').innerHTML=icon({icon:draftIcon||m?.icon||'◇'});}
async function loadIcon(file){if(!file||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('Выберите изображение PNG, JPG, WebP или GIF.');if(file.size>5*1024*1024)throw Error('Размер файла не должен превышать 5 МБ.');const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');const scale=Math.min(1,128/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);draftIcon=c.toDataURL('image/png');updatePreview();}finally{URL.revokeObjectURL(url);}}
function bindUpload(){updatePreview();$('#pick-icon').onclick=()=>$('#icon-file').click();$('#icon-file').onchange=async e=>{try{await loadIcon(e.target.files[0]);}catch(err){$('#form-error').textContent=err.message;}};$('#paste-icon').onclick=async()=>{try{if(!navigator.clipboard?.read)throw Error();const items=await navigator.clipboard.read();const item=items.find(i=>i.types.some(t=>t.startsWith('image/')));if(!item){$('#form-error').textContent='В буфере нет изображения.';return;}await loadIcon(await item.getType(item.types.find(t=>t.startsWith('image/'))));}catch{$('#form-error').textContent='Нажмите Ctrl+V в этом окне или загрузите файл.';}};}
document.addEventListener('paste',async e=>{if(!$('#modal').open||!['recipe','material'].includes(modalMode))return;const item=[...e.clipboardData.items].find(i=>i.type.startsWith('image/'));if(item){e.preventDefault();try{await loadIcon(item.getAsFile());}catch(err){$('#form-error').textContent=err.message;}}});
$('#modal-form').onsubmit=e=>{e.preventDefault();if(modalMode==='producer'){const materialId=$('#producer-material').value;if(!material(materialId))return;addUtilityNode('producer',utilityPosition,materialId);}else if(modalMode==='splitter'){const materialId=$('#splitter-material').value;if(!material(materialId))return;const b=canvas.getBoundingClientRect(),p=worldPoint(b.left+b.width/2,b.top+b.height/2);const n={id:uid(),type:'splitter',material:materialId,outputs:splitterOutputs,x:splitterPosition?.x ?? p.x-118,y:splitterPosition?.y ?? p.y-120};state.nodes.push(n);selected={type:'node',id:n.id};}else if(modalMode==='material'){const name=$('#material-name').value.trim();if(!name){$('#form-error').textContent='Введите название материала.';return;}if(state.materials.some(m=>m.id!==editId&&m.name.toLocaleLowerCase()===name.toLocaleLowerCase())){$('#form-error').textContent='Материал с таким названием уже существует.';return;}if(editId)Object.assign(material(editId),{name,icon:draftIcon});else state.materials.push({id:uid(),name,icon:draftIcon});}else if(modalMode==='recipe'){const output=$('#output-material').value,inputs=[$('#input-one').value,$('#input-two').value].filter(Boolean);if(!output||!inputs.length||inputs.includes(output)||new Set(inputs).size!==inputs.length){$('#form-error').textContent='Выберите результат и один или два разных входящих материала. Результат не может быть входом.';return;}const outputQuantity=Number($('#output-quantity').value),inputQuantities=[$('#input-one-quantity'),...($('#input-two').value?[$('#input-two-quantity')]:[])].map(el=>Number(el.value));if(![outputQuantity,...inputQuantities].every(CraftCore.validQuantity)){$('#form-error').textContent='Количество должно быть целым числом от 1 до 9007199254740991.';return;}if(editId){Object.assign(recipe(editId),{output,inputs,outputQuantity,inputQuantities});const old=state.edges;state.edges=[];for(const edge of old)if(!CraftCore.connectionError(state,edge.from,edge.to,edge.input,edge.output))state.edges.push(edge);if(old.length!==state.edges.length)toast('Несовместимые связи изменённого рецепта удалены.');}else state.recipes.push({id:uid(),output,inputs,outputQuantity,inputQuantities});if(draftIcon)material(output).icon=draftIcon;}$('#modal').close();clearPending();render();save();};
$('#add-material').onclick=()=>openMaterial();$('#add-recipe').onclick=()=>openRecipe();$('#close-modal').onclick=$('#cancel-modal').onclick=()=>$('#modal').close();
$('#help-button').onclick=()=>{modalMode='help';$('#modal-body').innerHTML='<p class="form-note">1. Добавьте материалы и их иконки.<br><br>2. Создайте рецепт: один результат и до двух входящих материалов.<br><br>3. Перетащите рецепт на поле. Также можно выбрать его клавишей Tab и нажать Enter.<br><br>4. Нажмите на кружок выхода справа, затем на кружок подходящего входа слева. Материалы должны совпадать.<br><br>5. Перетаскивайте ноды за заголовок, а поле — за свободное место. Колесо изменяет масштаб.<br><br>6. Выделите ноду или линию и нажмите Delete для удаления. Esc отменяет создание связи.<br><br>Изменение материала: нажмите на него в каталоге. Изменение рецепта: кнопка «⋯».<br><br>Все изменения сохраняются в этом браузере. Экспорт JSON сохраняет материалы, иконки, рецепты, ноды и связи в одном файле.</p>';initModal('Как пользоваться');$('#modal-form button[type="submit"]').hidden=true;};
$('#export-button').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='workshop-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Дерево экспортировано в JSON.');};
$('#import-button').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('JSON-файл не должен превышать 20 МБ.');const next=CraftCore.validate(JSON.parse(await file.text()));if(!confirm('Заменить текущую мастерскую данными из файла? Сначала экспортируйте текущую, если хотите сохранить её.'))return;state=next;selected=null;pending=null;render();fit();save();toast('Мастерская загружена.');}catch(err){toast(err instanceof SyntaxError?'Файл не содержит корректный JSON.':err.message);}finally{e.target.value='';}};
render();requestAnimationFrame(fit);window.addEventListener('resize',()=>{applyView();drawWires();});

let splitterOutputs = 2, splitterPosition = null;
const splitterTools = document.createElement('div');
splitterTools.className = 'splitter-tools';
splitterTools.innerHTML = '<span class="section-hint">Сплиттеры</span><div><button type="button" data-splitter="2" draggable="true" title="Добавить или перетащить сплиттер на 2 выхода">⑂ 1 → 2</button><button type="button" data-splitter="3" draggable="true" title="Добавить или перетащить сплиттер на 3 выхода">⑂ 1 → 3</button></div>';
$('.recipes-section').append(splitterTools);
function openSplitter(outputs,position=null) {
  if (!state.materials.length) { toast('Сначала добавьте материал для сплиттера.'); return; }
  splitterOutputs=outputs;splitterPosition=position;modalMode='splitter';editId=null;
  $('#modal-body').innerHTML='<label class="field">Материал<select id="splitter-material" required>'+options()+'</select></label><p class="form-note">Один вход и '+outputs+' выхода с выбранным материалом.</p>';
  initModal('Сплиттер 1 → '+outputs);
}
splitterTools.addEventListener('click',e=>{const button=e.target.closest('[data-splitter]');if(button)openSplitter(+button.dataset.splitter);});
splitterTools.addEventListener('dragstart',e=>{const button=e.target.closest('[data-splitter]');if(button){e.dataTransfer.setData('application/x-workshop-splitter',button.dataset.splitter);e.dataTransfer.effectAllowed='copy';}});
canvas.addEventListener('drop',e=>{const outputs=+e.dataTransfer.getData('application/x-workshop-splitter');if([2,3].includes(outputs)){const p=worldPoint(e.clientX,e.clientY);openSplitter(outputs,{x:p.x-118,y:p.y-35});}});

let addShortcutUntil = 0;
document.addEventListener('keydown', e => {
  if (e.repeat || e.isComposing) return;
  if ($('#modal').open || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.target.closest('input,textarea,select,[contenteditable="true"],[role="combobox"]')) { addShortcutUntil=0; return; }
  const now=performance.now();
  if (e.code==='KeyA') {addShortcutUntil=now+1500;return;}
  const armed=now<=addShortcutUntil;addShortcutUntil=0;
  if(armed && (e.code==='KeyM'||e.code==='KeyR')) {e.preventDefault();clearPending();if(e.code==='KeyM')openMaterial();else openRecipe();}
});
window.addEventListener('blur',()=>{addShortcutUntil=0;});
$('#add-material').title='Добавить материал (A → M)';
$('#add-recipe').title='Добавить рецепт (A → R)';

let utilityPosition = null;
const utilityButtons = document.createElement('div');
utilityButtons.className = 'utility-buttons';
utilityButtons.innerHTML = '<button type="button" draggable="true" data-utility="producer" title="Добавить или перетащить источник материала">↗ Продьюсер</button><button type="button" draggable="true" data-utility="terminator" title="Добавить или перетащить приёмник любого материала">◎ Терминатор</button>';
splitterTools.append(utilityButtons);
splitterTools.querySelector('.section-hint').textContent = 'Дополнительные ноды';
function addUtilityNode(type, position = null, materialId) {
  const b=canvas.getBoundingClientRect(), center=worldPoint(b.left+b.width/2,b.top+b.height/2);
  const n={id:uid(),type,x:position?.x ?? center.x-118,y:position?.y ?? center.y-70};
  if(type==='producer')n.material=materialId;
  state.nodes.push(n);selected={type:'node',id:n.id};clearPending();renderNodes();save();
}
function openUtility(type,position=null) {
  if(type==='terminator'){addUtilityNode(type,position);return;}
  if(!state.materials.length){toast('Сначала добавьте материал для продьюсера.');return;}
  utilityPosition=position;modalMode='producer';editId=null;
  $('#modal-body').innerHTML='<label class="field">Выходящий материал<select id="producer-material" required>'+options()+'</select></label><p class="form-note">Источник с одним выходом, без входящих коннекторов.</p>';
  initModal('Новый продьюсер');
}
utilityButtons.addEventListener('click',e=>{const button=e.target.closest('[data-utility]');if(button)openUtility(button.dataset.utility);});
utilityButtons.addEventListener('dragstart',e=>{const button=e.target.closest('[data-utility]');if(button){e.dataTransfer.setData('application/x-workshop-utility',button.dataset.utility);e.dataTransfer.effectAllowed='copy';}});
canvas.addEventListener('drop',e=>{const type=e.dataTransfer.getData('application/x-workshop-utility');if(['producer','terminator'].includes(type)){const p=worldPoint(e.clientX,e.clientY);openUtility(type,{x:p.x-118,y:p.y-35});}});
