// src/js/ui.js
import { saveLayerToLocal } from './storage.js';
import {
  lookupPostcode,
  searchPostcodeByGeometry,
  normalizePostcode,
} from './postcode.js';

export function setupUI(getVectorSource) {
  const panel = document.getElementById('metadata-panel');
  const closeBtn = document.getElementById('btn-close-panel');
  const saveBtn = document.getElementById('btn-save-meta');

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

  // Open the panel and attach the active feature
  async function openMetadataPanel(feature) {
    currentFeature = feature;
    const props = feature.getProperties ? feature.getProperties() : {};

    // Populate existing values or reset for a newly drawn feature
    titleInput.value = props.title || '';
    typeSelect.value = props.type || 'agriculture';
    descInput.value = props.description || '';

    postcodeInput.value = props.postcode || '';
    stateInput.value = props.state || '';
    lgaInput.value = props.lga || '';
    wardInput.value = props.ward || '';
    districtInput.value = props.district || '';

    panel.classList.remove('hidden');

    // Automatically attempt NIPOST Search from drawn geometry if online and no postcode is set yet
    if (!props.postcode && navigator.onLine && feature.getGeometry) {
      setStatus('Checking NIPOST API for coordinates...', 'loading');
      const result = await searchPostcodeByGeometry(feature.getGeometry());
      if (currentFeature === feature) {
        applyPostcodeResult(result);
      }
    } else if (!navigator.onLine) {
      setStatus('Offline mode: enter postcode manually or sync later.', 'offline_pending');
    } else {
      setStatus('Enter postcode or tap GPS to lookup', props.postcodeStatus || '');
    }
  }

  // Close the panel
  function closePanel() {
    panel.classList.add('hidden');
    currentFeature = null;
  }

  closeBtn.addEventListener('click', closePanel);

  // Verify typed 11-character postcode via NIPOST Lookup API
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

  // Search postcode from feature coordinates via NIPOST Search API
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

  // Save the form data directly into the OpenLayers feature & IndexedDB
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
      timestamp: new Date().toISOString(),
    });

    // Resolve getter function passed from main.js
    const source =
      typeof getVectorSource === 'function' ? getVectorSource() : getVectorSource;

    if (source) {
      await saveLayerToLocal(source);
      console.log('💾 Feature and NIPOST postcode metadata stored offline.');
    }

    alert('Feature saved successfully!');
    closePanel();
  });

  return { openMetadataPanel };
}