// src/js/ui.js
import { saveLayerToLocal } from './storage.js';

export function setupUI(vectorSource) {
  const panel = document.getElementById('metadata-panel');
  const closeBtn = document.getElementById('btn-close-panel');
  const saveBtn = document.getElementById('btn-save-meta');
  
  let currentFeature = null;

  // Open the panel and attach the active feature
  function openMetadataPanel(feature) {
    currentFeature = feature;
    
    // Clear previous form data
    document.getElementById('feat-title').value = '';
    document.getElementById('feat-desc').value = '';
    document.getElementById('feat-type').value = 'agriculture';
    
    panel.classList.remove('hidden');
  }

  // Close the panel
  function closePanel() {
    panel.classList.add('hidden');
    currentFeature = null;
  }

  closeBtn.addEventListener('click', closePanel);

  // Save the form data directly into the OpenLayers feature
  saveBtn.addEventListener('click', async () => {
    if (currentFeature) {
      const title = document.getElementById('feat-title').value || 'Unnamed Feature';
      const type = document.getElementById('feat-type').value;
      const desc = document.getElementById('feat-desc').value;

      // Set properties on the spatial feature
      currentFeature.setProperties({
        title: title,
        type: type,
        description: desc,
        timestamp: new Date().toISOString()
      });

      // SAVE TO OFFLINE DATABASE
      await saveLayerToLocal(vectorSource);
      console.log('💾 Data safely stored offline.');
      
      alert('Feature saved successfully!');
      closePanel();
    }
  });

  return { openMetadataPanel };
}