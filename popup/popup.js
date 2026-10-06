// popup.js

const currentUrlElement = document.getElementById('currentUrl');
const siteStatusBadge = document.getElementById('siteStatusBadge');
const levelConfigSection = document.getElementById('levelConfigSection');
const optBlocked = document.getElementById('optBlocked');
const optForbidden = document.getElementById('optForbidden');
const defaultActions = document.getElementById('defaultActions');
const manageActions = document.getElementById('manageActions');
const blockBtn = document.getElementById('blockBtn');
const switchLevelBtn = document.getElementById('switchLevelBtn');
const unblockBtn = document.getElementById('unblockBtn');
const whitelistBtn = document.getElementById('whitelistBtn');
const optionsBtn = document.getElementById('optionsBtn');
const activeModelLabel = document.getElementById('activeModelLabel');

optionsBtn.onclick = () => chrome.runtime.openOptionsPage();

let currentHost = '';
let currentTabId = null;
let currentFullUrl = '';
let selectedLevel = 'blocked'; // 'blocked' | 'forbidden'
let siteStatus = 'none'; // 'none' | 'blocked' | 'forbidden' | 'whitelisted'

// Level selection UI
optBlocked.addEventListener('click', () => {
    selectedLevel = 'blocked';
    optBlocked.className = 'level-btn active-blocked';
    optForbidden.className = 'level-btn';
    blockBtn.className = 'main-btn';
    blockBtn.textContent = 'Block (AI Review)';
});

optForbidden.addEventListener('click', () => {
    selectedLevel = 'forbidden';
    optForbidden.className = 'level-btn active-forbidden';
    optBlocked.className = 'level-btn';
    blockBtn.className = 'main-btn btn-forbidden';
    blockBtn.textContent = 'Block (Forbidden)';
});

// Query active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].url) {
        currentUrlElement.textContent = 'No active tab';
        disableAll();
        return;
    }

    currentTabId = tabs[0].id;

    try {
        const url = new URL(tabs[0].url);
        if (!['http:', 'https:'].includes(url.protocol)) {
            currentUrlElement.textContent = 'Browser Internal Page';
            disableAll();
            return;
        }

        currentHost = url.hostname.toLowerCase();
        currentFullUrl = currentHost + url.pathname.replace(/\/+$/, '');
        currentUrlElement.textContent = currentHost;

        chrome.storage.local.get(['blockedPatterns', 'forbiddenPatterns', 'whiteList', 'lmStudioConfig'], (result) => {
            const blockedPatterns = result.blockedPatterns || [];
            const forbiddenPatterns = result.forbiddenPatterns || [];
            const whiteList = result.whiteList || [];
            const lmConfig = result.lmStudioConfig || {};

            if (activeModelLabel) {
                const model = lmConfig.modelName ? lmConfig.modelName : 'LM Studio (Auto)';
                activeModelLabel.textContent = `AI: ${model}`;
                activeModelLabel.title = `Model: ${model}\nBase URL: ${lmConfig.baseUrl || 'http://127.0.0.1:1234'}`;
            }

            const isForbidden = forbiddenPatterns.some(p => {
                const clean = p.toLowerCase().trim();
                return clean && (currentHost === clean || currentHost.endsWith('.' + clean));
            });

            const isBlocked = blockedPatterns.some(p => {
                const clean = p.toLowerCase().trim();
                return clean && (currentHost === clean || currentHost.endsWith('.' + clean));
            });

            const isWhitelisted = whiteList.includes(currentFullUrl) || whiteList.includes(currentHost);

            if (isForbidden) {
                siteStatus = 'forbidden';
                siteStatusBadge.textContent = 'Forbidden';
                siteStatusBadge.className = 'status-badge badge-forbidden';
                levelConfigSection.style.display = 'none';
                defaultActions.style.display = 'none';
                manageActions.style.display = 'flex';
                switchLevelBtn.textContent = 'Switch to AI Review';
            } else if (isBlocked) {
                siteStatus = 'blocked';
                siteStatusBadge.textContent = 'Blocked (AI)';
                siteStatusBadge.className = 'status-badge badge-blocked';
                levelConfigSection.style.display = 'none';
                defaultActions.style.display = 'none';
                manageActions.style.display = 'flex';
                switchLevelBtn.textContent = 'Make Forbidden';
            } else if (isWhitelisted) {
                siteStatus = 'whitelisted';
                siteStatusBadge.textContent = 'Whitelisted';
                siteStatusBadge.className = 'status-badge badge-whitelist';
                whitelistBtn.disabled = true;
                whitelistBtn.style.opacity = '0.5';
                whitelistBtn.textContent = 'Already Whitelisted';
            } else {
                siteStatus = 'none';
                siteStatusBadge.textContent = 'Allowed';
                siteStatusBadge.className = 'status-badge badge-none';
                blockBtn.textContent = 'Block (AI Review)';
            }
        });
    } catch (e) {
        currentUrlElement.textContent = 'Invalid URL';
        disableAll();
    }
});

function disableAll() {
    blockBtn.disabled = true;
    whitelistBtn.disabled = true;
    optBlocked.style.pointerEvents = 'none';
    optForbidden.style.pointerEvents = 'none';
}

// Block button handler
blockBtn.addEventListener('click', () => {
    if (!currentHost || blockBtn.disabled) return;

    blockBtn.textContent = 'Applying...';
    blockBtn.disabled = true;

    chrome.runtime.sendMessage({
        type: 'ADD_BLOCK_AND_RELOAD',
        host: currentHost,
        tabId: currentTabId,
        level: selectedLevel
    }, (response) => {
        setTimeout(() => window.close(), 250);
    });
});

// Switch Level Handler
switchLevelBtn.addEventListener('click', () => {
    if (!currentHost) return;
    const newLevel = siteStatus === 'forbidden' ? 'blocked' : 'forbidden';
    switchLevelBtn.disabled = true;
    switchLevelBtn.textContent = 'Updating...';

    chrome.runtime.sendMessage({
        type: 'SET_PATTERN_LEVEL',
        pattern: currentHost,
        level: newLevel
    }, (res) => {
        if (currentTabId) {
            chrome.tabs.reload(currentTabId, () => window.close());
        } else {
            window.close();
        }
    });
});

// Unblock button handler
unblockBtn.addEventListener('click', () => {
    if (!currentHost) return;
    unblockBtn.disabled = true;
    unblockBtn.textContent = 'Unblocking...';

    chrome.runtime.sendMessage({
        type: 'REMOVE_PATTERN',
        pattern: currentHost
    }, (res) => {
        if (currentTabId) {
            chrome.tabs.reload(currentTabId, () => window.close());
        } else {
            window.close();
        }
    });
});

// Whitelist button handler
whitelistBtn.addEventListener('click', () => {
    if (!currentHost) return;
    chrome.runtime.sendMessage({
        type: 'ADD_TO_WHITELIST',
        url: currentFullUrl || currentHost
    }, () => {
        if (currentTabId) {
            chrome.tabs.reload(currentTabId, () => window.close());
        } else {
            window.close();
        }
    });
});
