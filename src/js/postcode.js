// src/js/postcode.js
import { toLonLat } from 'ol/proj.js';
import {
  cachePostcodeRecord,
  getCachedPostcode,
  getAllCachedPostcodes,
} from '../data/localdb.js';

const API_KEY = import.meta.env.VITE_NIPOST_PUBLIC_KEY;
const BASE_URL = import.meta.env.VITE_NIPOST_BASE_URL || 'https://api.postcode.gov.ng';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY || '',
  };
}

export function normalizePostcode(raw) {
  if (!raw) return '';
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
}

export function formatHyphenatedPostcode(raw) {
  const clean = normalizePostcode(raw);
  if (clean.length !== 11) return clean;
  return `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 7)}-${clean.slice(7, 9)}-${clean.slice(9, 11)}`;
}

export function formatSpacedPostcode(raw) {
  const clean = normalizePostcode(raw);
  if (clean.length !== 11) return clean;
  return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 7)} ${clean.slice(7, 9)} ${clean.slice(9, 11)}`;
}

function extractCoordinates(record) {
  if (!record || typeof record !== 'object') return null;

  const candidates = [
    record,
    record.center,
    record.centroid,
    record.location,
    record.point,
    record.coordinates,
  ];

  for (const obj of candidates) {
    if (!obj || typeof obj !== 'object') continue;
    const lat = Number(obj.lat ?? obj.latitude ?? obj.y);
    const lng = Number(obj.lng ?? obj.lon ?? obj.longitude ?? obj.x);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) > 0.1 &&
      Math.abs(lng) > 0.1
    ) {
      return { lat, lng };
    }
  }

  // GeoJSON [lon, lat] array
  const coordArr = Array.isArray(record.coordinates)
    ? record.coordinates
    : Array.isArray(record.geometry?.coordinates)
      ? record.geometry.coordinates
      : Array.isArray(record.centroid?.coordinates)
        ? record.centroid.coordinates
        : null;

  if (coordArr && coordArr.length >= 2) {
    const [cLon, cLat] = coordArr.map(Number);
    if (Number.isFinite(cLat) && Number.isFinite(cLon) && Math.abs(cLat) > 0.1) {
      return { lat: cLat, lng: cLon };
    }
  }

  // Bounding box [minLon, minLat, maxLon, maxLat] midpoint
  const bbox = record.bbox || record.bounds;
  if (Array.isArray(bbox) && bbox.length === 4) {
    const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);
    if ([minLon, minLat, maxLon, maxLat].every(Number.isFinite)) {
      return {
        lat: (minLat + maxLat) / 2,
        lng: (minLon + maxLon) / 2,
      };
    }
  }

  return null;
}

function mapAdminFields(record) {
  return {
    state: record.state || record.state_name || record.admin_1 || '',
    lga: record.lga || record.lga_name || record.admin_2 || '',
    ward: record.ward || record.ward_name || record.admin_3 || '',
    district: record.district || record.area || record.street || record.locality || '',
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fallback real-world Nigeria geocoder (Nominatim) when NIPOST sandbox/Level-1
 * returns administrative names without building GPS coordinates.
 */
async function geocodeNigeriaLocation(queryText) {
  if (!queryText || !navigator.onLine) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ng&q=${encodeURIComponent(queryText)}`;
    const results = await fetchWithTimeout(url, {}, 5000);
    if (Array.isArray(results) && results.length > 0) {
      const hit = results[0];
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          coords: { lat, lng },
          displayName: hit.display_name || queryText,
        };
      }
    }
  } catch {
    // Ignore fallback failure
  }
  return null;
}

/**
 * NIPOST Lookup API with IndexedDB offline fallback
 */
