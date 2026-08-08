<div align="center">

# 🛡️ Ad Blocker & Media Controller for YouTube

**An independent open-source Manifest V3 extension providing network ad blocking, 60 FPS YouTube video ad auto-skipping, Media Session API synchronisation, and Picture-in-Picture controls.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white)](file:///c:/Users/susha/OneDrive/Desktop/youtube%20premium/manifest.json)
[![Browser Support](https://img.shields.io/badge/Browsers-Chrome%20|%20Edge%20|%20Firefox%20|%20Brave%20|%20Opera-10b981?style=for-the-badge)](file:///c:/Users/susha/OneDrive/Desktop/youtube%20premium/manifest.json)
[![License](https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge)](file:///c:/Users/susha/OneDrive/Desktop/youtube%20premium/README.md)

</div>

---

> ⚠️ **Trademark Disclaimer**: *YouTube™ is a registered trademark of Google LLC. This extension is an independent open-source tool created strictly for educational, personal customization, and productivity purposes. It is NOT affiliated with, sponsored by, authorized by, or endorsed by Google LLC or YouTube in any way.*

---

## 🎥 Live Working Usage Demos

### Demo 1: Auto-Skipping Video Ads & Instant Ad Filtering
Watch the extension automatically eliminate YouTube pre-roll, mid-roll, and pop-up video ads instantaneously:

<div align="center">

<img src="https://raw.githubusercontent.com/sushantshetty09/Youtube-Prem/web-application/assets/demo.gif" alt="Ad Blocker & Video Ad Skipper Demo" width="100%" style="max-width: 800px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

</div>

<br>

### Demo 2: Picture-in-Picture Mode & Media Session Controls
Watch the extension in action utilizing floating Picture-in-Picture window controls and system media key synchronisation:

<div align="center">

<img src="https://raw.githubusercontent.com/sushantshetty09/Youtube-Prem/web-application/assets/demo1.gif" alt="Picture in Picture and Media Session Controller Demo" width="100%" style="max-width: 800px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

</div>

---

## ✨ Core Features

### ⚡ Instant YouTube Video Ad Auto-Skipper
- **Zero Video Ads**: Automatically eliminates YouTube pre-roll, mid-roll, and pop-up video ads.
- **0ms Visual Ad Flash**: Masks ad video frames during playback transitions so you never see ad countdowns, banners, or badges.
- **Native Player API Execution**: Calls `moviePlayer.skipAd()` directly on YouTube's player engine to jump straight to your video.

### 🎧 OS Media Key & Background Playback Sync
- **System Media Controls**: Synchronises video title, channel name, album metadata, and high-resolution thumbnail artwork with Windows, macOS, and Linux lock screen control widgets and keyboard media keys via the **Media Session API**.
- **Full Media Controls**: Supports play, pause, stop, previous track, next track, seek backward, seek forward, and position seeking.

### 🖼️ Floating Picture-in-Picture (PiP) Window
- **Watch Anywhere**: Watch YouTube videos in a floating, movable window while switching tabs or working in other desktop applications.
- **Injected Overlay & Popup Shortcut**: Injects a clean glassmorphism **PiP** button on video players plus a 1-click trigger in the extension popup.

### 🛡️ Declarative Net Request Network Ad Blocking
- **Network Level Ad Blocking**: Built on Chrome's Manifest V3 `declarativeNetRequest` API to block network requests to Google ad servers (`doubleclick.net`, `googlesyndication.com`, `googleadservices.com`, `youtube.com/api/stats/ads*`, `youtube.com/pagead/*`).

### 🎛️ 1-Click Site Customisation
- Easily toggle ad blocking on/off for specific sites directly from the extension popup UI.

---

## 💻 Tech Stack & Architecture

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Manifest V3 | Standard WebExtension API specification |
| **Network Engine** | `declarativeNetRequest` | Zero-latency network packet filtering |
| **Background Worker** | Service Worker (`background.js`) | Ephemeral state manager with dynamic DNR rules |
| **Content Engine** | Vanilla JS (`content.js`) | 60 FPS YouTube ad skipper, Media Session API, PiP injection |
| **Popup UI** | HTML / Vanilla CSS / JS | Modern dark-mode popup interface |

---

## 🚀 Quick Installation Guide

### Loading Unpacked in Chrome / Edge / Brave / Opera / Vivaldi

1. Clone or download this repository:
   ```bash
   git clone https://github.com/sushantshetty09/Youtube-Prem.git
   ```
2. Open your browser's extensions page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked**.
5. Select the project root folder.
6. Open YouTube and enjoy an ad-free video experience!

### Loading in Mozilla Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file inside the repository directory.

---

## 📁 Repository Structure

```
.
├── manifest.json         # Extension Manifest V3 configuration
├── rules.json            # Static Declarative Net Request block rules
├── background.js         # Ephemeral background service worker
├── content.js            # Content script (Ad skipper, Media Session, PiP)
├── popup.html            # Extension popup markup
├── popup.css             # Glassmorphism dark theme styling
├── popup.js              # Extension popup controller
├── icons/                # Extension icons (16px, 48px, 128px)
└── assets/
    ├── demo.gif           # Demo preview 1 (Ad skipper)
    └── demo1.gif          # Demo preview 2 (PiP & Media Session)
```

---

## 🔒 Privacy & Security

- **100% Private**: Zero user tracking, zero analytics, zero data collection.
- **Local Storage**: Storage configuration stays strictly local via `chrome.storage.local`.
- **Pure Native JS**: Zero external framework dependencies or remote script execution.

---

<div align="center">

Created with ❤️ by **Ad Blocker & Media Controller Contributors**

</div>
