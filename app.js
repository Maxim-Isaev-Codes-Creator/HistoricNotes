import { openStore, listRecords, putRecord, deleteRecord, getMeta, setMeta } from './storage.js';
import { hasPassword, createPassword, unlock, lock, isUnlocked, encryptDocument, decryptDocument, encryptPrivate, decryptPrivate } from './security.js';
import { setupEditor, sanitizeHTML, format, searchText } from './editor.js';
import { loadSettings, saveSettings } from './settings.js';
import { compartments, initScene, showCabinet, focusCompartment, showDesk, applySceneSettings, setDrawerLabel, setDrawerDocuments, toggleInkLid, setInkLid, stampSeal, foldPaper, showWaxMark, closeDeskFolder, openDeskFolder, setFolderSheetCount, setRestQuillVisible, getInkwellScreenPosition, getDeskFolderScreenBounds, getLooseCordScreenPosition, setBundleBound, getDeskPaperScreenBounds, getDeskZoom, setDeskZoom } from './scene.js';
import { initPen, penEnter, penLeave, penInput, penTouch, getCurrentInkClass } from './pen.js';
import { configureSound, activateAudio, playSound, startAtmosphere, stopAtmosphere } from './sound.js';
import { MAX_FOLDER_PAGES, INITIAL_BUNDLE_PAGES, bundlePages, romanPage } from './pages.js';