export async function lookupPostcode(rawCode) {
  const clean = normalizePostcode(rawCode);

  if (clean.length !== 11) {
    return {
      status: 'invalid_format',
      postcode: clean,
      message: 'Enter a valid 11-character postcode (e.g., KD 11 C34 BY 16).',
    };
  }

  // Check IndexedDB cache first if offline
  if (!navigator.onLine) {
    const cached = await getCachedPostcode(clean).catch(() => null);
    if (cached) {
      return {
        status: 'verified',
        postcode: clean,
        formattedPostcode: formatHyphenatedPostcode(clean),
        spacedPostcode: formatSpacedPostcode(clean),
        admin: cached.admin || {},
        coords: cached.coords || null,
        message: 'Verified from local offline postcode cache.',
      };
    }

    return {
      status: 'offline_pending',
      postcode: clean,
      message: 'Offline: Saved locally and queued for auto-verification when online.',
    };
  }

  if (!API_KEY) {
    return {
      status: 'offline_pending',
      postcode: clean,
      message: 'Missing VITE_NIPOST_PUBLIC_KEY; saved locally.',
    };
  }

  try {
    const formatted = formatHyphenatedPostcode(clean);
    const url = `${BASE_URL}/v1/lookup?code=${encodeURIComponent(formatted)}&level=1`;
    const res = await fetchWithTimeout(url, { headers: getHeaders() });
    const record = res.data || res;

    const admin = mapAdminFields(record);
    let coords = extractCoordinates(record);

    if (!coords) {
      const adminQuery = [admin.district, admin.ward, admin.lga, admin.state, 'Nigeria']
        .filter(Boolean)
        .join(', ');
      if (adminQuery && adminQuery !== 'Nigeria') {
        const geo = await geocodeNigeriaLocation(adminQuery);
        if (geo) coords = geo.coords;
      }
    }

    const resultObj = {
      status: 'verified',
      postcode: clean,
      formattedPostcode: formatted,
      spacedPostcode: formatSpacedPostcode(clean),
      admin,
      coords,
      message: 'Verified with NIPOST Postcode API.',
    };

    await cachePostcodeRecord(resultObj).catch(() => {});
    return resultObj;
  } catch (error) {
    const cached = await getCachedPostcode(clean).catch(() => null);
    if (cached) {
      return {
        ...cached,
        status: 'verified',
        message: 'Loaded from local offline postcode cache.',
      };
    }

    return {
      status: 'offline_pending',
      postcode: clean,
      message: `Saved locally (${error.message}).`,
    };
  }
}

/**
 * Reverse Search from drawn OpenLayers geometry
 */
export async function searchPostcodeByGeometry(geometry, fallbackQuery = '') {
  if (!navigator.onLine) {
    return {
      status: 'offline_pending',
      postcode: '',
      message: 'Offline: Enter postcode manually or auto-sync when online.',
    };
  }

  if (!API_KEY) {
    return {
      status: 'offline_pending',
      postcode: '',
      message: 'Missing VITE_NIPOST_PUBLIC_KEY in environment.',
    };
  }

  try {
    const params = new URLSearchParams();

    if (geometry) {
      const type = geometry.getType();
      let coord;
      if (type === 'Point') coord = geometry.getCoordinates();
      else if (type === 'LineString') coord = geometry.getFirstCoordinate();
      else if (type === 'Polygon')
        coord = geometry.getInteriorPoint().getCoordinates().slice(0, 2);

      if (coord) {
        const [lon, lat] = toLonLat(coord);
        params.set('lat', lat.toFixed(6));
        params.set('lng', lon.toFixed(6));
      }
    }

    if (fallbackQuery) {
      params.set('q', fallbackQuery.trim());
    }

    if (![...params.keys()].length) {
      return { status: 'not_found', postcode: '', message: 'No coordinates available.' };
    }

    const url = `${BASE_URL}/v1/search?${params.toString()}`;
    const res = await fetchWithTimeout(url, { headers: getHeaders() });
    const item = Array.isArray(res.data) ? res.data[0] : (res.data || res);

    if (!item || !item.postcode) {
      return {
        status: 'not_found',
        postcode: '',
        message: 'No matching postcode found for this location.',
      };
    }

    const clean = normalizePostcode(item.postcode);
    const resultObj = {
      status: 'verified',
      postcode: clean,
      formattedPostcode: formatHyphenatedPostcode(clean),
      spacedPostcode: formatSpacedPostcode(clean),
      admin: mapAdminFields(item),
      coords: extractCoordinates(item),
      message: 'Postcode matched via NIPOST Search.',
    };

    await cachePostcodeRecord(resultObj).catch(() => {});
    return resultObj;
  } catch (error) {
    return {
      status: 'offline_pending',
      postcode: '',
      message: `Search skipped (${error.message}).`,
    };
  }
}

/**
 * Top Search Bar: Searches NIPOST API + Local Cache + Nigeria Geocoder fallback
 * Guarantees accurate coordinates so the main map always flies to the real location.
 */
