<div align="center">

# 🛡️ Integrated Media Controller

**A powerful, lightweight Manifest V3 cross-browser extension for network-level ad blocking, 60 FPS YouTube video ad auto-skipping, Media Session API synchronisation, and Picture-in-Picture controls.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white)](file:///c:/Users/susha/OneDrive/Desktop/youtube%20premium/manifest.json)
[![Browser Support](https://img.shields.io/badge/Browsers-Chrome%20|%20Edge%20|%20Firefox%20|%20Brave%20|%20Opera-10b981?style=for-the-badge)](file:///c:/Users/susha/OneDrive/Desktop/youtube%20premium/manifest.json)
[![License](https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge)](file:///c:/Users/susha/OneDrive/Desktop/youtube%20premium/README.md)

</div>

---

## 🎥 Demo Preview

Watch the **Integrated Media Controller** in action, seamlessly filtering network ads, skipping video ads instantly, and managing media playback controls:

<div align="center">

https://github.com/user-attachments/assets/demo.mp4

<video src="assets/demo.mp4" controls="controls" width="100%" style="max-width: 800px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></video>

</div>

---

## ✨ Key Features

### 🛡️ Multi-Layer Network & DOM Ad Blocking
- **Declarative Net Request (DNR)**: Blocks network requests to major ad networks, tracking servers, and telemetry endpoints (`doubleclick.net`, `googlesyndication.com`, `googleadservices.com`, `taboola.com`, etc.) at zero runtime CPU cost.
- **Instant CSS Injection**: Hides ad banners, sponsored feed items, and promoted cards at 0ms latency before they ever render on screen.

### ⚡ 60 FPS YouTube In-Stream Video Ad Skipper
- **Zero-Ad Visual Flash**: Automatically masks ad video frames during transitions so you never see ad countdowns, badges, or banners.
- **Native Player API Execution**: Invokes `moviePlayer.skipAd()` directly on YouTube's player engine.
- **Instant Completion**: Auto-clicks skip buttons (`.ytp-ad-skip-button`), mutes ad audio, and jumps playback directly to the main video.

### 🎵 System Media Session API Synchronisation
- **OS Control Center Integration**: Synchronises video title, channel/artist, album info, and high-resolution artwork (96px to 512px) with operating system media keys and control widgets.
- **Playback Control Handlers**: Responds to play, pause, stop, previous, next, seek backward, seek forward, and seek-to events across media players.

### 🖼️ Floating Picture-in-Picture (PiP) Controls
- **Injected Video Overlay**: Injects a sleek, glassmorphic **PiP** button on web `<video>` elements.
- **One-Click Popup Trigger**: Toggle Picture-in-Picture directly from the extension popup window.

### 🎛️ Per-Site Customisation & Toggle
- **Per-Site Ad Blocking Overrides**: Quickly toggle ad blocking on/off for specific domains using dynamic DNR rules and `chrome.storage.local`.

---

## 💻 Tech Stack & Architecture

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Manifest V3 | Standard WebExtension API specification |
| **Network Engine** | `declarativeNetRequest` | Zero-latency network packet filtering |
| **Background Worker** | Service Worker (`background.js`) | Ephemeral state manager with dynamic DNR rules |
| **Content Engine** | Vanilla JS (`content.js`) | 60 FPS ad skipper, Media Session API, PiP injection |
| **Popup UI** | HTML / Vanilla CSS / JS | Modern dark-mode popup interface |

---

## 🚀 Quick Installation Guide

### Loading Unpacked in Chrome / Edge / Brave / Opera

1. Clone or download this repository:
   ```bash
   git clone https://github.com/sushantshetty09/youtube-premium.git
   ```
2. Open your browser's extensions management page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the project root folder (`youtube-premium`).
6. Navigate to YouTube or any video streaming website to enjoy ad-free playback and media controls!

### Loading in Mozilla Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file inside the repository directory.

---

## 📁 Repository Structure

```
youtube-premium/
├── manifest.json         # Extension Manifest V3 configuration
├── rules.json            # Static Declarative Net Request block rules
├── background.js         # Ephemeral background service worker
├── content.js            # Content script (Ad skipper, Media Session, PiP)
├── popup.html            # Extension popup markup
├── popup.css             # Glassmorphism dark theme styling
├── popup.js              # Extension popup controller
├── icons/                # Extension icons (16px, 48px, 128px)
└── assets/
    └── demo.mp4           # Demo video preview
```

---

## 🔒 Privacy & Security

- **Zero Telemetry**: No user tracking, zero data collection, no analytics scripts.
- **Local State Only**: All site customisations stay on your local device via `chrome.storage.local`.
- **Pure Native Code**: Zero external framework dependencies or remote code execution.

---

<div align="center">

Created with ❤️ by **Integrated Media Controller Team**

</div>
