export const MAX_FOLDER_PAGES = 200;
export const INITIAL_BUNDLE_PAGES = 1;

export function bundlePages(pages, content = '') {
  const result = Array.isArray(pages) && pages.length ? pages.slice(0, MAX_FOLDER_PAGES) : [content || ''];
  return result;
}

export function romanPage(index) {
  let value = index + 1;
  let result = '';
  for (const [amount, glyph] of [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (value >= amount) { result += glyph; value -= amount; }
  }
  return result;
}

export function nearbyPages(count, current, canAdd = false) {
  const last = Math.min(MAX_FOLDER_PAGES - 1, canAdd && count < MAX_FOLDER_PAGES ? count : count - 1);
  const pages = [];
  const start = Math.max(0, Math.min(current - 2, last - 4));
  for (let index = start; index <= Math.min(last, start + 4); index++) {
    pages.push({ index, offset: index - start - 2, blank: index === count });
  }
  return pages;
}
