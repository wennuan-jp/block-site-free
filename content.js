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

/**
 * Extracts the hostname from a URL.
 */
function getHostname(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.toLowerCase();
    } catch (e) {
        // Fallback if URL is already normalized or invalid
        let host = url.replace(/^(http|https):\/\//, '').split('/')[0];
        return host.split(/[?#]/)[0].toLowerCase();
    }
}

function checkAndBlock() {
    const currentUrl = window.location.href.toLowerCase();
    const currentUrlNormalized = normalizePattern(currentUrl);
    const currentHostname = getHostname(currentUrl);
    
    chrome.storage.local.get(['blockedPatterns', 'whiteList', 'temporaryBypass'], (result) => {
        const blockedPatterns = result.blockedPatterns || [];
        const whiteList = result.whiteList || [];
        const bypasses = result.temporaryBypass || {};
        
        // Helper to check if a pattern matches the current URL
        const matchesPattern = (pattern) => {
            const cleanPattern = pattern.toLowerCase().trim();
            if (!cleanPattern) return false;

            // Split pattern into host and path
            let patternHost = cleanPattern;
            let patternPath = '';
            const slashIndex = cleanPattern.indexOf('/');
            if (slashIndex !== -1) {
                patternHost = cleanPattern.substring(0, slashIndex);
                patternPath = cleanPattern.substring(slashIndex);
            }

            // 1. Check Domain Match
            // Handle both exact match and subdomain match (e.g., google.com matches www.google.com)
            const domainMatches = currentHostname === patternHost || currentHostname.endsWith('.' + patternHost);
            if (!domainMatches) return false;

            // 2. Check Path Match (if pattern has a path)
            if (patternPath && patternPath !== '/') {
                const currentPath = window.location.pathname.toLowerCase().replace(/\/+$/, '');
                const cleanPatternPath = patternPath.replace(/\/+$/, '');
                // Match exact path or sub-paths
                return currentPath === cleanPatternPath || currentPath.startsWith(cleanPatternPath + '/');
            }

            return true;
        };

        // 1. Check if current URL matches any blocked pattern
        const isBlocked = blockedPatterns.some(matchesPattern);
        
        if (isBlocked) {
            // Check for bypass (BY DOMAIN)
            const now = Date.now();
            let activeBypass = null;
            
            // Check if there's an active bypass for this hostname
            if (bypasses[currentHostname] && bypasses[currentHostname].endTime > now) {
                activeBypass = bypasses[currentHostname];
            }
            
            if (activeBypass) {
                console.log('ZenBlock: Bypass active, allowing access:', currentUrl);
                showIntentionOverlay(activeBypass.intention, activeBypass.endTime);
                
                // Set reload timer
                const timeRemaining = activeBypass.endTime - now;
                setTimeout(() => {
                    window.location.reload();
                }, timeRemaining);
                
                return;
            }

            // 2. Check if the URL is in the white list
            const isWhitelisted = whiteList.some(matchesPattern);

            if (!isWhitelisted) {
                console.log('ZenBlock: Redirecting barred site:', currentUrl);
                const blockedUrl = encodeURIComponent(window.location.href);
                window.location.href = chrome.runtime.getURL('blocked.html?url=' + blockedUrl);
            } else {
                console.log('ZenBlock: Site is whitelisted, allowing access:', currentUrl);
            }
        }
    });
}

function showIntentionOverlay(intention, endTime) {
    if (document.getElementById('zenblock-intention-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'zenblock-intention-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        backgroundColor: 'rgba(10, 10, 10, 0.85)',
        color: '#ffffff',
        padding: '12px 18px',
        borderRadius: '8px',
        zIndex: '2147483647',
        fontSize: '13px',
        fontFamily: '"Inter", -apple-system, sans-serif',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'auto',
        animation: 'zenFadeIn 0.5s ease-out'
    });

    const intentionEl = document.createElement('div');
    intentionEl.style.fontWeight = '500';
    intentionEl.textContent = `Focus: ${intention}`;
    
    const timerEl = document.createElement('div');
    timerEl.style.fontSize = '11px';
    timerEl.style.opacity = '0.6';
    timerEl.id = 'zenblock-timer';

    const completeBtn = document.createElement('button');
    completeBtn.textContent = 'Task Complete';
    Object.assign(completeBtn.style, {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        color: '#3b82f6',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '11px',
        cursor: 'pointer',
        marginTop: '4px',
        transition: 'all 0.2s ease',
        textAlign: 'center'
    });
    completeBtn.onmouseover = () => {
        completeBtn.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
    };
    completeBtn.onmouseout = () => {
        completeBtn.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
    };
    completeBtn.onclick = () => {
        const hostname = getHostname(window.location.href);
        chrome.runtime.sendMessage({
            type: 'END_BYPASS',
            hostname: hostname
        }, (response) => {
            if (response && response.success) {
                window.location.reload();
            }
        });
    };

    overlay.appendChild(intentionEl);
    overlay.appendChild(timerEl);
    overlay.appendChild(completeBtn);
    document.documentElement.appendChild(overlay);

    // Style for animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes zenFadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    (document.head || document.documentElement).appendChild(style);

    function updateTimer() {
        const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        timerEl.textContent = `Ends in ${minutes}:${seconds.toString().padStart(2, '0')}`;
        if (remaining > 0) {
            setTimeout(updateTimer, 1000);
        }
    }
    updateTimer();
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
