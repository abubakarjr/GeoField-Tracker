// src/data/localdb.js
const DB_NAME = 'GeoFieldDB';
const DB_VERSION = 2;

export const STORES = {
  FEATURES: 'features',
  POSTCODES: 'postcodes',
  REGIONS: 'offline_regions',
};

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.FEATURES)) {
        db.createObjectStore(STORES.FEATURES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.POSTCODES)) {
        db.createObjectStore(STORES.POSTCODES, { keyPath: 'postcode' });
      }
      if (!db.objectStoreNames.contains(STORES.REGIONS)) {
        db.createObjectStore(STORES.REGIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// --- Spatial Features Store ---
export async function saveFeatureToDB(featureObj) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FEATURES, 'readwrite');
    tx.objectStore(STORES.FEATURES).put(featureObj);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllFeaturesFromDB() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FEATURES, 'readonly');
    const request = tx.objectStore(STORES.FEATURES).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFeatureFromDB(id) {
  if (!id) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FEATURES, 'readwrite');
    tx.objectStore(STORES.FEATURES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllFeaturesFromDB() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FEATURES, 'readwrite');
    tx.objectStore(STORES.FEATURES).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Offline Postcodes Cache Store ---
export async function cachePostcodeRecord(record) {
  if (!record || !record.postcode) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.POSTCODES, 'readwrite');
    tx.objectStore(STORES.POSTCODES).put({
      ...record,
      cachedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedPostcode(postcode) {
  if (!postcode) return null;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.POSTCODES, 'readonly');
    const request = tx.objectStore(STORES.POSTCODES).get(postcode);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllCachedPostcodes() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.POSTCODES, 'readonly');
    const request = tx.objectStore(STORES.POSTCODES).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// --- Offline Map Regions Metadata Store ---
export async function saveOfflineRegionMeta(region) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.REGIONS, 'readwrite');
    tx.objectStore(STORES.REGIONS).put(region);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllOfflineRegions() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.REGIONS, 'readonly');
    const request = tx.objectStore(STORES.REGIONS).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteOfflineRegionMeta(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.REGIONS, 'readwrite');
    tx.objectStore(STORES.REGIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}