// src/js/ui.js
import { saveLayerToLocal, removeFeatureFromLocal } from './storage.js';
import {
  lookupPostcode,
  searchPostcodeByGeometry,
  normalizePostcode,
} from './postcode.js';

export function setupUI(getVectorSource, showToast = () => {}) {
  const panel = document.getElementById('metadata-panel');
  const closeBtn = document.getElementById('btn-close-panel');
  const saveBtn = document.getElementById('btn-save-meta');
  const deleteBtn = document.getElementById('btn-delete-feature');
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
    const geomType = feature.getGeometry
      ? feature.getGeometry().getType().toUpperCase()
      : 'FEATURE';

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
      setStatus(
        'Offline mode: enter postcode manually; auto-verifies when online.',
        'offline_pending'
      );
    } else {
      setStatus(
        props.postcode
          ? 'Postcode attached to feature.'
          : 'Enter postcode or tap GPS to lookup',
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
      timestamp: currentFeature.get('timestamp') || new Date().toISOString(),
    });

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

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!currentFeature) return;
      const source =
        typeof getVectorSource === 'function' ? getVectorSource() : getVectorSource;
      if (source) {
        source.removeFeature(currentFeature);
      }
      await removeFeatureFromLocal(currentFeature);
      showToast('Feature deleted from map & offline database', 'warning');
      closePanel();
    });
  }

  // Background Auto-Sync: When network returns, verify any features saved offline
  async function syncPendingPostcodes() {
    if (!navigator.onLine) return;
    const source =
      typeof getVectorSource === 'function' ? getVectorSource() : getVectorSource;
    if (!source) return;

    const pending = source
      .getFeatures()
      .filter((f) => f.get('postcode') && f.get('postcodeStatus') === 'offline_pending');

    if (!pending.length) return;

    let syncedCount = 0;
    for (const feat of pending) {
      const res = await lookupPostcode(feat.get('postcode'));
      if (res.status === 'verified') {
        feat.setProperties({
          postcodeStatus: 'verified',
          state: res.admin?.state || feat.get('state') || '',
          lga: res.admin?.lga || feat.get('lga') || '',
          ward: res.admin?.ward || feat.get('ward') || '',
          district: res.admin?.district || feat.get('district') || '',
        });
        feat.changed();
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      await saveLayerToLocal(source);
      showToast(
        `Synced & verified ${syncedCount} offline ${syncedCount === 1 ? 'postcode' : 'postcodes'} with NIPOST`,
        'success'
      );
    }
  }

  window.addEventListener('online', syncPendingPostcodes);

  return { openMetadataPanel, syncPendingPostcodes };
}