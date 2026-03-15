// content.js
// Immediate check for blocked sites using a simple "contains" logic

/**
 * Normalizes a URL/pattern by removing protocol, query parameters, fragments, and trailing slashes.
 */
function normalizePattern(url) {
    if (!url) return '';
    let normalized = url.replace(/^(http|https):\/\//, '');
    normalized = normalized.split(/[?#]/)[0];
    normalized = normalized.replace(/\/+$/, '');
    return normalized;
}

function checkAndBlock() {
    const currentUrl = window.location.href.toLowerCase();
    const currentUrlNormalized = normalizePattern(currentUrl);
    
    chrome.storage.local.get(['blockedPatterns', 'whiteList'], (result) => {
        const blockedPatterns = result.blockedPatterns || [];
        const whiteList = result.whiteList || [];
        
        // 1. Check if current URL matches any blocked pattern
        const isBlocked = blockedPatterns.some(pattern => {
            const cleanPattern = pattern.toLowerCase().trim();
            return cleanPattern && currentUrl.includes(cleanPattern);
        });

        if (isBlocked) {
            // 2. Check if the normalized URL is in the white list
            // Using "contains" logic for the normalized URL against whitelist items
            const isWhitelisted = whiteList.some(whiteItem => {
                const cleanWhite = normalizePattern(whiteItem.toLowerCase().trim());
                return cleanWhite && currentUrlNormalized.includes(cleanWhite);
            });

            if (!isWhitelisted) {
                console.log('ZenBlock: Redirecting barred site:', currentUrl);
                window.location.href = chrome.runtime.getURL('blocked.html');
            } else {
                console.log('ZenBlock: Site is whitelisted, allowing access:', currentUrl);
            }
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
