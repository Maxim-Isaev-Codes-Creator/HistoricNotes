import { openStore, listRecords, putRecord, deleteRecord, getMeta, setMeta } from './storage.js';
import { hasPassword, createPassword, unlock, lock, isUnlocked, encryptDocument, decryptDocument, encryptPrivate, decryptPrivate } from './security.js';
import { setupEditor, sanitizeHTML, format, searchText } from './editor.js';
import { loadSettings, saveSettings } from './settings.js';
import { compartments, initScene, showCabinet, focusCompartment, showDesk, applySceneSettings, setDrawerLabel, setDrawerDocuments, toggleInkLid, setInkLid, stampSeal, foldPaper, showWaxMark, closeDeskFolder, openDeskFolder, setFolderSheetCount, setRestQuillVisible, getInkwellScreenPosition, getDeskFolderScreenBounds, getDeskPaperScreenBounds } from './scene.js';
import { initPen, penEnter, penLeave, penInput, penTouch } from './pen.js';
import { configureSound, activateAudio, playSound, startAtmosphere, stopAtmosphere } from './sound.js';

const $ = selector => document.querySelector(selector);
const state = { documents: [], labels:{}, labelTarget:null,current: null, reading:null, readingPage:0, shelf: null, pageIndex:0, pageSwitching:false, folded:false, folderOpen:false, saveTimer: null, saveChain: Promise.resolve(), version: 0, savedVersion: 0, idleTimer: null, searchIndex: 0, settings: loadSettings(), view: 'cabinet' };
const editor = $('#editor');
const titleInput = $('#document-title');
function hasWrittenPaper(doc){return (doc.pages?.length?doc.pages:[doc.content||'']).some(page=>page.replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').trim().length>0);}

function status(message, error = false) { const node = $('#save-status'); node.textContent = message; node.classList.toggle('error', error); }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('visible'); clearTimeout(node.timer); node.timer = setTimeout(() => node.classList.remove('visible'), 3000); }
function view(name) {
  state.view = name;
  for (const section of document.querySelectorAll('.view')) section.classList.toggle('active', section.id === `${name}-view`);
  $('#write-button').classList.toggle('hidden',name==='desk'||name==='reading');
  $('#action-menu').classList.add('hidden');
  if(name==='desk'){showDesk();penLeave();setRestQuillVisible(true);startAtmosphere();playSound('paper_move');}
  else {penLeave();stopAtmosphere();state.folded=false;foldPaper(false);$('.editor-wrap').classList.remove('folded');if (name === 'cabinet') { state.shelf=null; showCabinet(); } else focusCompartment(state.shelf);}
}
function resetIdle() {
  if (!isUnlocked()) return;
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(async () => { await closeAndLock(); toast('Кабинет заперт после бездействия'); }, 10 * 60 * 1000);
}

function currentData() {
  const pages=[...(state.current.pages||[state.current.content||''])];pages[state.pageIndex]=sanitizeHTML(editor.innerHTML);
  return { ...state.current, title: titleInput.value.trim(), pages, content:pages.join(''), modifiedAt: new Date().toISOString() };
}
function dirty() {
  if (!state.current) return;
  state.version++;
  status('Не сохранено');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveCurrent(), 650);
}
async function saveCurrent() {
  if (!state.current || state.version === state.savedVersion) return state.saveChain;
  clearTimeout(state.saveTimer);
  const data = currentData(), version = state.version;
  status('Сохранение…');
  state.saveChain = state.saveChain.catch(() => {}).then(async () => {
    const record = await encryptDocument(data);
    if(hasWrittenPaper(data))await putRecord(record);else await deleteRecord(data.id);
    state.current = data;
    const index = state.documents.findIndex(doc => doc.id === data.id);
    if(hasWrittenPaper(data)){if(index===-1)state.documents.push(data);else state.documents[index]=data;}
    else if(index!==-1)state.documents.splice(index,1);
    state.savedVersion = Math.max(state.savedVersion, version);
    if (state.version === version) status('Сохранено');
    else { status('Сохранение…'); clearTimeout(state.saveTimer); state.saveTimer = setTimeout(() => saveCurrent(), 100); }
  }).catch(error => { status('Ошибка сохранения', true); toast(`Не удалось сохранить: ${error.message}`); throw error; });
  return state.saveChain;
}
async function flush() { if (state.current && state.version !== state.savedVersion) await saveCurrent(); else await state.saveChain; }
async function safeLeave(next) {
  try { await flush(); next(); }
  catch { toast('Останьтесь на странице и повторите сохранение'); }
}

