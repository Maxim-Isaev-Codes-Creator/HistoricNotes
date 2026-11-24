const ALLOWED = new Set(['P','DIV','BR','B','STRONG','I','EM','H2','H3','UL','OL','LI','SPAN']);
const canonical = { STRONG: 'B', EM: 'I', DIV: 'P', H3: 'H2' };

function cleanNode(node, target) {
  if (node.nodeType === Node.TEXT_NODE) { target.append(document.createTextNode(node.textContent)); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const name = node.tagName;
  if (['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','FORM','IMG'].includes(name)) return;
  const next = ALLOWED.has(name) ? document.createElement(canonical[name] || name.toLowerCase()) : target;
  if(name==='SPAN'){
    const ink=node.getAttribute('class');
    if(/^ink-(?:0\d\d|1\d\d|200)$/.test(ink||''))next.className=ink;
  }
  for (const child of node.childNodes) cleanNode(child, next);
  if (next !== target) target.append(next);
}

export function sanitizeHTML(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');
  for (const child of parsed.body.childNodes) cleanNode(child, output);
  return output.innerHTML;
}

export function setupEditor(element, onChange, onFull = () => {}, inkClass = () => '') {
  let previous = element.innerHTML;
  let caret = 0;
  let pendingText = '';
  const caretOffset = () => {
    const selection = getSelection();
    if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return element.textContent.length;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(element);range.setEnd(selection.anchorNode,selection.anchorOffset);
    return range.toString().length;
  };
  const restoreCaret = offset => {
    const walker = document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    let node,last=null;
    while((node=walker.nextNode())){last=node;if(offset<=node.length){const range=document.createRange();range.setStart(node,offset);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return;}offset-=node.length;}
    if(last){const range=document.createRange();range.selectNodeContents(last);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}
  };
  element.addEventListener('beforeinput', event => {
    previous=element.innerHTML;caret=caretOffset();
    if(event.inputType!=='insertText'||!event.data||event.isComposing)return;
    const tone=inkClass();if(!/^ink-(?:0\d\d|1\d\d|200)$/.test(tone))return;
    event.preventDefault();
    const escaped=event.data.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/ /g,'&nbsp;');
    pendingText=event.data;
    document.execCommand('insertHTML',false,`<span class="${tone}">${escaped}</span>`);
    pendingText='';
  });
  element.addEventListener('paste', event => {
    event.preventDefault();
    const plain = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, plain);
  });
  element.addEventListener('drop', event => event.preventDefault());
  element.addEventListener('input', event => {
    if(element.scrollHeight>element.clientHeight+2){const overflow=event.data||pendingText||(event.inputType==='insertParagraph'?'\n':'');element.innerHTML=previous;restoreCaret(caret);onFull(overflow);return;}
    if(event.inputType==='insertFromComposition'&&event.data){
      const selection=getSelection(),node=selection?.anchorNode,offset=selection?.anchorOffset;
      if(node?.nodeType===Node.TEXT_NODE&&offset>=event.data.length){const range=document.createRange();range.setStart(node,offset-event.data.length);range.setEnd(node,offset);const span=document.createElement('span');span.className=inkClass();range.surroundContents(span);selection.collapse(span.firstChild,span.firstChild.length);}
    }
    previous=element.innerHTML;onChange(event);
  });
  element.addEventListener('blur', () => { element.innerHTML = sanitizeHTML(element.innerHTML); onChange(); });
}

export function format(element, command, value) {
  element.focus();
  document.execCommand(command, false, value || null);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function searchText(element, query, index = 0) {
  const text = element.textContent.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  if (!needle) return { count: 0, index: 0 };
  const offsets = [];
  let from = 0;
  while ((from = text.indexOf(needle, from)) !== -1) { offsets.push(from); from += needle.length; }
  if (!offsets.length) return { count: 0, index: 0 };
  index = ((index % offsets.length) + offsets.length) % offsets.length;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node, cursor = 0;
  while ((node = walker.nextNode())) {
    if (cursor + node.length > offsets[index]) {
      const range = document.createRange();
      range.setStart(node, offsets[index] - cursor);
      let remaining = needle.length, end = node, endOffset = offsets[index] - cursor;
      while (end && remaining) { const available = end.length - endOffset; if (available >= remaining) { endOffset += remaining; remaining = 0; break; } remaining -= available; end = walker.nextNode(); endOffset = 0; }
      if (end) { range.setEnd(end, endOffset); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); range.startContainer.parentElement?.scrollIntoView({ block: 'center' }); }
      break;
    }
    cursor += node.length;
  }
  return { count: offsets.length, index };
}
