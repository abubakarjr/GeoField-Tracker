// src/js/ui.js
import { saveLayerToLocal } from './storage.js';
import {
  lookupPostcode,
  searchPostcodeByGeometry,
  normalizePostcode,
} from './postcode.js';

export function setupUI(getVectorSource, showToast = () => {}) {
  const panel = document.getElementById('metadata-panel');
  const closeBtn = document.getElementById('btn-close-panel');
  const saveBtn = document.getElementById('btn-save-meta');
  const geomBadge = document.getElementById('feat-geom-badge');

  const titleInput = document.getElementById('feat-title');
  const typeSelect = document.getElementById('feat-type');
  const descInput = document.getElementById('feat-desc');

  const postcodeInput = document.getElementById('feat-postcode');
  const verifyBtn = document.getElementById('btn-verify-postcode');
  const gpsLookupBtn = document.getElementById('btn-gps-postcode');
  const postcodeStatus = document.getElementById('postcode-status');

  const stateInput = document.getElementById('feat-state');
  const lgaInput = document.getElementById('feat-lga');
  const wardInput = document.getElementById('feat-ward');
  const districtInput = document.getElementById('feat-district');

  let currentFeature = null;

  function setStatus(message, status = '') {
    postcodeStatus.textContent = message;
    postcodeStatus.dataset.status = status;
  }

  function applyPostcodeResult(result) {
    setStatus(result.message, result.status);

    if (result.postcode) {
      postcodeInput.value = result.postcode;
    }

    if (result.admin) {
      stateInput.value = result.admin.state || '';
      lgaInput.value = result.admin.lga || '';
      wardInput.value = result.admin.ward || '';
      districtInput.value = result.admin.district || '';
    }
  }

  async function openMetadataPanel(feature) {
    currentFeature = feature;
    const props = feature.getProperties ? feature.getProperties() : {};
    const geomType = feature.getGeometry ? feature.getGeometry().getType().toUpperCase() : 'FEATURE';

    if (geomBadge) {
      const meas = props.measurement ? ` • ${props.measurement}` : '';
      geomBadge.textContent = `${geomType}${meas}`;
    }

    titleInput.value = props.title || '';
    typeSelect.value = props.type || 'agriculture';
    descInput.value = props.description || '';

    postcodeInput.value = props.postcode || '';
    stateInput.value = props.state || '';
    lgaInput.value = props.lga || '';
    wardInput.value = props.ward || '';
    districtInput.value = props.district || '';

    panel.classList.remove('hidden');

    if (!props.postcode && navigator.onLine && feature.getGeometry) {
      setStatus('Querying NIPOST API for coordinates...', 'loading');
      const result = await searchPostcodeByGeometry(feature.getGeometry());
      if (currentFeature === feature) {
        applyPostcodeResult(result);
      }
    } else if (!navigator.onLine) {
      setStatus('Offline mode: enter postcode manually or sync later.', 'offline_pending');
    } else {
      setStatus(
        props.postcode ? 'Postcode attached to feature.' : 'Enter postcode or tap GPS to lookup',
        props.postcodeStatus || ''
      );
    }
  }

  function closePanel() {
    panel.classList.add('hidden');
    currentFeature = null;
  }

  closeBtn.addEventListener('click', closePanel);

  verifyBtn.addEventListener('click', async () => {
    verifyBtn.disabled = true;
    setStatus('Verifying postcode with NIPOST...', 'loading');
    try {
      const result = await lookupPostcode(postcodeInput.value);
      applyPostcodeResult(result);
    } finally {
      verifyBtn.disabled = false;
    }
  });

  gpsLookupBtn.addEventListener('click', async () => {
    if (!currentFeature) return;
    gpsLookupBtn.disabled = true;
    setStatus('Searching NIPOST by feature GPS...', 'loading');
    try {
      const result = await searchPostcodeByGeometry(
        currentFeature.getGeometry(),
        titleInput.value
      );
      applyPostcodeResult(result);
    } finally {
      gpsLookupBtn.disabled = false;
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!currentFeature) return;

    const title = titleInput.value.trim() || 'Unnamed Feature';
    const type = typeSelect.value;
    const desc = descInput.value.trim();
    const postcode = normalizePostcode(postcodeInput.value);
    const status =
      postcodeStatus.dataset.status || (postcode ? 'offline_pending' : 'unverified');

    currentFeature.setProperties({
      title,
      type,
      description: desc,
      postcode,
      postcodeStatus: status,
      state: stateInput.value.trim(),
      lga: lgaInput.value.trim(),
      ward: wardInput.value.trim(),
      district: districtInput.value.trim(),
      timestamp: propsTimestampOrNow(currentFeature),
    });

    // Force map layer re-render so the postcode label updates immediately on the map
    currentFeature.changed();

    const source =
      typeof getVectorSource === 'function' ? getVectorSource() : getVectorSource;

    if (source) {
      await saveLayerToLocal(source);
    }

    showToast(
      postcode
        ? `Saved "${title}" (${postcode}) offline`
        : `Saved "${title}" to local storage`,
      'success'
    );
    closePanel();
  });

  return { openMetadataPanel };
}

function propsTimestampOrNow(feature) {
  return feature.get('timestamp') || new Date().toISOString();
}