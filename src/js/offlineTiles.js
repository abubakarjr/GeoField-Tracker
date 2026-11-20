// src/js/offlineTiles.js
import {
  saveOfflineRegionMeta,
  getAllOfflineRegions,
  deleteOfflineRegionMeta,
} from '../data/localdb.js';

export const TILE_CACHE_NAME = 'geofield-map-tiles-v1';

/**
 * Attaches an offline-first tile loader to an OpenLayers XYZ/OSM source.
 * Checks Cache API first so saved areas render immediately with zero connectivity,
 * and caches newly viewed tiles opportunistically while online.
 */
export function attachOfflineTileLoader(source) {
  if (!source || !('caches' in window)) return;

  source.setTileLoadFunction((imageTile, src) => {
    const img = imageTile.getImage();

    caches
      .open(TILE_CACHE_NAME)
      .then((cache) =>
        cache.match(src).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse.blob().then((blob) => {
              const objUrl = URL.createObjectURL(blob);
              img.onload = () => URL.revokeObjectURL(objUrl);
              img.src = objUrl;
            });
          }

          if (!navigator.onLine) {
            imageTile.setState(3); // OpenLayers TileState.ERROR (graceful blank tile offline)
            return;
          }

          return fetch(src, { mode: 'cors' })
            .then((networkRes) => {
              if (networkRes && networkRes.ok) {
                cache.put(src, networkRes.clone());
                return networkRes.blob().then((blob) => {
                  const objUrl = URL.createObjectURL(blob);
                  img.onload = () => URL.revokeObjectURL(objUrl);
                  img.src = objUrl;
                });
              }
              img.src = src;
            })
            .catch(() => {
              img.src = src;
            });
        })
      )
      .catch(() => {
        img.src = src;
      });
  });
}

// Slippy-map Lon/Lat -> Tile X/Y conversion
function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

// Compute bounding box around [lon, lat] for a given radius in km
function getRadiusBounds([lon, lat], radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
  };
}

function getOsmTileUrl(z, x, y) {
  const subdomains = ['a', 'b', 'c'];
  const sub = subdomains[(x + y) % subdomains.length];
  return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

function enumerateUrlsForBounds(bounds, minZoom, maxZoom) {
  const urls = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lon2tile(bounds.minLon, z);
    const xMax = lon2tile(bounds.maxLon, z);
    const yMin = lat2tile(bounds.maxLat, z); // North = smaller Y
    const yMax = lat2tile(bounds.minLat, z); // South = larger Y

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(getOsmTileUrl(z, x, y));
      }
    }
  }
  return urls;
}

/**
 * Generates deduplicated tile URLs for a radius around [lon, lat].
 * - 'smart10km': Full 10km radius at z11-z14 + inner 2.5km field core at z15-z16 (~215 tiles)
 * - 'full10km': Full 10km radius at z12-z16 (~680 tiles)
 * - 'detail5km': 5km radius at z12-z17 (~650 tiles)
 */
export function buildTileListForRadius(centerLonLat, mode = 'smart10km') {
  const urlSet = new Set();

  if (mode === 'full10km') {
    const b10 = getRadiusBounds(centerLonLat, 10);
    enumerateUrlsForBounds(b10, 12, 16).forEach((u) => urlSet.add(u));
  } else if (mode === 'detail5km') {
    const b5 = getRadiusBounds(centerLonLat, 5);
    enumerateUrlsForBounds(b5, 12, 17).forEach((u) => urlSet.add(u));
  } else {
    // Smart 10km Pack: entire 10km regional navigation + high-detail 2.5km field center
    const b10 = getRadiusBounds(centerLonLat, 10);
    const bCore = getRadiusBounds(centerLonLat, 2.5);
    enumerateUrlsForBounds(b10, 11, 14).forEach((u) => urlSet.add(u));
    enumerateUrlsForBounds(bCore, 15, 16).forEach((u) => urlSet.add(u));
  }

  return Array.from(urlSet);
}

let activeAbortController = null;

export function cancelOfflineDownload() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

/**
 * Downloads and stores map tiles into Cache API with concurrency throttling
 */
export async function downloadOfflineRegion({
  centerLonLat,
  mode = 'smart10km',
  label = 'Field Zone (10km)',
  onProgress = () => {},
}) {
  if (!navigator.onLine) {
    throw new Error('Connect to the internet first to download offline map tiles.');
  }

  if (!('caches' in window)) {
    throw new Error('Offline Cache Storage is not supported in this browser.');
  }

  cancelOfflineDownload();
  const controller = new AbortController();
  activeAbortController = controller;

  const urls = buildTileListForRadius(centerLonLat, mode);
  const total = urls.length;
  const cache = await caches.open(TILE_CACHE_NAME);

  let completed = 0;
  let newlyDownloaded = 0;
  let index = 0;
  const CONCURRENCY = 6;

  onProgress({ completed: 0, total, percent: 0 });

  async function worker() {
    while (index < total) {
      if (controller.signal.aborted) return;
      const currentIdx = index++;
      const url = urls[currentIdx];

      try {
        const existing = await cache.match(url);
        if (!existing) {
          const res = await fetch(url, {
            mode: 'cors',
            signal: controller.signal,
          });
          if (res.ok) {
            await cache.put(url, res);
            newlyDownloaded++;
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        // Skip individual failed tile without aborting entire region
      } finally {
        completed++;
        const percent = Math.round((completed / total) * 100);
        onProgress({ completed, total, percent });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (controller.signal.aborted) {
    return { cancelled: true, total, completed };
  }

  activeAbortController = null;

  const regionRecord = {
    id: `reg_${Date.now()}`,
    label,
    mode,
    center: centerLonLat,
    tileCount: total,
    newlyDownloaded,
    savedAt: new Date().toISOString(),
  };

  await saveOfflineRegionMeta(regionRecord);
  return { cancelled: false, region: regionRecord };
}

export async function getOfflineStorageSummary() {
  const regions = await getAllOfflineRegions();
  let cachedTileCount = 0;

  if ('caches' in window) {
    try {
      const cache = await caches.open(TILE_CACHE_NAME);
      const keys = await cache.keys();
      cachedTileCount = keys.length;
    } catch {
      cachedTileCount = 0;
    }
  }

  let quotaNote = '';
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const usedMb = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
      quotaNote = `${usedMb} MB used`;
    } catch {
      quotaNote = '';
    }
  }

  return { regions, cachedTileCount, quotaNote };
}

export async function clearAllOfflineMapTiles() {
  if ('caches' in window) {
    await caches.delete(TILE_CACHE_NAME);
  }
  const regions = await getAllOfflineRegions();
  for (const r of regions) {
    await deleteOfflineRegionMeta(r.id);
  }
}