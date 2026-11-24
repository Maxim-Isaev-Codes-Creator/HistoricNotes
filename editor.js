const ALLOWED = new Set(['P','DIV','BR','B','STRONG','I','EM','H2','H3','UL','OL','LI']);
const canonical = { STRONG: 'B', EM: 'I', DIV: 'P', H3: 'H2' };

function cleanNode(node, target) {
  if (node.nodeType === Node.TEXT_NODE) { target.append(document.createTextNode(node.textContent)); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const name = node.tagName;
  if (['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','FORM','IMG'].includes(name)) return;
  const next = ALLOWED.has(name) ? document.createElement(canonical[name] || name.toLowerCase()) : target;
  for (const child of node.childNodes) cleanNode(child, next);
  if (next !== target) target.append(next);
}

export function sanitizeHTML(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');
  for (const child of parsed.body.childNodes) cleanNode(child, output);
  return output.innerHTML;
}

export function setupEditor(element, onChange) {
  element.addEventListener('paste', event => {
    event.preventDefault();
    const plain = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, plain);
  });
  element.addEventListener('drop', event => event.preventDefault());
  element.addEventListener('input', onChange);
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
