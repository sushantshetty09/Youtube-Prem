/**
 * Content Script — Integrated Media Controller Extension
 * Handles ad blocking, YouTube video ad auto-skipping, Media Session API playback sync,
 * and Picture-in-Picture control.
 */

(function () {
  'use strict';

  const extensionAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  let isAdBlockEnabledForSite = true;

  // ---------------------------------------------------------------------------
  // 1. Instant CSS Injection Ad Hiding
  // ---------------------------------------------------------------------------

  const AD_CSS_RULES = `
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

    /* In-Page Floating Picture-in-Picture (Same-Tab Overlay) */
    .imc-inpage-pip {
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      width: 480px !important;
      height: 270px !important;
      z-index: 2147483647 !important;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75) !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      transition: width 0.25s ease, height 0.25s ease, transform 0.25s ease !important;
    }

    .imc-inpage-pip .html5-video-container,
    .imc-inpage-pip .html5-main-video,
    .imc-inpage-pip video {
      width: 100% !important;
      height: 100% !important;
      top: 0 !important;
      left: 0 !important;
      object-fit: contain !important;
    }

    .imc-inpage-pip .ytp-chrome-bottom {
      width: 100% !important;
      left: 0 !important;
    }

    .imc-inpage-pip .ytp-caption-window-container,
    .imc-inpage-pip .caption-window {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      z-index: 2147483647 !important;
    }
  `;

  function injectAdBlockStyles() {
    if (!isAdBlockEnabledForSite) return;
    if (document.getElementById('imc-adblock-styles')) return;
    const style = document.createElement('style');
    style.id = 'imc-adblock-styles';
    style.textContent = AD_CSS_RULES;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeAdBlockStyles() {
    const style = document.getElementById('imc-adblock-styles');
    if (style) {
      style.remove();
    }
  }

  function checkSiteAdBlockStatus() {
    extensionAPI.runtime.sendMessage(
      { action: 'GET_SITE_STATUS', domain: window.location.hostname },
      (response) => {
        if (extensionAPI.runtime.lastError) return;
        if (response && typeof response.enabled === 'boolean') {
          isAdBlockEnabledForSite = response.enabled;
          if (isAdBlockEnabledForSite) {
            injectAdBlockStyles();
          } else {
            removeAdBlockStyles();
          }
        }
      }
    );
  }

  checkSiteAdBlockStatus();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkSiteAdBlockStatus, { once: true });
  }

  // ---------------------------------------------------------------------------
  // 2. High-Speed YouTube Video Ad Bypass Engine (Efficient Throttled Loop)
  // ---------------------------------------------------------------------------

  const isYouTube = window.location.hostname.includes('youtube.com');
  let wasAdMuted = false;

  function instantSkipYouTubeAd() {
    if (!isYouTube || !isAdBlockEnabledForSite) return;
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
        button.ytp-ad-skip-button-icon,
        .ytp-ad-skip-button-text
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
        } catch (err) {
          console.warn('Instant video ad bypass error:', err);
        }
      }
    } else {
      if (video) {
        let shouldResumePlay = false;
        if (wasAdMuted) {
          video.muted = false;
          wasAdMuted = false;
          shouldResumePlay = true;
        }
        if (video.playbackRate > 2.0) {
          video.playbackRate = 1.0;
          shouldResumePlay = true;
        }
        if (shouldResumePlay && video.paused) {
          try {
            if (typeof moviePlayer.playVideo === 'function') {
              moviePlayer.playVideo();
            } else {
              video.play().catch(() => {});
            }
          } catch (e) {}
        }
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
  // 4. Picture-in-Picture (PiP) Controls & Live Translation Support
  // ---------------------------------------------------------------------------

  function enableLiveTranslationTextTrack(video) {
    if (!video) return;
    let track = Array.from(video.textTracks || []).find((t) => t.label === 'Live Translation Sync');
    if (!track) {
      try {
        track = video.addTextTrack('captions', 'Live Translation Sync', 'en');
        track.mode = 'showing';
      } catch (e) {
        return;
      }
    } else {
      track.mode = 'showing';
    }

    const captionContainer = document.querySelector('.ytp-caption-window-container') || document.querySelector('.caption-window');
    if (captionContainer && !video.dataset.captionSyncActive) {
      video.dataset.captionSyncActive = 'true';
      const captionObserver = new MutationObserver(() => {
        const text = captionContainer.innerText || captionContainer.textContent;
        if (text && text.trim().length > 0) {
          if (track.cues) {
            Array.from(track.cues).forEach((c) => {
              try { track.removeCue(c); } catch (e) {}
            });
          }
          const now = video.currentTime || 0;
          try {
            const cue = new VTTCue(now, now + 4, text.trim());
            track.addCue(cue);
          } catch (e) {}
        }
      });
      captionObserver.observe(captionContainer, { childList: true, subtree: true, characterData: true });
    }
  }

  function togglePictureInPicture(video) {
    if (!video) return;

    const playerContainer = video.closest ? (video.closest('#movie_player') || video.closest('.html5-video-player') || video.parentElement) : video.parentElement;
    if (!playerContainer) return;

    const isCurrentlyPip = playerContainer.classList.contains('imc-inpage-pip');

    if (isCurrentlyPip) {
      playerContainer.classList.remove('imc-inpage-pip');
      const pipBtn = playerContainer.querySelector('.imc-pip-toggle-btn');
      if (pipBtn) {
        pipBtn.classList.remove('imc-active');
      }
    } else {
      // Exit any standard OS PiP if active
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }

      playerContainer.classList.add('imc-inpage-pip');
      const pipBtn = playerContainer.querySelector('.imc-pip-toggle-btn');
      if (pipBtn) {
        pipBtn.classList.add('imc-active');
      }
    }
  }


  function injectPipButton(video) {
    if (!document.pictureInPictureEnabled || !video) return;

    // Do NOT inject inside YouTube miniplayer
    if (video.closest && video.closest('ytd-miniplayer, .ytp-miniplayer, #miniplayer')) return;

    const parent = video.closest ? (video.closest('#movie_player') || video.closest('.html5-video-player') || video.parentElement) : (video.parentElement || video.parentNode);
    if (!parent) return;

    if (parent.querySelector('.imc-pip-toggle-btn')) return;

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
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
      }
    };

    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick'].forEach((evtType) => {
      button.addEventListener(evtType, stopAndPrevent, { capture: true });
    });

    button.addEventListener('click', (e) => {
      stopAndPrevent(e);
      togglePictureInPicture(video);
    }, { capture: true });

    const computedPos = window.getComputedStyle(parent).position;
    if (computedPos === 'static') {
      parent.style.position = 'relative';
    }
    parent.appendChild(button);

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
    if (targetContainer && targetContainer.nodeType === 1) {
      if (targetContainer.matches && targetContainer.matches('video')) {
        setupMediaSession(targetContainer);
        injectPipButton(targetContainer);
      }
      if (targetContainer.querySelectorAll) {
        const videos = targetContainer.querySelectorAll('video');
        videos.forEach((v) => {
          setupMediaSession(v);
          injectPipButton(v);
        });
      }
    } else {
      const videos = document.querySelectorAll('video');
      videos.forEach((video) => {
        setupMediaSession(video);
        injectPipButton(video);
      });
    }
  }

  initMediaController();

  // ---------------------------------------------------------------------------
  // 5. Robust Debounced & Circuit-Protected MutationObserver
  // ---------------------------------------------------------------------------

  let mutationCount = 0;
  let lastResetTime = Date.now();
  const MAX_MUTATIONS_PER_SEC = 50;
  const pendingNodes = new Set();

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const debouncedInit = debounce(() => {
    if (!videoObserver) return;
    
    try {
      videoObserver.disconnect();
    } catch (e) {}

    const nodesToProcess = Array.from(pendingNodes);
    pendingNodes.clear();

    nodesToProcess.forEach((node) => {
      initMediaController(node);
    });

    // Fallback scan document videos
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if (video.dataset.pipButtonInjected !== 'true' || video.dataset.mediaSessionInjected !== 'true') {
        setupMediaSession(video);
        injectPipButton(video);
      }
    });

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

    let hasAddedElements = false;
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      if (added && added.length > 0) {
        for (let j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) {
            pendingNodes.add(added[j]);
            hasAddedElements = true;
          }
        }
      }
    }

    if (hasAddedElements) {
      debouncedInit();
    }
  });

  if (document.body) {
    videoObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // 6. Message Listener
  // ---------------------------------------------------------------------------

  extensionAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;

    if (message.action === 'TOGGLE_PIP') {
      const video = document.querySelector('video');
      if (video) {
        togglePictureInPicture(video);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, reason: 'No video element found' });
      }
      return true;
    }

    if (message.action === 'ADBLOCK_STATE_CHANGED') {
      isAdBlockEnabledForSite = message.enabled;
      if (isAdBlockEnabledForSite) {
        injectAdBlockStyles();
      } else {
        removeAdBlockStyles();
      }
      sendResponse({ success: true });
      return true;
    }

    return false;
  });
})();


