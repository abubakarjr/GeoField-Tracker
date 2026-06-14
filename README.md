# GeoField Tracker 🌍📱

[![Live Demo](https://img.shields.io/badge/Demo-Live%20On%20Vercel-blue?style=for-the-badge&logo=vercel)](https://geofieldtracker.vercel.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

An offline-first, mobile-optimized spatial intelligence platform designed for seamless geospatial field data collection, visualization, and calculation in low-connectivity or zero-signal environments. 

This platform serves as a direct technical capstone following my graduation from the Federal Government’s **3MTT Nigeria** initiative under the **DeepTech_Ready Program** by **Data Science Nigeria (DSN)**, building on certifications in *Geospatial Data Science* and *Advanced Data Analysis and Visualization*.

---

## 🚀 Live Application
Access the production build directly on your mobile device, tablet, or desktop:
👉 **[https://geofieldtracker.vercel.app/](https://geofieldtracker.vercel.app/)**

*To use as a native app on Android, open the link in Chrome, tap the menu, and select **"Install App"** or **"Add to Home Screen"**.*

---

## ✨ Key Features & Capability Matrix

*   **Offline-First Architecture:** Implements native browser Service Workers for comprehensive application-shell caching and IndexedDB for secure, long-term on-device data persistence. Data survives total connectivity loss and cold device reboots.
*   **Vector Digitization Toolbar:** A lightweight, touchscreen-optimized UI enabling users to plot Point features (incident markers), LineString features (patrol routes), and Polygon features (agricultural farm bounds).
*   **On-Device Mathematical Engine:** Utilizes geodesic spherical mathematics (`ol/sphere`) to compute precise path lengths (m/km) and polygon areas (hectares) dynamically in real-time as the user digitizes bounds on screen.
*   **Dynamic Attribute Mapping:** Seamlessly binds operational metadata (custom feature names, categories, and granular field observation notes) directly into spatial geometries.
*   **Dual Baselayer Toggle Layer:** Features an asset-optimized toggle layout allowing operators to seamlessly switch between standard OpenStreetMap vector tiles and high-resolution Google Hybrid Satellite views for maximum spatial context.
*   **Enterprise Interoperability:** A built-in serialization pipeline for one-click structured data exports to standard **GeoJSON** (fully compatible with QGIS, ArcGIS, and Python data science workflows) and flat **CSV** data tables.

---

## 🛠️ Tech Stack & Engineering Core

*   **Bundler/Build Tool:** Vite
*   **GIS Mapping Core:** OpenLayers (ES6 modules)
*   **Frontend Architecture:** Vanilla JavaScript, HTML5, Responsive CSS3 Grid & Flexbox (No heavy framework overhead)
*   **Storage Framework:** IndexedDB, `localStorage`
*   **PWA Protocols:** W3C Web Manifest (`manifest.json`), Web Service Workers

---

## 📁 Repository Structure

```text
geofield-tracker/
├── public/
│   ├── icons/                 # PWA Splash and App Icons
│   ├── manifest.json          # Web App Manifest Definition
│   └── sw.js                  # Service Worker Caching & Offline Protocols
├── src/
│   ├── css/
│   │   └── style.css          # Core Application Styles
│   ├── js/
│   │   ├── map.js             # Map Initialization & Layer Control
│   │   ├── geolocation.js     # Live Device GPS Tracking Engine
│   │   ├── draw.js            # Geometric Vector Drawing Interactions
│   │   ├── measurement.js     # Spherical Geodesic Math Calculators
│   │   ├── storage.js         # IndexedDB Persistence & Layer Recovery
│   │   ├── ui.js              # Sidebar Panels & Metadata Form Handling
│   │   └── export.js          # GeoJSON & CSV Data Export Engine
│   └── main.js                # Core Lifecycle Application Bootstrapper
├── index.html                 # Main App HTML Shell
├── package.json               # Build Pipelines & Package Manifest
└── vite.config.js             # Optimized Production Compiling Options
