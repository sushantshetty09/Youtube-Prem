/**
 * Content Script — Integrated Media Controller Extension
 * Handles ad blocking, YouTube video ad auto-skipping, Media Session API playback sync,
 * and Picture-in-Picture control.
 */

(function () {
  'use strict';

  const extensionAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  // ---------------------------------------------------------------------------
  // 1. Instant CSS Injection Ad Hiding
  // ---------------------------------------------------------------------------

  const AD_CSS_RULES = `
    .ad-showing video,
    .ad-interrupting video {
      opacity: 0 !important;
    }

    .ad-showing .ytp-ad-player-overlay,
    .ad-showing .ytp-ad-text,
    .ad-showing .ytp-ad-preview-text,
    .ad-showing .ytp-ad-message-container,
    .ad-showing .ytp-ad-overlay-container,
    .ytp-ad-skip-button-slot,
    .ytp-ad-module,
    .ytp-ad-overlay-container,
    .ytp-ad-image-overlay,
    .ytp-ad-text-overlay,
    .ytp-ad-action-interstitial,
    #player-ads,
    ytd-ad-slot-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-banner-promo-renderer,
    ytd-display-ad-renderer,
    ytd-statement-banner-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-player-legacy-desktop-watch-ads-renderer,
    ytd-action-companion-ad-renderer,
    ytd-compact-promoted-video-renderer,
    #masthead-ad,
    #rendering-content.ytd-in-feed-ad-layout-renderer,
    .ytd-search-pyv-renderer,
    
    .google-auto-placed,
    .adsbygoogle,
    [id^="google_ads_"],
    [id^="div-gpt-ad"],
    amp-embed[type="taboola"],
    .trc_related_container,
    .ad-banner,
    .ad-unit,
    .ad-zone {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      height: 0 !important;
      width: 0 !important;
    }
  `;

  function injectAdBlockStyles() {
    if (document.getElementById('imc-adblock-styles')) return;
    const style = document.createElement('style');
    style.id = 'imc-adblock-styles';
    style.textContent = AD_CSS_RULES;
    (document.head || document.documentElement).appendChild(style);
  }

  injectAdBlockStyles();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAdBlockStyles, { once: true });
  }

  // ---------------------------------------------------------------------------
  // 2. High-Speed YouTube Video Ad Bypass Engine (Efficient Throttled Loop)
  // ---------------------------------------------------------------------------

  const isYouTube = window.location.hostname.includes('youtube.com');
  let wasAdMuted = false;

  function instantSkipYouTubeAd() {
    if (!isYouTube) return;
    const moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (!moviePlayer) return;

    const isAdShowing =
      moviePlayer.classList.contains('ad-showing') ||
      moviePlayer.classList.contains('ad-interrupting') ||
      !!moviePlayer.querySelector('.ytp-ad-player-overlay') ||
      !!moviePlayer.querySelector('.ytp-ad-text');

    const video = moviePlayer.querySelector('video');

    if (isAdShowing) {
      if (typeof moviePlayer.skipAd === 'function') {
        try {
          moviePlayer.skipAd();
        } catch (e) {}
      }

      const skipButtons = moviePlayer.querySelectorAll(`
        .ytp-ad-skip-button,
        .ytp-ad-skip-button-modern,
        .ytp-skip-ad-button,
        .ytp-ad-skip-button-slot,
        button.ytp-ad-skip-button-icon,
        .ytp-ad-skip-button-container,
        .ytp-ad-skip-button-text,
        ytd-ad-slot-renderer button
      `);

      skipButtons.forEach((btn) => {
        if (btn && typeof btn.click === 'function') {
          try {
            btn.click();
          } catch (e) {}
        }
      });

      const closeOverlayButtons = moviePlayer.querySelectorAll('.ytp-ad-overlay-close-button');
      closeOverlayButtons.forEach((btn) => {
        if (btn && typeof btn.click === 'function') {
          try {
            btn.click();
          } catch (e) {}
        }
      });

      if (video) {
        try {
          if (!video.muted) {
            video.muted = true;
            wasAdMuted = true;
          }
          if (video.duration && isFinite(video.duration)) {
            video.currentTime = video.duration - 0.01;
          }
          video.playbackRate = 16.0;
          video.dispatchEvent(new Event('ended'));
        } catch (err) {
          console.warn('Instant video ad bypass error:', err);
        }
      }
    } else {
      if (video && wasAdMuted) {
        video.muted = false;
        video.playbackRate = 1.0;
        wasAdMuted = false;
      }
    }
  }

  if (isYouTube) {
    setInterval(instantSkipYouTubeAd, 250);
  }

  // ---------------------------------------------------------------------------
  // 3. Media Session API Synchronisation
  // ---------------------------------------------------------------------------

  function getPageMetadata() {
    const title =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title ||
      'Media Playback';
    const artist =
      document.querySelector('meta[property="og:site_name"]')?.content ||
      window.location.hostname;
    const album =
      document.querySelector('meta[property="og:album"]')?.content ||
      'Integrated Media Controller';

    const poster =
      document.querySelector('meta[property="og:image"]')?.content || '';

    const defaultSvgArt =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="%236366f1"/><path d="M192 128l192 128-192 128V128z" fill="%23ffffff"/></svg>';

    const artworkSrc = poster || defaultSvgArt;

    const sizes = [96, 128, 192, 256, 384, 512];
    const artwork = sizes.map((size) => ({
      src: artworkSrc,
      sizes: `${size}x${size}`,
      type: poster ? 'image/jpeg' : 'image/svg+xml'
    }));

    return { title, artist, album, artwork };
  }

  function setupMediaSession(video) {
    if (!('mediaSession' in navigator) || !video) return;
    if (video.dataset.mediaSessionInjected === 'true') return;
    video.dataset.mediaSessionInjected = 'true';

    try {
      const meta = getPageMetadata();
      navigator.mediaSession.metadata = new MediaMetadata({
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        artwork: meta.artwork
      });
    } catch (error) {
      console.warn('Failed to set MediaSession metadata:', error);
    }

    const actionMap = [
      ['play', () => { video.play().catch((e) => console.warn('Play action failed:', e)); }],
      ['pause', () => { video.pause(); }],
      ['stop', () => { video.pause(); video.currentTime = 0; }],
      ['previoustrack', () => { video.currentTime = 0; }],
      ['nexttrack', () => { if (video.duration) video.currentTime = video.duration; }],
      ['seekbackward', (details) => {
        const skip = details.seekOffset || 10;
        video.currentTime = Math.max(video.currentTime - skip, 0);
      }],
      ['seekforward', (details) => {
        const skip = details.seekOffset || 10;
        const max = video.duration || video.currentTime + 10;
        video.currentTime = Math.min(video.currentTime + skip, max);
      }],
      ['seekto', (details) => {
        if (details.seekTime !== undefined && !isNaN(details.seekTime)) {
          video.currentTime = details.seekTime;
        }
      }]
    ];

    actionMap.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
        console.warn(`Action handler "${action}" registration failed:`, error);
      }
    });

    function syncPositionState() {
      if (
        'setPositionState' in navigator.mediaSession &&
        video.duration &&
        !isNaN(video.duration) &&
        isFinite(video.duration)
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration: video.duration,
            playbackRate: video.playbackRate || 1.0,
            position: video.currentTime || 0
          });
        } catch (err) {
          console.warn('MediaSession setPositionState error:', err);
        }
      }
    }

    video.addEventListener('timeupdate', syncPositionState);
    video.addEventListener('ratechange', syncPositionState);
    syncPositionState();
  }

  // ---------------------------------------------------------------------------
  // 4. Picture-in-Picture (PiP) Controls
  // ---------------------------------------------------------------------------

  function togglePictureInPicture(video) {
    if (!document.pictureInPictureEnabled) return;
    if (!video) return;

    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch((error) => {
        console.warn('Error exiting Picture-in-Picture mode:', error);
      });
    } else if (video.readyState !== 0) {
      video.requestPictureInPicture().catch((error) => {
        console.warn('Error requesting Picture-in-Picture mode:', error);
      });
    }
  }

  function injectPipButton(video) {
    if (!document.pictureInPictureEnabled || !video) return;
    if (video.dataset.pipButtonInjected === 'true') return;

    video.dataset.pipButtonInjected = 'true';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'imc-pip-toggle-btn';
    button.title = 'Toggle Picture-in-Picture mode';
    button.setAttribute('aria-label', 'Toggle Picture-in-Picture mode');
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <rect x="11" y="9" width="9" height="6" rx="1" fill="currentColor" opacity="0.4"/>
      </svg>
      <span>PiP</span>
    `;

    Object.assign(button.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      zIndex: '2147483647',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      color: '#ffffff',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      transition: 'all 0.2s ease'
    });

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = 'rgba(99, 102, 241, 0.9)';
      button.style.transform = 'scale(1.05)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = button.classList.contains('imc-active')
        ? 'rgba(99, 102, 241, 0.85)'
        : 'rgba(15, 23, 42, 0.85)';
      button.style.transform = 'scale(1)';
    });

    const stopAndPrevent = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    button.addEventListener('mousedown', stopAndPrevent);
    button.addEventListener('mouseup', stopAndPrevent);
    button.addEventListener('pointerdown', stopAndPrevent);
    button.addEventListener('click', (e) => {
      stopAndPrevent(e);
      togglePictureInPicture(video);
    });

    const parent = video.parentElement || video.parentNode;
    if (parent) {
      const computedPos = window.getComputedStyle(parent).position;
      if (computedPos === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(button);
    }

    video.addEventListener('enterpictureinpicture', () => {
      button.classList.add('imc-active');
      button.style.backgroundColor = 'rgba(99, 102, 241, 0.85)';
      button.style.borderColor = '#6366f1';
    });

    video.addEventListener('leavepictureinpicture', () => {
      button.classList.remove('imc-active');
      button.style.backgroundColor = 'rgba(15, 23, 42, 0.85)';
      button.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });
  }

  function initMediaController(targetContainer) {
    const root = targetContainer || document;
    const videos = root.querySelectorAll ? root.querySelectorAll('video') : [];
    if (videos.length > 0) {
      videos.forEach((video) => {
        setupMediaSession(video);
        injectPipButton(video);
      });
    } else {
      const video = document.querySelector('video');
      if (video) {
        setupMediaSession(video);
        injectPipButton(video);
      }
    }
  }

  initMediaController();

  // ---------------------------------------------------------------------------
  // 5. Robust Debounced & Circuit-Protected MutationObserver
  // ---------------------------------------------------------------------------

  let mutationCount = 0;
  let lastResetTime = Date.now();
  const MAX_MUTATIONS_PER_SEC = 50;

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const debouncedInit = debounce((nodesToCheck) => {
    if (!videoObserver) return;
    
    try {
      videoObserver.disconnect();
    } catch (e) {}

    if (nodesToCheck && nodesToCheck.length > 0) {
      nodesToCheck.forEach((node) => {
        if (node.nodeType === 1) {
          initMediaController(node);
        }
      });
    } else {
      initMediaController();
    }

    if (document.body && videoObserver) {
      try {
        videoObserver.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }
  }, 200);

  let videoObserver = new MutationObserver((mutations) => {
    const now = Date.now();
    if (now - lastResetTime > 1000) {
      mutationCount = 0;
      lastResetTime = now;
    }
    mutationCount++;

    if (mutationCount > MAX_MUTATIONS_PER_SEC) {
      console.warn('Integrated Media Controller: MutationObserver circuit breaker triggered (>50 mutations/sec). Disconnecting observer to prevent browser hang.');
      if (videoObserver) {
        videoObserver.disconnect();
        videoObserver = null;
      }
      return;
    }

    let addedElements = [];
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      if (added && added.length > 0) {
        for (let j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) {
            addedElements.push(added[j]);
          }
        }
      }
    }

    if (addedElements.length > 0) {
      debouncedInit(addedElements);
    }
  });

  if (document.body) {
    videoObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // 6. Message Listener
  // ---------------------------------------------------------------------------

  extensionAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'TOGGLE_PIP') {
      const video = document.querySelector('video');
      if (video) {
        togglePictureInPicture(video);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, reason: 'No video element found' });
      }
    }
    return true;
  });
})();

