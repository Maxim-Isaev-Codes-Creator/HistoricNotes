const DB_NAME = 'historic-cabinet';
const DB_VERSION = 1;
let database;

export function openStore() {
  if (database) return Promise.resolve(database);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => { database = request.result; database.onversionchange = () => { database.close(); database = undefined; }; resolve(database); };
    request.onerror = () => reject(request.error || new Error('Не удалось открыть хранилище'));
    request.onblocked = () => reject(new Error('Закройте другие вкладки кабинета и повторите'));
  });
}

function operation(store, mode, action) {
  return openStore().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = action(transaction.objectStore(store));
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || request.error || new Error('Ошибка хранилища'));
    transaction.onabort = () => reject(transaction.error || new Error('Операция прервана'));
  }));
}

export const getMeta = key => operation('meta', 'readonly', store => store.get(key)).then(record => record?.value);
export const setMeta = (key, value) => operation('meta', 'readwrite', store => store.put({ key, value }));
export const listRecords = () => operation('documents', 'readonly', store => store.getAll());
export const putRecord = record => operation('documents', 'readwrite', store => store.put(record));
export const deleteRecord = id => operation('documents', 'readwrite', store => store.delete(id));
