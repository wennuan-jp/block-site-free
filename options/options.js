// options.js

const patternInput = document.getElementById('patternInput');
const addBtn = document.getElementById('addBtn');
const blockedList = document.getElementById('blockedList');

// Load existing patterns on startup
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['blockedPatterns', 'whiteList'], (result) => {
        renderList('blockedPatterns', result.blockedPatterns || []);
        renderList('whiteList', result.whiteList || []);
    });
});

// Helper for adding patterns
function addPattern(storageKey, inputId) {
    const input = document.getElementById(inputId);
    const pattern = input.value.trim();
    if (!pattern) return;

    chrome.storage.local.get([storageKey], (result) => {
        let patterns = result[storageKey] || [];
        
        let normalizedPattern = pattern;
        // Only normalize for blockedPatterns (base domain)
        // White list should be more specific
        if (storageKey === 'blockedPatterns') {
            try {
                const url = new URL(pattern.startsWith('http') ? pattern : 'https://' + pattern);
                const parts = url.hostname.split('.');
                normalizedPattern = parts.length > 2 ? parts.slice(-2).join('.') : url.hostname;
            } catch (e) {
                const parts = pattern.split('.');
                if (parts.length > 2) normalizedPattern = parts.slice(-2).join('.');
            }
        }

        if (!patterns.includes(normalizedPattern)) {
            const updatedPatterns = [...patterns, normalizedPattern];
            chrome.storage.local.set({ [storageKey]: updatedPatterns }, () => {
                input.value = '';
                renderList(storageKey, updatedPatterns);
            });
        }
    });
}

// Add new patterns
addBtn.addEventListener('click', () => addPattern('blockedPatterns', 'patternInput'));
document.getElementById('addWhiteBtn').addEventListener('click', () => addPattern('whiteList', 'whiteListInput'));

// Delete pattern
function deletePattern(storageKey, pattern) {
    chrome.storage.local.get([storageKey], (result) => {
        const patterns = result[storageKey] || [];
        const updatedPatterns = patterns.filter(p => p !== pattern);
        chrome.storage.local.set({ [storageKey]: updatedPatterns }, () => {
            renderList(storageKey, updatedPatterns);
        });
    });
}

// Render the list of patterns
function renderList(storageKey, patterns) {
    const listElement = storageKey === 'blockedPatterns' ? blockedList : document.getElementById('whiteList');
    listElement.innerHTML = '';
    patterns.forEach(pattern => {
        const li = document.createElement('li');
        
        const span = document.createElement('span');
        span.className = 'pattern-text';
        span.textContent = pattern;
        
        const btn = document.createElement('button');
        btn.className = 'delete-btn';
        btn.textContent = 'Remove';
        btn.onclick = () => deletePattern(storageKey, pattern);
        
        li.appendChild(span);
        li.appendChild(btn);
        listElement.appendChild(li);
    });
}

// Listen for storage changes to keep UI in sync
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.blockedPatterns) {
            renderList('blockedPatterns', changes.blockedPatterns.newValue || []);
        }
        if (changes.whiteList) {
            renderList('whiteList', changes.whiteList.newValue || []);
        }
    }
});

// Allow pressing Enter to add
patternInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addBtn.click();
});
document.getElementById('whiteListInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('addWhiteBtn').click();
});
