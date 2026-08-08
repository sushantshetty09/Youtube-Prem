/**
 * Background Service Worker — Integrated Media Controller Extension
 * Manages Declarative Net Request (DNR) dynamic rules and persistent extension state.
 */

const extensionAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

function generateRuleIdForDomain(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    const char = domain.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash) + 1000;
}

extensionAPI.runtime.onInstalled.addListener(() => {
  extensionAPI.storage.local.get(['adBlockEnabled', 'siteOverrides'], (result) => {
    const initialState = {
      adBlockEnabled: result && result.adBlockEnabled !== undefined ? result.adBlockEnabled : true,
      siteOverrides: (result && result.siteOverrides) || {}
    };
    extensionAPI.storage.local.set(initialState, () => {
      console.log('Integrated Media Controller initialization complete.');
    });
  });
});

async function toggleAdBlockForSite(domain, enabled) {
  if (!domain) return;

  const storageData = await new Promise((resolve) => {
    extensionAPI.storage.local.get(['siteOverrides'], (res) => resolve(res || {}));
  });
  
  const siteOverrides = storageData.siteOverrides || {};
  siteOverrides[domain] = enabled;

  await new Promise((resolve) => {
    extensionAPI.storage.local.set({ siteOverrides }, () => resolve());
  });

  const ruleId = generateRuleIdForDomain(domain);

  if (extensionAPI.declarativeNetRequest && extensionAPI.declarativeNetRequest.updateDynamicRules) {
    if (enabled) {
      await extensionAPI.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ruleId]
      });
      console.log(`Ad blocking enabled for domain: ${domain}`);
    } else {
      const allowRule = {
        id: ruleId,
        priority: 10,
        action: { type: 'allowAllRequests' },
        condition: { initiatorDomains: [domain] }
      };

      await extensionAPI.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ruleId],
        addRules: [allowRule]
      });
      console.log(`Ad blocking disabled for domain: ${domain}`);
    }
  }
}

extensionAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  if (message.action === 'GET_SITE_STATUS') {
    extensionAPI.storage.local.get(['adBlockEnabled', 'siteOverrides'], (data) => {
      const globalEnabled = !data || data.adBlockEnabled !== false;
      const overrides = (data && data.siteOverrides) || {};
      const domainOverride = overrides[message.domain];
      const isEnabled = domainOverride !== undefined ? domainOverride : globalEnabled;

      sendResponse({ enabled: isEnabled });
    });
    return true;
  }

  if (message.action === 'TOGGLE_SITE_ADBLOCK') {
    toggleAdBlockForSite(message.domain, message.enabled)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.warn('Failed to update dynamic rules:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  return false;
});
