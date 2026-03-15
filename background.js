// background.js

// Initialize storage on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['blockedPatterns'], (result) => {
    if (!result.blockedPatterns) {
      chrome.storage.local.set({ blockedPatterns: [] });
    }
  });
});

// Watch for changes in blockedPatterns to update declarativeNetRequest rules
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.blockedPatterns) {
    updateBlockingRules(changes.blockedPatterns.newValue);
  }
});

// Queue for rule updates to avoid race conditions
let isUpdatingRules = false;
let pendingRulesUpdate = null;

/**
 * Updates the declarativeNetRequest rules based on the provided patterns.
 * @param {string[]} patterns 
 */
async function updateBlockingRules(patterns) {
  if (isUpdatingRules) {
    // If already updating, store the latest patterns to update again after
    pendingRulesUpdate = patterns;
    return;
  }

  isUpdatingRules = true;
  try {
    // Get all existing dynamic rules
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldRuleIds = oldRules.map(rule => rule.id);

    // Create new rules
    const newRules = patterns.map((pattern, index) => {
      return {
        id: index + 1, // IDs must be >= 1
        priority: 999, // High priority to ensure it blocks
        action: {
          type: 'redirect',
          redirect: { extensionPath: '/blocked.html' }
        },
        condition: {
          urlFilter: pattern, // Substring match
          resourceTypes: ['main_frame']
        }
      };
    });

    // Update rules: remove all old and add all new
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldRuleIds,
      addRules: newRules
    });
    
    console.log('Blocking rules updated:', newRules);
  } finally {
    isUpdatingRules = false;
    if (pendingRulesUpdate) {
      const nextPatterns = pendingRulesUpdate;
      pendingRulesUpdate = null;
      await updateBlockingRules(nextPatterns);
    }
  }
}

// Ensure rules are up to date on startup
chrome.runtime.onStartup.addListener(async () => {
  const result = await chrome.storage.local.get(['blockedPatterns']);
  if (result.blockedPatterns) {
    await updateBlockingRules(result.blockedPatterns);
  }
});

// Listen for messages from popup to ensure sequence: Update Rules -> Reload Tab
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ADD_BLOCK_AND_RELOAD') {
    const { host, tabId } = message;
    
    // Execute async logic
    (async () => {
      try {
        const result = await chrome.storage.local.get(['blockedPatterns']);
        const patterns = result.blockedPatterns || [];
        
        let updatedPatterns = patterns;
        if (!patterns.includes(host)) {
          updatedPatterns = [...patterns, host];
          // 1. Save to storage FIRST
          await chrome.storage.local.set({ blockedPatterns: updatedPatterns });
        }
        
        // 2. Explicitly update blocking rules and WAIT for completion
        // Even if already blocked, we update/verify rules to be safe
        await updateBlockingRules(updatedPatterns);
        
        // 3. Small delay to ensure browser engine propagates the new rule
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // 4. Reload the tab
        if (tabId) {
          await chrome.tabs.reload(tabId);
        }
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('Blocking failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();

    return true; // Keep message channel open
  }
});
