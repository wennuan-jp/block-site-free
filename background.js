// background.js

// Initialize storage on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['blockedPatterns', 'whiteList'], (result) => {
    if (!result.blockedPatterns) {
      chrome.storage.local.set({ blockedPatterns: [] });
    }
    if (!result.whiteList) {
      chrome.storage.local.set({ whiteList: [] });
    }
    if (!result.temporaryBypass) {
      chrome.storage.local.set({ temporaryBypass: {} });
    }

    // Normalize existing patterns and whitelist on install/update
    const updates = {};
    if (result.blockedPatterns) {
      const normalizedBlocked = [...new Set(result.blockedPatterns.map(p => normalizePattern(p)))];
      if (JSON.stringify(normalizedBlocked) !== JSON.stringify(result.blockedPatterns)) {
        updates.blockedPatterns = normalizedBlocked;
      }
    }
    if (result.whiteList) {
      const normalizedWhite = [...new Set(result.whiteList.map(p => normalizePattern(p)))];
      if (JSON.stringify(normalizedWhite) !== JSON.stringify(result.whiteList)) {
        updates.whiteList = normalizedWhite;
      }
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
      console.log('Migrated storage patterns:', updates);
    }
  });
});



/**
 * Normalizes a URL/pattern by removing protocol, query parameters, fragments, and trailing slashes.
 * @param {string} url 
 * @returns {string}
 */
function normalizePattern(url) {
  if (!url) return '';
  // Remove protocol
  let normalized = url.replace(/^(http|https):\/\//, '');
  // Remove query parameters and fragments
  normalized = normalized.split(/[?#]/)[0];
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}


// Watch for changes (optional for logging/debugging)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    console.log('Storage changed:', changes);
  }
});

// Ensure basic initialization on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('ZenBlock background worker started.');
});

// Listen for messages from popup to reload tab after blocking or whitelisting
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ADD_BLOCK_AND_RELOAD') {
    const { host, tabId } = message;

    (async () => {
      try {
        const result = await chrome.storage.local.get(['blockedPatterns']);
        const patterns = result.blockedPatterns || [];

        if (!patterns.includes(host)) {
          const updatedPatterns = [...patterns, host];
          await chrome.storage.local.set({ blockedPatterns: updatedPatterns });
        }

        // Small delay to ensure storage propagates
        await new Promise(resolve => setTimeout(resolve, 150));

        // Reload the tab
        if (tabId) {
          await chrome.tabs.reload(tabId);
        }

        sendResponse({ success: true });
      } catch (error) {
        console.error('Block reload failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();

    return true; // Keep message channel open
  }

  if (message.type === 'ADD_TO_WHITELIST') {
    const { url } = message;
    const normalized = normalizePattern(url);

    (async () => {
      try {
        const result = await chrome.storage.local.get(['whiteList']);
        const whiteList = result.whiteList || [];

        if (!whiteList.includes(normalized)) {
          const updatedWhiteList = [...whiteList, normalized];
          await chrome.storage.local.set({ whiteList: updatedWhiteList });
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Whitelist update failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();

    return true; // Keep message channel open
  }

  if (message.type === 'START_BYPASS') {
    const { url, intention } = message;
    let hostname;
    try {
        hostname = new URL(url).hostname.toLowerCase();
    } catch (e) {
        hostname = url.replace(/^(http|https):\/\//, '').split('/')[0].split(/[?#]/)[0].toLowerCase();
    }
    
    const endTime = Date.now() + 5 * 60 * 1000;

    (async () => {
      try {
        const result = await chrome.storage.local.get(['temporaryBypass']);
        const bypasses = result.temporaryBypass || {};
        
        bypasses[hostname] = {
          endTime,
          intention
        };

        await chrome.storage.local.set({ temporaryBypass: bypasses });
        sendResponse({ success: true });
      } catch (error) {
        console.error('Bypass start failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }

  if (message.type === 'END_BYPASS') {
    const { hostname } = message;
    (async () => {
      try {
        const result = await chrome.storage.local.get(['temporaryBypass']);
        const bypasses = result.temporaryBypass || {};
        if (bypasses[hostname]) {
          delete bypasses[hostname];
          await chrome.storage.local.set({ temporaryBypass: bypasses });
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Bypass end failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }
});

// Periodic cleanup of bypasses (or just clean on load)
chrome.runtime.onStartup.addListener(async () => {
    const result = await chrome.storage.local.get(['temporaryBypass']);
    if (result.temporaryBypass) {
        const now = Date.now();
        const updatedBypasses = {};
        let changed = false;
        for (const [url, data] of Object.entries(result.temporaryBypass)) {
            if (data.endTime > now) {
                updatedBypasses[url] = data;
            } else {
                changed = true;
            }
        }
        if (changed) {
            await chrome.storage.local.set({ temporaryBypass: updatedBypasses });
        }
    }
});