const $ = selector => document.querySelector(selector);
const state = { documents: [], labels:{}, labelTarget:null,current: null, reading:null, readingPage:0, shelf: null, pageIndex:0, pageSwitching:false, folded:false, folderOpen:false, saveTimer: null, saveChain: Promise.resolve(), version: 0, savedVersion: 0, idleTimer: null, searchIndex: 0, settings: loadSettings(), view: 'cabinet' };
const editor = $('#editor');
const titleInput = $('#document-title');
function hasWrittenPaper(doc){return (doc.pages?.length?doc.pages:[doc.content||'']).some(page=>page.replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').trim().length>0);}
function pageNumber(index){return romanPage(index);}
function drawerCount(id){return state.documents.filter(doc=>doc.compartmentId===id&&hasWrittenPaper(doc)).length;}

function status(message, error = false) { const node = $('#save-status'); node.textContent = message; node.classList.toggle('error', error); }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('visible'); clearTimeout(node.timer); node.timer = setTimeout(() => node.classList.remove('visible'), 3000); }
function view(name) {
  $('#desk-view').classList.remove('binding-sheet-away');
  state.view = name;
  document.body.classList.toggle('reading-active', name === 'reading');
  for (const section of document.querySelectorAll('.view')) section.classList.toggle('active', section.id === `${name}-view`);
  $('#write-button').classList.toggle('hidden',name==='desk');
  $('#decrypt-button').classList.toggle('hidden',name!=='reading');
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
function renderReading(){const pages=state.reading?.pages?.length?state.reading.pages:[state.reading?.content||''];$('#read-title').textContent=state.reading?.title||'';$('#read-content').innerHTML=sanitizeHTML(pages[state.readingPage]||'');$('#read-page-number').textContent=pageNumber(state.readingPage);for(const id of ['read-previous','read-left-edge'])$( `#${id}`).disabled=state.readingPage===0;for(const id of ['read-next','read-right-edge'])$( `#${id}`).disabled=state.readingPage>=pages.length-1;$('#read-pages').hidden=pages.length<2;}
function readDocument(doc){state.reading={...doc,pages:bundlePages(doc.pages,doc.content)};state.readingPage=0;renderReading();view('reading');playSound('paper_draw');}
function pagePlainText(html) {
  const root = document.createElement('div'); root.innerHTML = sanitizeHTML(html || '');
  let text = '';
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) { text += node.textContent.replace(/\u00a0/g, ' '); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === 'BR') { text += '\n'; return; }
    for (const child of node.childNodes) visit(child);
    if (/^(DIV|P|H[1-6]|LI|BLOCKQUOTE)$/.test(node.tagName) && !text.endsWith('\n')) text += '\n';
  }
  for (const child of root.childNodes) visit(child);
  return text.replace(/[ \t]+\n/g, '\n').trim();
}
async function copyOpenFolder() {
  if (!state.reading) return;
  const pages = state.reading.pages?.length ? state.reading.pages : [state.reading.content || ''];
  const text = [state.reading.title?.trim(), ...pages.map(pagePlainText)].filter(Boolean).join('\n\n');
  if (!text) { toast('В связке нет текста'); return; }
  try {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); copied = true; } catch { /* Use the selection fallback. */ }
    }
    if (!copied) {
      const field = document.createElement('textarea'); field.value = text;
      field.style.cssText = 'position:fixed;left:-10000px;top:0'; document.body.append(field);
      field.focus(); field.select();
      copied = document.execCommand('copy'); field.remove();
      if (!copied) throw new Error('Буфер обмена недоступен');
    }
    toast('Текст связки скопирован');
  } catch { toast('Не удалось скопировать текст'); }
}
function openDocument(doc, initialPage=0) {
  state.current = {...doc,pages:bundlePages(doc.pages,doc.content),bound:doc.bound??((doc.pages?.length||1)>1)}; state.version = 0; state.savedVersion = 0;state.pageIndex=Math.min(Math.max(0,initialPage),state.current.pages.length-1,MAX_FOLDER_PAGES-1);
  titleInput.value = doc.title; editor.innerHTML = sanitizeHTML(state.current.pages[state.pageIndex]);updatePageControls();
  state.folderOpen=false;$('#desk-view').classList.add('folder-closed');$('#folder-open-hit').classList.remove('hidden');$('#folder-open-hit').setAttribute('aria-label','Открыть связку');closeDeskFolder(doc.title);setBundleBound(state.current.bound);updatePageControls();
  state.folded=false;foldPaper(false);$('.editor-wrap').classList.remove('folded');$('#fold-action').textContent='▱';$('#fold-action').setAttribute('aria-label','Сложить бумаги');showWaxMark(Boolean(doc.sealed));
  $('#desk-location').textContent = state.labels[doc.compartmentId] || '';
  status('Сохранено'); view('desk');
  if(state.current.pages.length===1&&!state.current.bound){state.folderOpen=true;openDeskFolder();$('#desk-view').classList.remove('folder-closed');$('#folder-open-hit').setAttribute('aria-label','Закрыть связку');setRestQuillVisible(false);penEnter();}
}
function canExtendBundle(){return Boolean(state.current&&state.pageIndex===state.current.pages.length-1&&pagePlainText(editor.innerHTML));}
function updatePageControls(){if(!state.current)return;const canAdd=canExtendBundle();state.addablePageVisible=canAdd;$('#write-page-number').textContent=pageNumber(state.pageIndex);setFolderSheetCount(state.current.pages.length,state.pageIndex,canAdd,state.current.bound);}
async function animatePageMove(direction){if(!state.settings.animations||!state.folderOpen)return;const sheet=$('.editor-wrap'),folder=getDeskFolderScreenBounds();if(!folder)return;const rect=sheet.getBoundingClientRect(),dx=folder.x-(rect.left+rect.width/2),dy=folder.y-(rect.top+rect.height/2);const base=getComputedStyle(sheet).transform,stored=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.18) rotate(-12deg)`;const frames=direction==='out'?[{transform:base,opacity:1},{transform:stored,opacity:.08}]:[{transform:stored,opacity:.08},{transform:base,opacity:1}];try{await sheet.animate(frames,{duration:390,easing:'cubic-bezier(.45,0,.2,1)'}).finished;}catch{}}
async function changePage(delta){if(!state.current||state.pageSwitching||state.folded)return;const next=state.pageIndex+delta;if(next<0||next>state.current.pages.length||next>=MAX_FOLDER_PAGES)return;if(next===state.current.pages.length&&!canExtendBundle())return;state.pageSwitching=true;try{await flush();playSound('paper_store');await animatePageMove('out');if(next>=state.current.pages.length){state.current={...state.current,pages:[...state.current.pages,'']};state.version++;}state.pageIndex=next;editor.innerHTML=sanitizeHTML(state.current.pages[next]||'');updatePageControls();playSound('paper_draw');await animatePageMove('in');if(state.version!==state.savedVersion)await saveCurrent();editor.focus();}catch(error){toast(`Не удалось перелистнуть: ${error.message}`);}finally{state.pageSwitching=false;updatePageControls();}}
function pasteAcrossPages(plain) {
  if(!state.current||!state.folderOpen||state.pageSwitching)return;
  const originalHTML=editor.innerHTML, originalPages=[...state.current.pages];
  const selection=getSelection();let range=selection?.rangeCount&&editor.contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():null;
  if(!range){range=document.createRange();range.selectNodeContents(editor);range.collapse(false);}
  range.deleteContents();
  const tailRange=document.createRange();tailRange.setStart(range.startContainer,range.startOffset);tailRange.setEnd(editor,editor.childNodes.length);
  const tail=tailRange.extractContents();
  const prefix=editor.innerHTML, tailContainer=document.createElement('div');tailContainer.append(tail);
  const tailHTML=tailContainer.innerHTML, pages=[];
  const tone=getCurrentInkClass();let remaining=plain;
  const fits=chunk=>{const span=document.createElement('span');span.className=tone;span.textContent=chunk;editor.append(span);const okay=editor.scrollHeight<=editor.clientHeight+2;span.remove();return okay;};
  while(remaining.length){
    if(originalPages.length-1+pages.length>=MAX_FOLDER_PAGES){editor.innerHTML=originalHTML;toast('Связка вмещает не больше 200 листов');return;}
    let low=0,high=remaining.length;
    while(low<high){const middle=Math.ceil((low+high)/2);if(fits(remaining.slice(0,middle)))low=middle;else high=middle-1;}
    if(low===0&&editor.innerHTML===prefix&&pages.length===0){pages.push(editor.innerHTML);editor.replaceChildren();continue;}
    if(low===0){editor.innerHTML=originalHTML;toast('Не удалось разместить текст на листе');return;}
    if(low<remaining.length){const breakAt=Math.max(remaining.lastIndexOf('\n',low),remaining.lastIndexOf(' ',low));if(breakAt>low*.8)low=breakAt+1;}
    const span=document.createElement('span');span.className=tone;span.textContent=remaining.slice(0,low);editor.append(span);
    pages.push(sanitizeHTML(editor.innerHTML));remaining=remaining.slice(low);
    editor.replaceChildren();
  }
  if(tailHTML){const last=pages.pop()||prefix;editor.innerHTML=last;editor.insertAdjacentHTML('beforeend',tailHTML);if(editor.scrollHeight>editor.clientHeight+2){pages.push(sanitizeHTML(last));editor.innerHTML=tailHTML;if(editor.scrollHeight>editor.clientHeight+2){editor.innerHTML=originalHTML;toast('Не удалось разместить текст на листе');return;}}pages.push(sanitizeHTML(editor.innerHTML));}
  if(!pages.length)pages.push(sanitizeHTML(prefix));
  const nextPages=[...originalPages.slice(0,state.pageIndex),...pages,...originalPages.slice(state.pageIndex+1)];
  if(nextPages.length>MAX_FOLDER_PAGES){editor.innerHTML=originalHTML;toast('Связка вмещает не больше 200 листов');return;}
  state.current={...state.current,pages:nextPages};editor.innerHTML=nextPages[state.pageIndex];dirty();updatePageControls();editor.focus();return pages.length;
}
async function createDocument() {
  if (!state.shelf) { toast('Сначала откройте ящик'); return; }
  if(drawerCount(state.shelf)>=8){toast('В ящике уже восемь связок или листов');return;}
  const now = new Date().toISOString();
  const doc = { id: crypto.randomUUID(), title: '', pages:Array(INITIAL_BUNDLE_PAGES).fill(''), content: '', bound:false, createdAt: now, modifiedAt: now, compartmentId: state.shelf, formatVersion: 1 };
  openDocument(doc);
}
async function closeAndLock() {
  try { await flush(); } catch { toast('Ошибка сохранения: кабинет не заперт, повторите попытку'); return; }
  state.current = null; state.reading = null; state.documents = []; state.labels={}; state.shelf = null; state.pageIndex=0;
  editor.replaceChildren(); titleInput.value = '';
  for(const id of ['documents','read-content'])$( `#${id}`).replaceChildren();
  for(const id of ['read-title','read-page-number','write-page-number','shelf-title','desk-location','label-input'])$( `#${id}`).textContent='';
  $('#label-input').value='';
  for(const [index,button] of [...document.querySelectorAll('#move-options button')].entries())button.textContent=`Ящик ${index+1}`;
  for(const comp of compartments){setDrawerLabel(comp.id,'');setDrawerDocuments(comp.id,[]);}
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close('cancel'));
  lock(); clearTimeout(state.idleTimer);
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
    if(!hasWrittenPaper(state.current)){toast('В связке пока нет бумаг');return;}
    if(drawerCount(state.current.compartmentId)>=8){toast('В ящике уже восемь связок или листов');return;}
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
  initScene((id,type,documentId)=>{if(type==='label')editLabel(id);else if(type==='folder'||type==='edit-folder'){const doc=state.documents.find(item=>item.id===documentId);if(doc){state.shelf=id;if(type==='edit-folder')openDocument(doc);else readDocument(doc);}}else openShelf(id);},index=>{if(state.view==='desk'&&state.folderOpen&&state.current)changePage(index-state.pageIndex);});initPen(editor,name=>{if(name==='ink_dip')setInkLid(true);if(name==='ink_lift')setInkLid(false);playSound(name);},(color,level)=>{editor.style.setProperty('--ink-color',color);editor.style.setProperty('--ink-bleed',`${Math.max(0,level-.5)*2.6}px`);editor.style.setProperty('--ink-spread',`${.014+Math.max(0,level-.5)*.04}em`);},getInkwellScreenPosition); showCabinet(); setupSettings();
  const positionDesk=()=>{
    requestAnimationFrame(positionDesk);if(state.view!=='desk')return;
    const box=getDeskFolderScreenBounds();
    if(box){const hit=$('#folder-open-hit');hit.style.display=state.current?.pages.length===1?'none':'';hit.style.left=`${box.x}px`;hit.style.top=`${state.folderOpen?box.y-box.height*.75:box.y}px`;hit.style.width=`${box.width*1.08}px`;hit.style.height=`${box.height*(state.folderOpen?.7:1.14)}px`;}
    const cord=getLooseCordScreenPosition(),bind=$('#bind-hit');bind.style.display=state.folderOpen&&!state.current?.bound?'':'none';if(cord){bind.style.left=`${cord.x}px`;bind.style.top=`${cord.y}px`;}
    const paper=getDeskPaperScreenBounds();if(paper){const sheet=$('.editor-wrap');sheet.style.left=`${paper.x}px`;sheet.style.top=`${paper.y}px`;sheet.style.width=`${paper.width}px`;sheet.style.height=`${paper.height}px`;const size=paper.width;const inset=Math.max(2,size*.065);sheet.style.padding=`${inset}px`;editor.style.fontSize=`${Math.min(23,Math.max(3,size*.058))}px`;editor.style.height=`calc(100% - ${Math.max(8,size*.16)}px)`;titleInput.style.fontSize=`${Math.min(26,Math.max(4,size*.075))}px`;$('#write-page-number').style.fontSize=`${Math.min(18,Math.max(7,size*.06))}px`;}
  };requestAnimationFrame(positionDesk);
  let pinchDistance=0;
  const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
  for(const surface of [$('#world'),$('#desk-view')]){
    surface.addEventListener('touchstart',event=>{if(state.view==='desk'&&event.touches.length===2)pinchDistance=distance(event.touches);},{passive:true});
    surface.addEventListener('touchmove',event=>{if(state.view!=='desk'||event.touches.length!==2)return;event.preventDefault();const next=distance(event.touches);if(pinchDistance>0)setDeskZoom(getDeskZoom()*next/pinchDistance);pinchDistance=next;},{passive:false});
    surface.addEventListener('touchend',event=>{if(event.touches.length<2)pinchDistance=0;},{passive:true});
  }
  $('#write-button').onclick = () => state.view === 'reading' && state.reading ? openDocument(state.reading,state.readingPage) : createDocument();
  $('#decrypt-button').onclick = copyOpenFolder;
  $('#bind-hit').onclick=async()=>{if(!state.current||!state.folderOpen||state.current.bound)return;try{await flush();playSound('paper_store');await animatePageMove('out');$('#desk-view').classList.add('binding-sheet-away');if(state.current.pages.length>1){setFolderSheetCount(state.current.pages.length,state.current.pages.length,false,false);state.current.bound=true;dirty();setBundleBound(true,true);playSound('cord_tie');await saveCurrent();await new Promise(resolve=>setTimeout(resolve,1450));}await safeLeave(()=>view('cabinet'));}catch(error){$('#desk-view').classList.remove('binding-sheet-away');toast(`Не удалось сохранить: ${error.message}`);}};
  $('#folder-open-hit').onclick=()=>{if(state.folderOpen){state.folderOpen=false;$('#desk-view').classList.add('folder-closed');$('#folder-open-hit').setAttribute('aria-label','Открыть связку');closeDeskFolder(state.current?.title||'');penLeave();setRestQuillVisible(true);playSound('folder_close');saveCurrent().catch(()=>{});return;}state.folderOpen=true;openDeskFolder();$('#folder-open-hit').setAttribute('aria-label','Закрыть связку');playSound('folder_open');setTimeout(()=>{if(state.view!=='desk'||!state.folderOpen)return;$('#desk-view').classList.remove('folder-closed');setRestQuillVisible(false);penEnter();editor.focus();},520);};
  $('#back-to-cabinet').onclick = () => {view('cabinet');playSound('drawer');};
  $('#back-to-shelf').onclick = () => safeLeave(() => { view('cabinet'); });
  $('#back-from-reading').onclick=()=>{state.reading=null;view('shelf');playSound('paper_store');};
  const flipReading=direction=>{const next=state.readingPage+direction;if(!state.reading||next<0||next>=state.reading.pages.length)return;state.readingPage=next;renderReading();const paper=$('#read-paper');paper.classList.remove('turning');void paper.offsetWidth;paper.classList.add('turning');playSound('page');};
  for(const id of ['read-previous','read-left-edge'])$( `#${id}`).onclick=()=>flipReading(-1);
  for(const id of ['read-next','read-right-edge'])$( `#${id}`).onclick=()=>flipReading(1);
  $('#documents').onclick = event => { const button = event.target.closest('[data-id]'); if (button) { const doc = state.documents.find(item => item.id === button.dataset.id); if (doc) openDocument(doc); } };
  titleInput.addEventListener('input', dirty);
  setupEditor(editor, event=>{dirty();if(event?.type==='input'){penInput(event);if(state.addablePageVisible!==canExtendBundle())updatePageControls();}},overflow=>{if(!overflow){toast('Лист заполнен');return;}const oldPage=state.pageIndex,created=pasteAcrossPages(overflow);if(created>1){state.pageIndex=oldPage+1;editor.innerHTML=sanitizeHTML(state.current.pages[state.pageIndex]);updatePageControls();playSound('paper_store');playSound('paper_draw');editor.focus();const selection=getSelection(),range=document.createRange();range.selectNodeContents(editor);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}},getCurrentInkClass);
  editor.addEventListener('paste',event=>{if(!state.current||!state.folderOpen)return;event.preventDefault();event.stopImmediatePropagation();pasteAcrossPages(event.clipboardData?.getData('text/plain')||'');},{capture:true});
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
  for (const [index,comp] of compartments.entries()) { const button = document.createElement('button'); button.type = 'button'; button.textContent = state.labels[comp.id]||`Ящик ${index+1}`; button.dataset.drawer=comp.id; button.onclick = async () => { try { if(!state.current||!hasWrittenPaper(state.current)){toast('В связке пока нет бумаг');return;}if(comp.id!==state.current.compartmentId&&drawerCount(comp.id)>=8){toast('В ящике уже восемь связок или листов');return;}const moved = { ...state.current, compartmentId: comp.id, modifiedAt: new Date().toISOString() }; await putRecord(await encryptDocument(moved)); state.current = moved; const at=state.documents.findIndex(d=>d.id===moved.id);if(at<0)state.documents.push(moved);else state.documents[at]=moved; $('#desk-location').textContent = state.labels[comp.id]||''; state.shelf = comp.id; $('#move-dialog').close(); toast('Бумаги переложены'); } catch(error) { toast(error.message); } }; moveOptions.append(button); }
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
    if (!await hasPassword()) { $('#auth-title').textContent = 'Создайте кабинет'; $('#auth-explainer').textContent = 'Придумайте пароль от 12 символов. Бумаги будут зашифрованы на этом устройстве.'; $('#auth-submit').textContent = 'Создать кабинет'; $('#password').autocomplete = 'new-password'; $('#password').minLength=12; }
  } catch(error) { $('#auth-error').textContent = `Хранилище недоступно: ${error.message}`; $('#auth-submit').disabled = true; }
  $('#auth-form').onsubmit = async event => {
    event.preventDefault(); $('#auth-error').textContent = ''; $('#auth-submit').disabled = true;
    try {
      if (await hasPassword()) await unlock($('#password').value); else await createPassword($('#password').value);
      await loadDocuments(); auth.classList.add('hidden'); $('#password').value = ''; resetIdle();
    } catch(error) { lock(); state.documents=[]; state.labels={}; $('#auth-error').textContent = error.message; }
    finally { $('#auth-submit').disabled = false; }
  };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline unavailable', error));
}
start();
