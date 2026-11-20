// src/js/postcode.js
import { toLonLat } from 'ol/proj.js';

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

/**
 * Formats an 11-character postcode into NIPOST API hyphenated format (e.g., "KD-11-C34-BY-16")
 */
export function formatHyphenatedPostcode(raw) {
  const clean = normalizePostcode(raw);
  if (clean.length !== 11) return clean;
  return `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 7)}-${clean.slice(7, 9)}-${clean.slice(9, 11)}`;
}

/**
 * Formats an 11-character postcode into display spaced format (e.g., "KD 11 C34 BY 16")
 */
export function formatSpacedPostcode(raw) {
  const clean = normalizePostcode(raw);
  if (clean.length !== 11) return clean;
  return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 7)} ${clean.slice(7, 9)} ${clean.slice(9, 11)}`;
}

function extractCoordinates(record) {
  if (!record || typeof record !== 'object') return null;

  const lat = Number(
    record.lat ?? record.latitude ?? record.center?.lat ?? record.location?.lat
  );
  const lng = Number(
    record.lng ??
      record.lon ??
      record.longitude ??
      record.center?.lng ??
      record.center?.lon ??
      record.location?.lng
  );

  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return { lat, lng };
  }

  if (Array.isArray(record.coordinates) && record.coordinates.length >= 2) {
    const [cLon, cLat] = record.coordinates.map(Number);
    if (Number.isFinite(cLat) && Number.isFinite(cLon)) {
      return { lat: cLat, lng: cLon };
    }
  }

  if (Array.isArray(record.geometry?.coordinates) && record.geometry.coordinates.length >= 2) {
    const [gLon, gLat] = record.geometry.coordinates.map(Number);
    if (Number.isFinite(gLat) && Number.isFinite(gLon)) {
      return { lat: gLat, lng: gLon };
    }
  }

  return null;
}

function mapAdminFields(record) {
  return {
    state: record.state || record.state_name || '',
    lga: record.lga || record.lga_name || '',
    ward: record.ward || record.ward_name || '',
    district: record.district || record.area || record.street || '',
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
 * NIPOST Lookup API: Validates an 11-character postcode and retrieves administrative details
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

  if (!navigator.onLine) {
    return {
      status: 'offline_pending',
      postcode: clean,
      message: 'Offline: Postcode saved locally and queued for verification.',
    };
  }

  if (!API_KEY) {
    return {
      status: 'offline_pending',
      postcode: clean,
      message: 'Missing VITE_NIPOST_PUBLIC_KEY in environment; saved locally.',
    };
  }

  try {
    const formatted = formatHyphenatedPostcode(clean);
    const url = `${BASE_URL}/v1/lookup?code=${encodeURIComponent(formatted)}&level=1`;
    const res = await fetchWithTimeout(url, { headers: getHeaders() });
    const record = res.data || res;

    return {
      status: 'verified',
      postcode: clean,
      formattedPostcode: formatted,
      spacedPostcode: formatSpacedPostcode(clean),
      admin: mapAdminFields(record),
      coords: extractCoordinates(record),
      message: 'Verified with NIPOST Postcode API.',
    };
  } catch (error) {
    return {
      status: 'offline_pending',
      postcode: clean,
      message: `Saved locally (${error.message}).`,
    };
  }
}

/**
 * NIPOST Search API: Finds the nearest postcode from an OpenLayers feature geometry
 */
export async function searchPostcodeByGeometry(geometry, fallbackQuery = '') {
  if (!navigator.onLine) {
    return {
      status: 'offline_pending',
      postcode: '',
      message: 'Offline: Enter postcode manually or verify when online.',
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
      if (type === 'Point') {
        coord = geometry.getCoordinates();
      } else if (type === 'LineString') {
        coord = geometry.getFirstCoordinate();
      } else if (type === 'Polygon') {
        coord = geometry.getInteriorPoint().getCoordinates().slice(0, 2);
      }

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
      return {
        status: 'not_found',
        postcode: '',
        message: 'No coordinates or search query available.',
      };
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
    return {
      status: 'verified',
      postcode: clean,
      formattedPostcode: formatHyphenatedPostcode(clean),
      spacedPostcode: formatSpacedPostcode(clean),
      admin: mapAdminFields(item),
      coords: extractCoordinates(item),
      message: 'Postcode matched via NIPOST Search.',
    };
  } catch (error) {
    return {
      status: 'offline_pending',
      postcode: '',
      message: `Search skipped (${error.message}).`,
    };
  }
}

/**
 * Top Map Search Bar: Searches by 11-character postcode OR area/address query
 * Also collects nearby postcodes in the same cell/sector for the popup mini-map
 */
export async function searchPostcodeOrPlace(rawQuery) {
  const trimmed = (rawQuery || '').trim();
  if (!trimmed) return [];

  if (!navigator.onLine) {
    throw new Error('You are currently offline. Connect to search NIPOST postcodes.');
  }

  if (!API_KEY) {
    throw new Error('Missing VITE_NIPOST_PUBLIC_KEY in environment.');
  }

  const normalized = normalizePostcode(trimmed);
  const looksLikePostcode = /^[A-Z]{2}\d{2}[A-Z0-9]{7}$/.test(normalized);

  if (looksLikePostcode) {
    const lookupRes = await lookupPostcode(normalized);
    if (lookupRes.status === 'verified') {
      let coords = lookupRes.coords;
      let nearby = [];

      // Query /v1/search using the 7-character sector prefix (e.g., "KD-11-C34") to find nearby building codes
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
        // Proceed gracefully if nearby search is unavailable in sandbox
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

  const url = `${BASE_URL}/v1/search?q=${encodeURIComponent(trimmed)}`;
  const res = await fetchWithTimeout(url, { headers: getHeaders() });
  const list = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);

  const mapped = list
    .filter((item) => item && (item.postcode || item.code))
    .slice(0, 8)
    .map((item) => {
      const clean = normalizePostcode(item.postcode || item.code);
      return {
        postcode: clean,
        formattedPostcode: formatHyphenatedPostcode(clean),
        spacedPostcode: formatSpacedPostcode(clean),
        admin: mapAdminFields(item),
        coords: extractCoordinates(item),
      };
    });

  return mapped.map((entry, idx) => ({
    ...entry,
    nearby: mapped
      .filter((other, oIdx) => oIdx !== idx && other.coords)
      .map((other) => ({
        postcode: other.postcode,
        shortCode: other.postcode.slice(-4),
        coords: other.coords,
      })),
  }));
}