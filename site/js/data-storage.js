(function registerDataStorageModule() {
window.ClinicalModules = window.ClinicalModules || {};

window.ClinicalModules.dataStorage = {
  dataStorageDbName: 'clinical-contract-browser-storage',
  dataStorageStoreName: 'session-files',
  dataStorageSessionKey: 'clinical-contract-data-session-v1',

  openDataStorage() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is unavailable.'));
        return;
      }

      const request = window.indexedDB.open(this.dataStorageDbName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.dataStorageStoreName)) {
          database.createObjectStore(this.dataStorageStoreName, { keyPath: 'sessionId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open browser data storage.'));
    });
  },

  getDataStorageSessionId(create = false) {
    try {
      let sessionId = sessionStorage.getItem(this.dataStorageSessionKey);
      if (!sessionId && create) {
        sessionId = window.crypto?.randomUUID?.()
          || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        sessionStorage.setItem(this.dataStorageSessionKey, sessionId);
      }
      return sessionId;
    } catch (_error) {
      return null;
    }
  },

  async persistDataFileSession(file) {
    if (!file) return;
    const sessionId = this.getDataStorageSessionId(true);
    if (!sessionId) return;

    const database = await this.openDataStorage();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.dataStorageStoreName, 'readwrite');
        transaction.objectStore(this.dataStorageStoreName).put({
          sessionId,
          name: file.name || 'dataset',
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified || Date.now(),
          data: file,
          savedAt: Date.now(),
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Unable to store the data file.'));
        transaction.onabort = () => reject(transaction.error || new Error('Data file storage was aborted.'));
      });
    } finally {
      database.close();
    }
  },

  async readPersistedDataFile() {
    const sessionId = this.getDataStorageSessionId(false);
    if (!sessionId) return null;

    const database = await this.openDataStorage();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.dataStorageStoreName, 'readonly');
        const request = transaction.objectStore(this.dataStorageStoreName).get(sessionId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Unable to restore the data file.'));
      });
    } finally {
      database.close();
    }
  },

  async clearPersistedDataFile() {
    const sessionId = this.getDataStorageSessionId(false);
    try {
      sessionStorage.removeItem(this.dataStorageSessionKey);
    } catch (_error) {
      // Ignore storage failures.
    }
    if (!sessionId) return;

    const database = await this.openDataStorage();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.dataStorageStoreName, 'readwrite');
        transaction.objectStore(this.dataStorageStoreName).delete(sessionId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Unable to delete the stored data file.'));
        transaction.onabort = () => reject(transaction.error || new Error('Stored data file deletion was aborted.'));
      });
    } finally {
      database.close();
    }
  },
};
})();