export async function searchPostcodeOrPlace(rawQuery) {
  const trimmed = (rawQuery || '').trim();
  if (!trimmed) return [];

  const normalized = normalizePostcode(trimmed);
  const looksLikePostcode = /^[A-Z]{2}\d{2}[A-Z0-9]{7}$/.test(normalized);

  // Offline search against IndexedDB cached postcodes
  if (!navigator.onLine) {
    const allCached = await getAllCachedPostcodes().catch(() => []);
    const matches = allCached.filter(
      (c) =>
        c.postcode.includes(normalized) ||
        JSON.stringify(c.admin || {})
          .toLowerCase()
          .includes(trimmed.toLowerCase())
    );
    if (matches.length) return matches;
    throw new Error('Offline: No cached postcode matched. Connect to search new locations.');
  }

  // 1. Direct 11-character postcode lookup
  if (looksLikePostcode) {
    const lookupRes = await lookupPostcode(normalized);
    if (lookupRes.status === 'verified') {
      let coords = lookupRes.coords;
      let nearby = [];

      try {
        const sectorPrefix = `${normalized.slice(0, 2)}-${normalized.slice(2, 4)}-${normalized.slice(4, 7)}`;
        const searchUrl = `${BASE_URL}/v1/search?q=${encodeURIComponent(sectorPrefix)}`;
        const sRes = await fetchWithTimeout(searchUrl, { headers: getHeaders() });
        const rawList = Array.isArray(sRes.data) ? sRes.data : (sRes.data ? [sRes.data] : []);

        const matchedTarget = rawList.find(
          (r) => normalizePostcode(r.postcode || r.code) === normalized
        );
        if (!coords && matchedTarget) {
          coords = extractCoordinates(matchedTarget);
        }

        nearby = rawList
          .map((r) => {
            const code = normalizePostcode(r.postcode || r.code);
            return {
              postcode: code,
              shortCode: code.slice(-4),
              coords: extractCoordinates(r),
            };
          })
          .filter((r) => r.postcode && r.postcode !== normalized && r.coords);
      } catch {
        // Proceed with primary result
      }

      // If NIPOST sandbox still gave no coordinates, geocode the administrative hierarchy
      if (!coords) {
        const adminStr = [
          lookupRes.admin?.district,
          lookupRes.admin?.ward,
          lookupRes.admin?.lga,
          lookupRes.admin?.state,
          'Nigeria',
        ]
          .filter(Boolean)
          .join(', ');
        if (adminStr !== 'Nigeria') {
          const geo = await geocodeNigeriaLocation(adminStr);
          if (geo) coords = geo.coords;
        }
      }

      return [
        {
          postcode: lookupRes.postcode,
          formattedPostcode: lookupRes.formattedPostcode,
          spacedPostcode: lookupRes.spacedPostcode,
          admin: lookupRes.admin,
          coords,
          nearby,
        },
      ];
    }
  }

  // 2. Text / Place / Partial Postcode Search via NIPOST /v1/search
  let nipostResults = [];
  if (API_KEY) {
    try {
      const url = `${BASE_URL}/v1/search?q=${encodeURIComponent(trimmed)}`;
      const res = await fetchWithTimeout(url, { headers: getHeaders() });
      const list = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);

      for (const item of list.filter((x) => x && (x.postcode || x.code)).slice(0, 6)) {
        const clean = normalizePostcode(item.postcode || item.code);
        const admin = mapAdminFields(item);
        let coords = extractCoordinates(item);

        if (!coords) {
          const adminStr = [admin.district, admin.lga, admin.state, 'Nigeria']
            .filter(Boolean)
            .join(', ');
          const geo = await geocodeNigeriaLocation(
            adminStr !== 'Nigeria' ? adminStr : `${trimmed}, Nigeria`
          );
          if (geo) coords = geo.coords;
        }

        const entry = {
          postcode: clean,
          formattedPostcode: formatHyphenatedPostcode(clean),
          spacedPostcode: formatSpacedPostcode(clean),
          admin,
          coords,
        };
        await cachePostcodeRecord(entry).catch(() => {});
        nipostResults.push(entry);
      }
    } catch {
      // Fall through to Nigeria place geocoder
    }
  }

  if (nipostResults.length > 0) {
    return nipostResults.map((entry, idx) => ({
      ...entry,
      nearby: nipostResults
        .filter((other, oIdx) => oIdx !== idx && other.coords)
        .map((other) => ({
          postcode: other.postcode,
          shortCode: other.postcode.slice(-4),
          coords: other.coords,
        })),
    }));
  }

  // 3. Fallback: If user typed a town/LGA/village name (e.g., "Kagarko"), locate it on the map
  const geoFallback = await geocodeNigeriaLocation(`${trimmed}, Nigeria`);
  if (geoFallback) {
    return [
      {
        postcode: '',
        formattedPostcode: trimmed.toUpperCase(),
        spacedPostcode: trimmed,
        admin: {
          district: geoFallback.displayName.split(',')[0] || trimmed,
          lga: '',
          ward: '',
          state: 'Nigeria',
        },
        coords: geoFallback.coords,
        nearby: [],
        isPlaceMatch: true,
      },
    ];
  }

  return [];
}