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

/**
 * Strips spaces/hyphens and returns a clean 11-character uppercase string (e.g., "FC01A01KP27")
 */
export function normalizePostcode(raw) {
  if (!raw) return '';
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
}

/**
 * Formats an 11-character postcode into NIPOST hyphenated format (e.g., "FC-01-A01-KP-27")
 */
export function formatHyphenatedPostcode(raw) {
  const clean = normalizePostcode(raw);
  if (clean.length !== 11) return clean;
  return `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 7)}-${clean.slice(7, 9)}-${clean.slice(9, 11)}`;
}

/**
 * Fetch wrapper with a 6-second timeout so weak rural connections never hang the UI
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
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
 * NIPOST Lookup API: Validates an 11-character postcode and retrieves administrative hierarchy
 */
export async function lookupPostcode(rawCode) {
  const clean = normalizePostcode(rawCode);

  if (clean.length !== 11) {
    return {
      status: 'invalid_format',
      postcode: clean,
      message: 'Enter a valid 11-character postcode (e.g., FC01A01KP27).',
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
      message: 'Missing VITE_NIPOST_PUBLIC_KEY in .env; saved locally.',
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
      admin: {
        state: record.state || record.state_name || '',
        lga: record.lga || record.lga_name || '',
        ward: record.ward || record.ward_name || '',
        district: record.district || record.area || record.street || '',
      },
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
      message: 'Missing VITE_NIPOST_PUBLIC_KEY in .env.',
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

    return {
      status: 'verified',
      postcode: normalizePostcode(item.postcode),
      admin: {
        state: item.state || item.state_name || '',
        lga: item.lga || item.lga_name || '',
        ward: item.ward || item.ward_name || '',
        district: item.district || item.area || item.street || '',
      },
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