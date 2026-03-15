// content.js
// Immediate check for blocked sites using a simple "contains" logic

function checkAndBlock() {
    const currentUrl = window.location.href.toLowerCase();
    
    chrome.storage.local.get(['blockedPatterns'], (result) => {
        const patterns = result.blockedPatterns || [];
        
        const isBlocked = patterns.some(pattern => {
            const cleanPattern = pattern.toLowerCase().trim();
            return cleanPattern && currentUrl.includes(cleanPattern);
        });

        if (isBlocked) {
            console.log('ZenBlock: Redirecting barred site:', currentUrl);
            window.location.href = chrome.runtime.getURL('blocked.html');
        }
    });
}

// Run immediately and also listen for hash/history changes (for SPAs)
checkAndBlock();

// Observer for single-page application navigation
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        checkAndBlock();
    }
}).observe(document, { subtree: true, childList: true });
