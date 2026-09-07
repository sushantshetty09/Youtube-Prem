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
  // Observer Control Helpers (Safe DOM Modifications)
  // ---------------------------------------------------------------------------
  let videoObserver = null;
  let isCircuitBroken = false;

  const OBSERVER_CONFIG = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  };

  function withObserverPaused(fn) {
    if (videoObserver && !isCircuitBroken) {
      try {
        videoObserver.disconnect();
      } catch (e) {}
    }
    try {
      fn();
    } finally {
      if (videoObserver && !isCircuitBroken && (document.body || document.documentElement)) {
        try {
          videoObserver.observe(document.body || document.documentElement, OBSERVER_CONFIG);
        } catch (e) {}
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Instant CSS Injection Ad Hiding
  // ---------------------------------------------------------------------------

  const AD_CSS_RULES = `
    .ad-showing .ytp-ad-player-overlay,
    .ad-showing .ytp-ad-player-overlay-layout,
    .ad-showing .ytp-ad-text,
    .ad-showing .ytp-ad-preview-text,
    .ad-showing .ytp-ad-preview-container,
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

    /* Prevent click-through bubbling on PiP button elements */
    .imc-pip-toggle-btn * {
      pointer-events: none !important;
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
      background: #000000 !important;
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
    withObserverPaused(() => {
      const style = document.createElement('style');
      style.id = 'imc-adblock-styles';
      style.textContent = AD_CSS_RULES;
      (document.head || document.documentElement).appendChild(style);
    });
  }

  function removeAdBlockStyles() {
    const style = document.getElementById('imc-adblock-styles');
    if (style) {
      withObserverPaused(() => {
        style.remove();
      });
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

    // Dismiss YouTube anti-adblock modal if present
    const adBlockDialog = document.querySelector('ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(.ytd-enforcement-message-view-model)');
    if (adBlockDialog) {
      const dismissBtn = adBlockDialog.querySelector('#dismiss-button, yt-button-renderer, button');
      if (dismissBtn) {
        try { dismissBtn.click(); } catch (e) {}
      }
      try { adBlockDialog.remove(); } catch (e) {}
    }

    const moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (!moviePlayer) return;

    const isAdShowing =
      moviePlayer.classList.contains('ad-showing') ||
      moviePlayer.classList.contains('ad-interrupting') ||
      !!moviePlayer.querySelector('.ytp-ad-player-overlay') ||
      !!moviePlayer.querySelector('.ytp-ad-player-overlay-layout') ||
      !!moviePlayer.querySelector('.ytp-ad-preview-container') ||
      !!moviePlayer.querySelector('.ytp-ad-text');

    const video = moviePlayer.querySelector('video');

    if (isAdShowing) {
      if (typeof moviePlayer.skipAd === 'function') {
        try {
          moviePlayer.skipAd();
        } catch (e) {}
      }

      // Comprehensive modern YouTube skip buttons
      const skipButtons = moviePlayer.querySelectorAll(`
        .ytp-ad-skip-button,
        .ytp-ad-skip-button-modern,
        .ytp-skip-ad-button,
        button.ytp-ad-skip-button-icon,
        button.ytp-ad-skip-button-modern,
        .ytp-ad-skip-button-slot button,
        [id^="skip-button:"]
      `);

      skipButtons.forEach((btn) => {
        if (btn && typeof btn.click === 'function') {
          try {
            btn.click();
          } catch (e) {}
        }
      });

      const closeOverlayButtons = moviePlayer.querySelectorAll('.ytp-ad-overlay-close-button, .ytp-ad-text-overlay .ytp-ad-overlay-close-button');
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
          if (video.duration && isFinite(video.duration) && video.currentTime < video.duration - 0.05) {
            video.currentTime = video.duration - 0.01;
          }
          if (video.playbackRate !== 16.0) {
            video.playbackRate = 16.0;
          }
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
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="%23ff0000"/><path d="M192 128l192 128-192 128V128z" fill="%23ffffff"/></svg>';

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

  async function togglePictureInPicture(video) {
    if (!video) {
      video = document.querySelector('#movie_player video, .html5-main-video, video');
    }
    if (!video) {
      console.warn('Integrated Media Controller: No video element found for Picture-in-Picture.');
      return;
    }

    // Ensure Picture-in-Picture is allowed on this video
    if (video.hasAttribute('disablepictureinpicture')) {
      video.removeAttribute('disablepictureinpicture');
    }
    video.disablePictureInPicture = false;

    // If already in native PiP, exit it
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
        return;
      } catch (err) {
        console.warn('Failed to exit native Picture-in-Picture:', err);
      }
    }

    // 1. Try native Picture-in-Picture API
    if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
      try {
        await video.requestPictureInPicture();
        return;
      } catch (error) {
        console.warn('Native Picture-in-Picture request failed:', error);
      }
    }

    // 2. On YouTube: try YouTube native Miniplayer button (minimizes video to bottom corner)
    if (isYouTube) {
      const ytMiniplayerBtn = document.querySelector('.ytp-miniplayer-button');
      if (ytMiniplayerBtn) {
        try {
          ytMiniplayerBtn.click();
          return;
        } catch (e) {}
      }
      const moviePlayer = document.getElementById('movie_player');
      if (moviePlayer) {
        try {
          const keyEvt = new KeyboardEvent('keydown', {
            key: 'i',
            code: 'KeyI',
            keyCode: 73,
            which: 73,
            bubbles: true,
            cancelable: true
          });
          moviePlayer.dispatchEvent(keyEvt);
          return;
        } catch (e) {}
      }
    }

    // 3. Fallback: In-page floating overlay
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
      playerContainer.classList.add('imc-inpage-pip');
      const pipBtn = playerContainer.querySelector('.imc-pip-toggle-btn');
      if (pipBtn) {
        pipBtn.classList.add('imc-active');
      }
    }
  }

  function injectYouTubeBottomControlBtn(moviePlayer, video) {
    if (!moviePlayer) return;
    const rightControls = moviePlayer.querySelector('.ytp-right-controls');
    if (!rightControls || rightControls.querySelector('.imc-ytp-pip-button')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ytp-button imc-ytp-pip-button';
    btn.title = 'Picture-in-Picture / Minimize (P)';
    btn.setAttribute('aria-label', 'Picture-in-Picture / Minimize (P)');
    btn.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 36 36">
        <path fill="#fff" d="M25,17 L17,17 L17,23 L25,23 L25,17 Z M29,25 L29,11 C29,9.9 28.1,9 27,9 L9,9 C7.9,9 7,9.9 7,11 L7,25 C7,26.1 7.9,27 9,27 L27,27 C28.1,27 29,26.1 29,25 Z M27,25 L9,25 L9,11 L27,11 L27,25 Z"/>
      </svg>
    `;
    btn.style.width = '48px';
    btn.style.height = '100%';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.cursor = 'pointer';
    btn.style.verticalAlign = 'top';

    btn.addEventListener('click', async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const targetVideo = moviePlayer.querySelector('video') || video;
      await togglePictureInPicture(targetVideo);
    });

    const fsBtn = rightControls.querySelector('.ytp-fullscreen-button') || rightControls.lastElementChild;
    if (fsBtn) {
      rightControls.insertBefore(btn, fsBtn);
    } else {
      rightControls.appendChild(btn);
    }
  }

  function injectPipButton(video) {
    if (!document.pictureInPictureEnabled || !video) return;

    // Do NOT inject inside miniplayers, preview hover cards, thumbnails, ads, or link wrappers
    if (video.closest && (
      video.closest('ytd-miniplayer, .ytp-miniplayer, #miniplayer') ||
      video.closest('ytd-thumbnail, #inline-preview-player, ytd-video-preview, .ytd-moving-thumbnail-renderer') ||
      video.closest('a') ||
      video.closest('.ad-showing')
    )) {
      return;
    }

    // On YouTube, restrict injection strictly to the primary video player
    if (isYouTube && !video.closest('#movie_player, .html5-video-player')) {
      return;
    }

    const parent = video.closest ? (video.closest('#movie_player') || video.closest('.html5-video-player') || video.parentElement) : (video.parentElement || video.parentNode);
    if (!parent) return;

    if (parent.closest && parent.closest('a')) return;

    // If on YouTube, also inject the bottom control bar button
    if (isYouTube && parent.id === 'movie_player') {
      injectYouTubeBottomControlBtn(parent, video);
    }

    if (parent.querySelector('.imc-pip-toggle-btn')) return;

    video.dataset.pipButtonInjected = 'true';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'imc-pip-toggle-btn';
    button.title = 'Picture-in-Picture / Minimize (P)';
    button.setAttribute('aria-label', 'Picture-in-Picture / Minimize');
    button.setAttribute('tabindex', '0');
    button.innerHTML = `
      <svg width="20" height="14" viewBox="0 0 28 20" fill="none" style="pointer-events: none; flex-shrink: 0;">
        <path d="M27.4 3.1c-.3-1.2-1.2-2.1-2.4-2.4C22.9 0 14 0 14 0S5.1 0 3 0.7C1.8 1 0.9 1.9 0.6 3.1 0 5.2 0 10 0 10s0 4.8 0.6 6.9c.3 1.2 1.2 2.1 2.4 2.4 2.1.7 11 .7 11 .7s8.9 0 11-.7c1.2-.3 2.1-1.2 2.4-2.4.6-2.1.6-6.9.6-6.9s0-4.8-.6-6.9z" fill="#FF0000"/>
        <polygon points="11.2,14.3 18.5,10 11.2,5.7" fill="#FFFFFF"/>
      </svg>
      <span style="pointer-events: none;">Minimize (P)</span>
    `;

    Object.assign(button.style, {
      position: 'absolute',
      top: '16px',
      right: '68px',
      zIndex: '2147483647',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '7px 14px',
      backgroundColor: '#ffffff',
      color: '#0f0f0f',
      border: '1px solid rgba(0, 0, 0, 0.1)',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
      transition: 'all 0.2s ease',
      pointerEvents: 'auto',
      userSelect: 'none'
    });

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#f2f2f2';
      button.style.transform = 'scale(1.05)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = button.classList.contains('imc-active')
        ? '#ffebee'
        : '#ffffff';
      button.style.transform = 'scale(1)';
    });

    // Stop pointer/mouse events from propagating to YouTube player background
    // (Prevents pausing video or triggering link navigation, without canceling user activation)
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'auxclick'].forEach((evtType) => {
      button.addEventListener(evtType, (e) => {
        if (e) {
          e.stopPropagation();
        }
      }, { capture: true });
    });

    // Clean click listener that triggers Picture-in-Picture
    button.addEventListener('click', async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const targetVideo = (parent && parent.querySelector('video')) || video || document.querySelector('#movie_player video, .html5-main-video, video');
      await togglePictureInPicture(targetVideo);
    }, { capture: true });

    const computedPos = window.getComputedStyle(parent).position;
    if (computedPos === 'static') {
      parent.style.position = 'relative';
    }

    withObserverPaused(() => {
      parent.appendChild(button);
    });

    video.addEventListener('enterpictureinpicture', () => {
      button.classList.add('imc-active');
      button.style.backgroundColor = '#ffebee';
      button.style.borderColor = '#ff0000';
    });

    video.addEventListener('leavepictureinpicture', () => {
      button.classList.remove('imc-active');
      button.style.backgroundColor = '#ffffff';
      button.style.borderColor = 'rgba(0, 0, 0, 0.1)';
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
    if (isCircuitBroken) return;

    withObserverPaused(() => {
      const nodesToProcess = Array.from(pendingNodes);
      pendingNodes.clear();

      nodesToProcess.forEach((node) => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches && node.matches('video')) {
          setupMediaSession(node);
          injectPipButton(node);
        }
        if (node.querySelectorAll) {
          const videos = node.querySelectorAll('video');
          videos.forEach((v) => {
            setupMediaSession(v);
            injectPipButton(v);
          });
        }
      });
    });
  }, 200);

  function startObserver() {
    if (isCircuitBroken || videoObserver) return;

    videoObserver = new MutationObserver((mutations) => {
      const now = Date.now();
      if (now - lastResetTime > 1000) {
        mutationCount = 0;
        lastResetTime = now;
      }
      mutationCount++;

      if (mutationCount > MAX_MUTATIONS_PER_SEC) {
        console.warn('Integrated Media Controller: MutationObserver circuit breaker triggered (>50 mutations/sec). Disconnecting observer to prevent browser hang.');
        isCircuitBroken = true;
        if (videoObserver) {
          videoObserver.disconnect();
          videoObserver = null;
        }
        pendingNodes.clear();
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

    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      try {
        videoObserver.observe(targetNode, OBSERVER_CONFIG);
      } catch (e) {
        console.warn('Failed to start MutationObserver:', e);
      }
    }
  }

  // Initial setup of media controller
  initMediaController();
  startObserver();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initMediaController();
      startObserver();
    }, { once: true });
  }

  // ---------------------------------------------------------------------------
  // 6. Keyboard Shortcut ('P' for Minimize / Picture-in-Picture)
  // ---------------------------------------------------------------------------

  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.isContentEditable ||
      active.getAttribute('role') === 'textbox'
    )) {
      return;
    }

    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const video = document.querySelector('#movie_player video, .html5-main-video, video');
      if (video) {
        e.preventDefault();
        togglePictureInPicture(video);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Message Listener
  // ---------------------------------------------------------------------------

  extensionAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;

    if (message.action === 'TOGGLE_PIP') {
      const video = document.querySelector('#movie_player video, .html5-main-video, video');
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
