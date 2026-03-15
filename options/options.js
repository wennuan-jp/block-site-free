// options.js

const patternInput = document.getElementById('patternInput');
const addBtn = document.getElementById('addBtn');
const blockedList = document.getElementById('blockedList');

// Load existing patterns on startup
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['blockedPatterns'], (result) => {
        const patterns = result.blockedPatterns || [];
        renderList(patterns);
    });
});

// Add new pattern
addBtn.addEventListener('click', () => {
    const pattern = patternInput.value.trim();
    if (!pattern) return;

    chrome.storage.local.get(['blockedPatterns'], (result) => {
        let patterns = result.blockedPatterns || [];
        
        // Normalize the pattern: strip subdomains (e.g., m.douban.com -> douban.com)
        // This handles cases where user pastes a full domain with subdomains
        let normalizedPattern = pattern;
        try {
            // Check if it's a URL first
            const url = new URL(pattern.startsWith('http') ? pattern : 'https://' + pattern);
            const parts = url.hostname.split('.');
            normalizedPattern = parts.length > 2 ? parts.slice(-2).join('.') : url.hostname;
        } catch (e) {
            // fallback for simple strings if URL parsing fails
            const parts = pattern.split('.');
            if (parts.length > 2) normalizedPattern = parts.slice(-2).join('.');
        }

        if (!patterns.includes(normalizedPattern)) {
            const updatedPatterns = [...patterns, normalizedPattern];
            chrome.storage.local.set({ blockedPatterns: updatedPatterns }, () => {
                patternInput.value = '';
                renderList(updatedPatterns);
            });
        }
    });
});

// Delete pattern
function deletePattern(pattern) {
    chrome.storage.local.get(['blockedPatterns'], (result) => {
        const patterns = result.blockedPatterns || [];
        const updatedPatterns = patterns.filter(p => p !== pattern);
        chrome.storage.local.set({ blockedPatterns: updatedPatterns }, () => {
            renderList(updatedPatterns);
        });
    });
}

// Render the list of patterns
function renderList(patterns) {
    blockedList.innerHTML = '';
    patterns.forEach(pattern => {
        const li = document.createElement('li');
        
        const span = document.createElement('span');
        span.className = 'pattern-text';
        span.textContent = pattern;
        
        const btn = document.createElement('button');
        btn.className = 'delete-btn';
        btn.textContent = 'Remove';
        btn.onclick = () => deletePattern(pattern);
        
        li.appendChild(span);
        li.appendChild(btn);
        blockedList.appendChild(li);
    });
}

// Listen for storage changes to keep UI in sync
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.blockedPatterns) {
        renderList(changes.blockedPatterns.newValue || []);
    }
});

// Allow pressing Enter to add
patternInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addBtn.click();
    }
});
