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
export function normalizePattern(url) {
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

// Listen for messages from popup to reload tab after blocking
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
        console.error('Reload failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();

    return true; // Keep message channel open
  }
});