function renderShelf() {
  const comp = compartments.find(item => item.id === state.shelf);
  $('#shelf-title').textContent = state.labels[comp.id] || '';
  const container = $('#documents'); container.replaceChildren();
  const docs = state.documents.filter(doc => doc.compartmentId === comp.id&&hasWrittenPaper(doc)).sort((a,b) => b.modifiedAt.localeCompare(a.modifiedAt));
  setDrawerDocuments(comp.id,docs);
  $('#shelf-subtitle').textContent = '';
  for (const doc of docs) {
    const button = document.createElement('button'); button.className = 'document-object'; button.type = 'button'; button.dataset.id = doc.id;
    const cover = document.createElement('span'); cover.className = 'document-cover';
    const ornament = document.createElement('span'); ornament.className = 'document-ornament'; ornament.textContent = '';
    const name = document.createElement('span'); name.className = 'document-name'; name.textContent = doc.title;
    const date = document.createElement('span'); date.className = 'document-date'; date.textContent = new Date(doc.modifiedAt).toLocaleDateString('ru-RU');
    cover.append(ornament, name, date); button.append(cover); container.append(button);
  }
}

function openShelf(id) { if(state.view==='shelf'&&state.shelf===id){view('cabinet');playSound('drawer');return;}state.shelf = id; renderShelf(); view('shelf'); playSound('drawer'); }
function renderReading(){const pages=state.reading?.pages?.length?state.reading.pages:[state.reading?.content||''];$('#read-title').textContent=state.reading?.title||'';$('#read-content').innerHTML=sanitizeHTML(pages[state.readingPage]||'');$('#read-previous').disabled=state.readingPage===0;$('#read-next').disabled=state.readingPage>=pages.length-1;$('#read-pages').hidden=pages.length<2;}
function readDocument(doc){state.reading=doc;state.readingPage=0;renderReading();view('reading');playSound('paper_draw');}
function openDocument(doc) {
  state.current = {...doc,pages:doc.pages?.length?doc.pages:[doc.content||'']}; state.version = 0; state.savedVersion = 0;state.pageIndex=0;
  titleInput.value = doc.title; editor.innerHTML = sanitizeHTML(state.current.pages[0]);updatePageControls();
  state.folderOpen=false;$('#desk-view').classList.add('folder-closed');$('#folder-open-hit').classList.remove('hidden');$('#folder-open-hit').setAttribute('aria-label','Открыть папку');closeDeskFolder(doc.title);setFolderSheetCount(state.current.pages.length);
  state.folded=false;foldPaper(false);$('.editor-wrap').classList.remove('folded');$('#fold-action').textContent='▱';$('#fold-action').setAttribute('aria-label','Сложить бумаги');showWaxMark(Boolean(doc.sealed));
  $('#desk-location').textContent = state.labels[doc.compartmentId] || '';
  status('Сохранено'); view('desk');
}
function updatePageControls(){const tabs=$('#sheet-tabs');tabs.replaceChildren();if(!state.current)return;const count=state.current.pages?.length||1;for(let i=0;i<count+Number(count<5);i++){const tab=document.createElement('button');tab.type='button';tab.className='sheet-tab'+(i===state.pageIndex?' current':'')+(i===count?' blank':'');tab.textContent=i===count?'':String(i+1);tab.setAttribute('aria-label',i===count?'Добавить лист':`Лист ${i+1}`);tab.disabled=state.pageSwitching||i===state.pageIndex;tab.onclick=()=>changePage(i-state.pageIndex);tabs.append(tab);}}
async function animatePageMove(direction){if(!state.settings.animations||!state.folderOpen)return;const sheet=$('.editor-wrap'),folder=getDeskFolderScreenBounds();if(!folder)return;const rect=sheet.getBoundingClientRect(),dx=folder.x-(rect.left+rect.width/2),dy=folder.y-(rect.top+rect.height/2);const base=getComputedStyle(sheet).transform,stored=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.18) rotate(-12deg)`;const frames=direction==='out'?[{transform:base,opacity:1},{transform:stored,opacity:.08}]:[{transform:stored,opacity:.08},{transform:base,opacity:1}];try{await sheet.animate(frames,{duration:390,easing:'cubic-bezier(.45,0,.2,1)'}).finished;}catch{}}
async function changePage(delta){if(!state.current||state.pageSwitching||state.folded)return;const next=state.pageIndex+delta;if(next<0||next>state.current.pages.length||next>=Math.max(5,state.current.pages.length))return;if(next===state.current.pages.length&&!hasWrittenPaper(state.current)&&!editor.textContent.trim())return;state.pageSwitching=true;updatePageControls();try{await flush();playSound('paper_store');await animatePageMove('out');if(next>=state.current.pages.length){state.current={...state.current,pages:[...state.current.pages,'']};state.version++;}state.pageIndex=next;editor.innerHTML=sanitizeHTML(state.current.pages[next]||'');setFolderSheetCount(state.current.pages.length);playSound('paper_draw');await animatePageMove('in');if(state.version!==state.savedVersion)await saveCurrent();editor.focus();}catch(error){toast(`Не удалось перелистнуть: ${error.message}`);}finally{state.pageSwitching=false;updatePageControls();}}
async function createDocument() {
  if (!state.shelf) { toast('Сначала откройте ящик'); return; }
  if(state.documents.filter(doc=>doc.compartmentId===state.shelf&&hasWrittenPaper(doc)).length>=5){toast('В ящике уже пять папок');return;}
  const now = new Date().toISOString();
  const doc = { id: crypto.randomUUID(), title: '', content: '', createdAt: now, modifiedAt: now, compartmentId: state.shelf, formatVersion: 1 };
  openDocument(doc);
}
async function closeAndLock() {
  try { await flush(); } catch { toast('Ошибка сохранения: кабинет не заперт, повторите попытку'); return; }
  state.current = null; state.documents = []; state.labels={}; state.shelf = null; editor.replaceChildren(); titleInput.value = ''; lock(); clearTimeout(state.idleTimer);
  view('cabinet'); $('#password').value = ''; $('#auth-screen').classList.remove('hidden'); $('#auth-title').textContent = 'Откройте кабинет'; $('#auth-explainer').textContent = 'Введите пароль, чтобы открыть свои рукописи.'; $('#auth-error').textContent = '';
}

async function loadDocuments() {
  const records = await listRecords();
  const docs = [];
  for (const record of records) docs.push(await decryptDocument(record));
  state.documents = docs;
  const labelEnvelope=await getMeta('labels');
  state.labels=labelEnvelope?await decryptPrivate(labelEnvelope):{};
  for(const id of Object.keys(state.labels))if(state.labels[id]==='Мои письма')state.labels[id]='';
  for(const comp of compartments)setDrawerLabel(comp.id,state.labels[comp.id]||'');
  for(const [index,button] of [...document.querySelectorAll('#move-options button')].entries())button.textContent=state.labels[button.dataset.drawer]||`Ящик ${index+1}`;
}

function editLabel(id){state.labelTarget=id;$('#label-input').value=state.labels[id]||'';$('#label-dialog').showModal();$('#label-input').focus();}

async function action(name) {
  const doc = state.current; if (!doc) return;
  $('#action-menu').classList.add('hidden');
  if (name === 'rename') { titleInput.focus(); titleInput.select(); return; }
  try { await flush(); } catch { return; }
  if (name === 'copy') {
    const now = new Date().toISOString();
    const copy = { ...state.current, id: crypto.randomUUID(), title: `${state.current.title} — копия`, createdAt: now, modifiedAt: now };
    try { await putRecord(await encryptDocument(copy)); state.documents.push(copy); openDocument(copy); toast('Копия создана'); } catch(error) { toast(error.message); }
  }
  if (name === 'move') $('#move-dialog').showModal();
  if (name === 'delete') {
    if (!confirm(`Удалить «${doc.title}»? Это действие нельзя отменить.`)) return;
    try { await deleteRecord(doc.id); state.documents = state.documents.filter(item => item.id !== doc.id); state.current = null; renderShelf(); view('shelf'); toast('Документ удалён'); } catch(error) { toast(error.message); }
  }
}

function setupSettings() {
  const form = $('#settings-dialog form');
  for (const [key,value] of Object.entries(state.settings)) { const input = form.elements.namedItem(key); if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; } }
  const apply = () => {
    const result = {};
    for (const key of Object.keys(state.settings)) { const input = form.elements.namedItem(key); result[key] = input.type === 'checkbox' ? input.checked : input.value; }
    state.settings = result; saveSettings(result); applySceneSettings(result);configureSound(result);
    document.body.classList.toggle('reduce-motion', !result.animations);document.body.classList.toggle('show-hints',result.hints);
  };
  form.addEventListener('change', apply); applySceneSettings(state.settings);configureSound(state.settings);document.body.classList.toggle('show-hints',state.settings.hints);
}

function setupEvents() {
  initScene((id,type,documentId)=>{if(type==='label')editLabel(id);else if(type==='folder'||type==='edit-folder'){const doc=state.documents.find(item=>item.id===documentId);if(doc){state.shelf=id;if(type==='edit-folder')openDocument(doc);else readDocument(doc);}}else openShelf(id);});initPen(editor,name=>{if(name==='ink_dip')setInkLid(true);if(name==='ink_lift')setInkLid(false);playSound(name);},(color,level)=>{editor.style.setProperty('--ink-color',color);editor.style.setProperty('--ink-bleed',`${Math.max(0,level-.5)*2.6}px`);editor.style.setProperty('--ink-spread',`${.014+Math.max(0,level-.5)*.04}em`);},getInkwellScreenPosition); showCabinet(); setupSettings();
  const positionDesk=()=>{requestAnimationFrame(positionDesk);if(state.view!=='desk')return;const box=getDeskFolderScreenBounds();if(box){const hit=$('#folder-open-hit');hit.style.left=`${box.x}px`;hit.style.top=`${box.y}px`;hit.style.width=`${box.width*1.08}px`;hit.style.height=`${box.height*1.14}px`;}const paper=getDeskPaperScreenBounds();if(paper){const sheet=$('.editor-wrap');sheet.style.left=`${paper.x}px`;sheet.style.top=`${paper.y+(innerWidth<650?7:10)}px`;sheet.style.width=`${Math.min(innerWidth-22,Math.max(310,paper.width*1.05))}px`;sheet.style.height=`${Math.min(innerHeight*.67,Math.max(innerWidth<650?275:245,paper.height*1.4))}px`;}};requestAnimationFrame(positionDesk);
  const positionTabs=()=>{requestAnimationFrame(positionTabs);if(state.view!=='desk'||!state.folderOpen)return;const box=getDeskFolderScreenBounds();if(!box)return;const tabs=$('#sheet-tabs');tabs.style.left=`${box.x-box.width*.27}px`;tabs.style.top=`${box.y-box.height*.38}px`;tabs.style.width=`${Math.max(105,box.width*.55)}px`;};requestAnimationFrame(positionTabs);
  $('#write-button').onclick = createDocument;
  $('#folder-open-hit').onclick=()=>{if(state.folderOpen){state.folderOpen=false;$('#desk-view').classList.add('folder-closed');$('#folder-open-hit').setAttribute('aria-label','Открыть папку');closeDeskFolder(state.current?.title||'');penLeave();setRestQuillVisible(true);playSound('folder_close');saveCurrent().catch(()=>{});return;}state.folderOpen=true;openDeskFolder();$('#folder-open-hit').setAttribute('aria-label','Закрыть папку');playSound('folder_open');setTimeout(()=>{if(state.view!=='desk'||!state.folderOpen)return;$('#desk-view').classList.remove('folder-closed');setRestQuillVisible(false);penEnter();editor.focus();},520);};
  $('#back-to-cabinet').onclick = () => {view('cabinet');playSound('drawer');};
  $('#back-to-shelf').onclick = () => safeLeave(() => { view('cabinet'); });
  $('#back-from-reading').onclick=()=>{state.reading=null;view('shelf');playSound('paper_store');};
  $('#read-previous').onclick=()=>{if(state.readingPage>0){state.readingPage--;renderReading();playSound('page');}};
  $('#read-next').onclick=()=>{if(state.readingPage<(state.reading?.pages?.length||1)-1){state.readingPage++;renderReading();playSound('page');}};
  $('#documents').onclick = event => { const button = event.target.closest('[data-id]'); if (button) { const doc = state.documents.find(item => item.id === button.dataset.id); if (doc) openDocument(doc); } };
  titleInput.addEventListener('input', dirty);
  setupEditor(editor, event=>{dirty();if(event?.type==='input')penInput(event);});
  editor.addEventListener('pointerdown',penTouch);
  $('#ink-action').onclick=()=>{activateAudio();toggleInkLid();playSound('ink_dip');};
  $('#fold-action').onclick=async()=>{try{await flush();state.folded=!state.folded;foldPaper(state.folded);$('.editor-wrap').classList.toggle('folded',state.folded);$('#fold-action').textContent=state.folded?'▰':'▱';$('#fold-action').setAttribute('aria-label',state.folded?'Развернуть бумаги':'Сложить бумаги');if(state.folded)penLeave();else penEnter();playSound('paper_move');}catch(error){toast(error.message);}};
  $('#wax-action').onclick=async()=>{if(!state.folded){toast('Сначала сложите бумаги');return;}activateAudio();playSound('wax');await stampSeal();if(!state.current)return;showWaxMark(true);state.current.sealed=true;dirty();playSound('seal');};
  $('#lock-button').onclick = closeAndLock;
  $('#settings-button').onclick = () => {$('#manage-current').hidden=state.view!=='desk';$('#settings-dialog').showModal();};
  $('#manage-current').onclick=()=>{$('#settings-dialog').close();$('#action-menu').classList.remove('hidden');};
  $('#document-menu-button').onclick = () => $('#action-menu').classList.toggle('hidden');
  $('#action-menu').onclick = event => { const button = event.target.closest('[data-action]'); if (button) action(button.dataset.action); };
  const moveOptions = $('#move-options');
  for (const [index,comp] of compartments.entries()) { const button = document.createElement('button'); button.type = 'button'; button.textContent = state.labels[comp.id]||`Ящик ${index+1}`; button.dataset.drawer=comp.id; button.onclick = async () => { try { const moved = { ...state.current, compartmentId: comp.id, modifiedAt: new Date().toISOString() }; await putRecord(await encryptDocument(moved)); state.current = moved; state.documents[state.documents.findIndex(d => d.id === moved.id)] = moved; $('#desk-location').textContent = state.labels[comp.id]||'Ящик без подписи'; state.shelf = comp.id; $('#move-dialog').close(); toast('Документ переложен'); } catch(error) { toast(error.message); } }; moveOptions.append(button); }
  $('#label-dialog').addEventListener('close',async()=>{if($('#label-dialog').returnValue!=='save'||!state.labelTarget)return;const next={...state.labels,[state.labelTarget]:$('#label-input').value.trim()};try{await setMeta('labels',await encryptPrivate(next));state.labels=next;setDrawerLabel(state.labelTarget,next[state.labelTarget]);for(const button of moveOptions.querySelectorAll('button')){const index=compartments.findIndex(c=>c.id===button.dataset.drawer);button.textContent=state.labels[button.dataset.drawer]||`Ящик ${index+1}`;}if(state.shelf===state.labelTarget&&state.view==='shelf')renderShelf();toast('Подпись сохранена');}catch(error){toast(`Не удалось сохранить подпись: ${error.message}`);}});
  for (const button of document.querySelectorAll('[data-format]')) { button.addEventListener('mousedown', event => event.preventDefault()); button.onclick = () => format(editor, button.dataset.format, button.dataset.value); }
  $('#undo-button').onclick = () => format(editor, 'undo'); $('#redo-button').onclick = () => format(editor, 'redo');
  $('#find-button').onclick = () => { $('#find-panel').classList.remove('hidden'); $('#find-input').focus(); };
  $('#find-close').onclick = () => { $('#find-panel').classList.add('hidden'); editor.focus(); };
  function find(delta = 0) { state.searchIndex += delta; const result = searchText(editor, $('#find-input').value, state.searchIndex); state.searchIndex = result.index; $('#find-count').textContent = result.count ? `${result.index + 1} / ${result.count}` : 'Нет совпадений'; }
  $('#find-input').oninput = () => { state.searchIndex = 0; find(); };
  $('#find-prev').onclick = () => find(-1); $('#find-next').onclick = () => find(1);
  $('#find-input').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); find(event.shiftKey ? -1 : 1); } };
  window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveCurrent().catch(() => {}); } });
  for (const name of ['pointerdown','keydown']) window.addEventListener(name, resetIdle, { passive: true });
  window.addEventListener('pointerdown',activateAudio,{passive:true});
  document.addEventListener('visibilitychange', () => { if (document.hidden && isUnlocked()) saveCurrent().catch(() => {}); });
  window.addEventListener('pagehide', () => { if (state.current) saveCurrent().catch(() => {}); });
}

async function start() {
  setupEvents();
  const auth = $('#auth-screen');
  try {
    await openStore();
    if (!await hasPassword()) { $('#auth-title').textContent = 'Создайте кабинет'; $('#auth-explainer').textContent = 'Придумайте пароль от 8 символов. Все документы будут зашифрованы на этом устройстве.'; $('#auth-submit').textContent = 'Создать кабинет'; $('#password').autocomplete = 'new-password'; }
  } catch(error) { $('#auth-error').textContent = `Хранилище недоступно: ${error.message}`; $('#auth-submit').disabled = true; }
  $('#auth-form').onsubmit = async event => {
    event.preventDefault(); $('#auth-error').textContent = ''; $('#auth-submit').disabled = true;
    try {
      if (await hasPassword()) await unlock($('#password').value); else await createPassword($('#password').value);
      await loadDocuments(); auth.classList.add('hidden'); $('#password').value = ''; resetIdle();
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    } catch(error) { $('#auth-error').textContent = error.message; }
    finally { $('#auth-submit').disabled = false; }
  };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline unavailable', error));
}
start();
