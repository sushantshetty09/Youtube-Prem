/**
 * Popup Interface Script — Integrated Media Controller Extension
 * Manages user interface interactions, reads/writes per-site ad blocking state,
 * and dispatches Picture-in-Picture commands to content scripts.
 */

const extensionAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const domainBadge = document.getElementById('domain-badge');
  const adblockToggle = document.getElementById('adblock-toggle');
  const pipButton = document.getElementById('pip-button');

  let activeDomain = '';
  let activeTabId = null;

  try {
    const tabs = await new Promise((resolve) => {
      extensionAPI.tabs.query({ active: true, currentWindow: true }, (res) => resolve(res || []));
    });
    const tab = tabs[0];
    if (tab && tab.url) {
      activeTabId = tab.id;
      const url = new URL(tab.url);
      activeDomain = url.hostname;
      domainBadge.textContent = activeDomain || 'Web Page';
    } else {
      domainBadge.textContent = 'Active Tab';
    }
  } catch (error) {
    console.warn('Failed to retrieve active tab details:', error);
    domainBadge.textContent = 'Unknown Site';
  }

  if (activeDomain) {
    extensionAPI.runtime.sendMessage(
      { action: 'GET_SITE_STATUS', domain: activeDomain },
      (response) => {
        if (extensionAPI.runtime.lastError) {
          console.warn('Background status query error:', extensionAPI.runtime.lastError);
          return;
        }
        if (response && typeof response.enabled === 'boolean') {
          adblockToggle.checked = response.enabled;
        }
      }
    );
  }

  adblockToggle.addEventListener('change', () => {
    const isEnabled = adblockToggle.checked;
    if (!activeDomain) return;

    extensionAPI.runtime.sendMessage(
      {
        action: 'TOGGLE_SITE_ADBLOCK',
        domain: activeDomain,
        enabled: isEnabled
      },
      (response) => {
        if (extensionAPI.runtime.lastError) {
          console.warn('Ad block toggle message failed:', extensionAPI.runtime.lastError);
        }
      }
    );
  });

  pipButton.addEventListener('click', () => {
    if (!activeTabId) return;

    extensionAPI.tabs.sendMessage(activeTabId, { action: 'TOGGLE_PIP' }, (response) => {
      if (extensionAPI.runtime.lastError) {
        console.warn('PiP command delivery failure:', extensionAPI.runtime.lastError);
      }
    });
  });
});
