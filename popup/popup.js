// popup.js

const currentUrlElement = document.getElementById('currentUrl');
const blockBtn = document.getElementById('blockBtn');
const cancelBtn = document.getElementById('cancelBtn');

let currentHost = '';

// Get active tab URL and process it
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
        try {
            const url = new URL(tabs[0].url);
            // We want to block the domain
            currentHost = url.hostname.replace(/^www\./, '');
            currentUrlElement.textContent = currentHost;
            
            // Check if already blocked
            chrome.storage.local.get(['blockedPatterns'], (result) => {
                const patterns = result.blockedPatterns || [];
                if (patterns.includes(currentHost)) {
                    currentUrlElement.textContent = `${currentHost} (Blocked)`;
                    blockBtn.disabled = true;
                    blockBtn.style.opacity = '0.5';
                    blockBtn.textContent = 'Blocked';
                }
            });
        } catch (e) {
            currentUrlElement.textContent = 'Invalid URL';
            blockBtn.disabled = true;
        }
    }
});

blockBtn.addEventListener('click', () => {
    if (!currentHost || blockBtn.disabled) return;

    // Show loading state
    const originalText = blockBtn.textContent;
    blockBtn.textContent = 'Blocking...';
    blockBtn.disabled = true;
    cancelBtn.disabled = true;
    blockBtn.style.opacity = '0.7';
    cancelBtn.style.opacity = '0.5';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            console.log('Requesting block for:', currentHost, 'on tab:', tabs[0].id);
            chrome.runtime.sendMessage({
                type: 'ADD_BLOCK_AND_RELOAD',
                host: currentHost,
                tabId: tabs[0].id
            }, (response) => {
                console.log('Background response:', response);
                // The page is reloading behind us, we can close now
                setTimeout(() => {
                    window.close();
                }, 300); // Tiny delay to feel more natural
            });
        } else {
            // Revert state if tab not found
            blockBtn.textContent = originalText;
            blockBtn.disabled = false;
            cancelBtn.disabled = false;
            blockBtn.style.opacity = '1';
            cancelBtn.style.opacity = '1';
        }
    });
});

cancelBtn.addEventListener('click', () => {
    window.close();
});
