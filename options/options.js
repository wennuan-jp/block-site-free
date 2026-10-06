// options.js

const DEFAULT_BASE_URL = 'http://127.0.0.1:1234';

const DEFAULT_SYSTEM_PROMPT = `You are a strict productivity guardian AI. The user has intentionally blocked this website to avoid procrastination and stay focused on work or study.

The user wants temporary 5-minute access to this site and has provided their intention.

Judge whether the user's intention is valid, productive, or necessary for study/work/urgent tasks, or if it is merely procrastination, casual browsing, entertainment, or an evasive excuse.

Respond ONLY with a valid JSON object matching this schema:
{
  "valid": true or false,
  "reason": "A concise 1-2 sentence explanation of your judgment directly to the user."
}`;

// Elements - AI Config
const lmBaseUrlInput = document.getElementById('lmBaseUrlInput');
const chatPathPreview = document.getElementById('chatPathPreview');
const modelsPathPreview = document.getElementById('modelsPathPreview');
const lmTokenInput = document.getElementById('lmTokenInput');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const customModelWrapper = document.getElementById('customModelWrapper');
const customModelInput = document.getElementById('customModelInput');
const modelLoadedBadge = document.getElementById('modelLoadedBadge');
const lmPromptInput = document.getElementById('lmPromptInput');
const resetPromptBtn = document.getElementById('resetPromptBtn');
const testLmBtn = document.getElementById('testLmBtn');
const saveLmBtn = document.getElementById('saveLmBtn');
const testResultBox = document.getElementById('testResultBox');
const lmStatusIndicator = document.getElementById('lmStatusIndicator');

// Elements - Block Lists
const patternInput = document.getElementById('patternInput');
const levelSelect = document.getElementById('levelSelect');
const addBtn = document.getElementById('addBtn');
const blockedList = document.getElementById('blockedList');
const blockedCount = document.getElementById('blockedCount');
const forbiddenList = document.getElementById('forbiddenList');
const forbiddenCount = document.getElementById('forbiddenCount');

// Elements - Whitelist
const whiteListInput = document.getElementById('whiteListInput');
const addWhiteBtn = document.getElementById('addWhiteBtn');
const whiteList = document.getElementById('whiteList');
const whiteCount = document.getElementById('whiteCount');

let activeConfig = {
    baseUrl: DEFAULT_BASE_URL,
    modelName: '',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    token: ''
};

let cachedModels = [];

// Clean Base URL helper
function getCleanBaseUrl(url) {
    let clean = (url || DEFAULT_BASE_URL).trim();
    while (clean.endsWith('/')) {
        clean = clean.slice(0, -1);
    }
    if (clean.endsWith('/v1')) {
        clean = clean.slice(0, -3);
    }
    return clean || DEFAULT_BASE_URL;
}

// Update request path preview cards (matches LibGrow Client UI)
function updateRequestPathsPreview() {
    const cleanUrl = getCleanBaseUrl(lmBaseUrlInput.value);
    chatPathPreview.textContent = `${cleanUrl}/v1/chat/completions`;
    modelsPathPreview.textContent = `${cleanUrl}/api/v1/models`;
}

lmBaseUrlInput.addEventListener('input', updateRequestPathsPreview);

// Load settings on startup
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['blockedPatterns', 'forbiddenPatterns', 'whiteList', 'lmStudioConfig'], (result) => {
        // Load AI Config
        if (result.lmStudioConfig) {
            activeConfig = {
                baseUrl: result.lmStudioConfig.baseUrl || result.lmStudioConfig.endpoint?.replace(/\/v1$/, '') || DEFAULT_BASE_URL,
                modelName: result.lmStudioConfig.modelName ?? (result.lmStudioConfig.model || ''),
                systemPrompt: result.lmStudioConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT,
                token: result.lmStudioConfig.token || ''
            };
        }

        lmBaseUrlInput.value = activeConfig.baseUrl;
        lmPromptInput.value = activeConfig.systemPrompt;
        lmTokenInput.value = activeConfig.token || '';
        updateRequestPathsPreview();

        // Load Pattern Lists
        renderList('blockedPatterns', result.blockedPatterns || []);
        renderList('forbiddenPatterns', result.forbiddenPatterns || []);
        renderList('whiteList', result.whiteList || []);

        // Fetch models JIT (just like LibGrow Client queryModelsJit())
        refreshModels(true);
    });
});

// Fetch and populate LM Studio models
async function refreshModels(silent = false) {
    refreshModelsBtn.classList.add('spinning');
    const baseUrl = getCleanBaseUrl(lmBaseUrlInput.value);

    try {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'FETCH_LM_STUDIO_MODELS',
                baseUrl: baseUrl
            }, resolve);
        });

        refreshModelsBtn.classList.remove('spinning');

        if (!response) {
            if (!silent) showTestResult(false, 'No response received from background service.');
            return;
        }

        cachedModels = response.models || [];
        populateModelDropdown(activeConfig.modelName);

        const loadedCount = cachedModels.filter(m => m.isLoaded).length;
        if (response.success && cachedModels.length > 0) {
            lmStatusIndicator.textContent = 'Connected';
            lmStatusIndicator.className = 'status-pill status-connected';
            modelLoadedBadge.textContent = loadedCount > 0 ? `(${loadedCount} model loaded)` : '(No model currently loaded)';
            if (!silent) {
                showTestResult(true, `Successfully found ${cachedModels.length} model(s) in LM Studio (${loadedCount} loaded). Latency: ${response.latency}ms`);
            }
        } else {
            lmStatusIndicator.textContent = response.error ? 'Unreachable' : 'No Models';
            lmStatusIndicator.className = 'status-pill status-error';
            modelLoadedBadge.textContent = '';
            if (!silent) {
                showTestResult(false, response.error || 'LM Studio responded, but returned no available models. Please load an LLM in LM Studio.');
            }
        }
    } catch (err) {
        refreshModelsBtn.classList.remove('spinning');
        lmStatusIndicator.textContent = 'Error';
        lmStatusIndicator.className = 'status-pill status-error';
        if (!silent) {
            showTestResult(false, `Failed to reach LM Studio at ${baseUrl}: ${err.message}`);
        }
    }
}

// Populate the model dropdown
function populateModelDropdown(selectedModelName) {
    lmModelSelect.innerHTML = '';

    // Auto-detect option
    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = 'Auto-detect currently loaded model';
    lmModelSelect.appendChild(autoOption);

    let matchFound = false;

    // Add models
    cachedModels.forEach((model) => {
        const opt = document.createElement('option');
        opt.value = model.id;
        const icon = model.isLoaded ? '🟢' : '⚪';
        const tag = model.isLoaded ? ' [Loaded]' : '';
        opt.textContent = `${icon} ${model.displayName || model.id}${tag}`;
        if (model.id === selectedModelName) {
            opt.selected = true;
            matchFound = true;
        }
        lmModelSelect.appendChild(opt);
    });

    // Custom model option
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '✏️ Custom Model ID...';
    lmModelSelect.appendChild(customOpt);

    if (selectedModelName && !matchFound) {
        customOpt.selected = true;
        customModelWrapper.style.display = 'block';
        customModelInput.value = selectedModelName;
    } else {
        customModelWrapper.style.display = 'none';
        if (!selectedModelName) {
            autoOption.selected = true;
        }
    }
}

// Model dropdown change listener
lmModelSelect.addEventListener('change', () => {
    if (lmModelSelect.value === '__custom__') {
        customModelWrapper.style.display = 'block';
        customModelInput.focus();
    } else {
        customModelWrapper.style.display = 'none';
    }
});

// Refresh models button
refreshModelsBtn.addEventListener('click', () => refreshModels(false));

// Reset System Prompt to default
resetPromptBtn.addEventListener('click', () => {
    if (confirm('Reset evaluation system prompt to recommended default?')) {
        lmPromptInput.value = DEFAULT_SYSTEM_PROMPT;
    }
});

// Test Connection Button
testLmBtn.addEventListener('click', () => {
    showTestResult(true, 'Connecting to LM Studio and checking models...', true);
    refreshModels(false);
});

// Save AI Settings
saveLmBtn.addEventListener('click', () => {
    const baseUrl = getCleanBaseUrl(lmBaseUrlInput.value);
    let chosenModel = lmModelSelect.value;
    if (chosenModel === '__custom__') {
        chosenModel = customModelInput.value.trim();
    }
    const systemPrompt = lmPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;
    const token = lmTokenInput.value.trim(); // capture token input

    activeConfig = {
        baseUrl,
        modelName: chosenModel,
        systemPrompt,
        token // store token (may be empty string)
    };

    chrome.storage.local.set({ lmStudioConfig: activeConfig }, () => {
        showTestResult(true, '✅ AI configuration saved successfully!');
    });
});

function showTestResult(isSuccess, message, isPending = false) {
    testResultBox.style.display = 'block';
    testResultBox.className = `test-result-box ${isPending ? '' : isSuccess ? 'test-success' : 'test-error'}`;
    testResultBox.textContent = message;
}

// ================= Site Blocking Logic =================

function normalizeHost(input) {
    let clean = input.trim();
    if (!clean) return '';
    try {
        const url = new URL(clean.startsWith('http://') || clean.startsWith('https://') ? clean : 'https://' + clean);
        return url.hostname.toLowerCase();
    } catch (e) {
        return clean.replace(/^(http|https):\/\//, '').split('/')[0].split(/[?#]/)[0].toLowerCase();
    }
}

// Add site handler
addBtn.addEventListener('click', () => {
    const raw = patternInput.value.trim();
    const host = normalizeHost(raw);
    const level = levelSelect.value; // 'blocked' or 'forbidden'

    if (!host) return;

    chrome.storage.local.get(['blockedPatterns', 'forbiddenPatterns'], (result) => {
        let blockedPatterns = result.blockedPatterns || [];
        let forbiddenPatterns = result.forbiddenPatterns || [];

        if (level === 'forbidden') {
            if (!forbiddenPatterns.includes(host)) {
                forbiddenPatterns.push(host);
            }
            blockedPatterns = blockedPatterns.filter(p => p !== host);
        } else {
            if (!blockedPatterns.includes(host)) {
                blockedPatterns.push(host);
            }
            forbiddenPatterns = forbiddenPatterns.filter(p => p !== host);
        }

        chrome.storage.local.set({ blockedPatterns, forbiddenPatterns }, () => {
            patternInput.value = '';
            renderList('blockedPatterns', blockedPatterns);
            renderList('forbiddenPatterns', forbiddenPatterns);
        });
    });
});

patternInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addBtn.click();
});

// Add Whitelist handler
addWhiteBtn.addEventListener('click', () => {
    const val = whiteListInput.value.trim();
    if (!val) return;

    let normalized = val.replace(/^(http|https):\/\//, '').split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();

    chrome.storage.local.get(['whiteList'], (result) => {
        const white = result.whiteList || [];
        if (!white.includes(normalized)) {
            const updated = [...white, normalized];
            chrome.storage.local.set({ whiteList: updated }, () => {
                whiteListInput.value = '';
                renderList('whiteList', updated);
            });
        }
    });
});

whiteListInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addWhiteBtn.click();
});

// Toggle level for an existing site
function toggleSiteLevel(pattern, currentLevel) {
    const newLevel = currentLevel === 'blocked' ? 'forbidden' : 'blocked';
    chrome.runtime.sendMessage({
        type: 'SET_PATTERN_LEVEL',
        pattern,
        level: newLevel
    }, () => {
        chrome.storage.local.get(['blockedPatterns', 'forbiddenPatterns'], (res) => {
            renderList('blockedPatterns', res.blockedPatterns || []);
            renderList('forbiddenPatterns', res.forbiddenPatterns || []);
        });
    });
}

// Delete pattern
function deletePattern(storageKey, pattern) {
    chrome.storage.local.get([storageKey], (result) => {
        const list = result[storageKey] || [];
        const updated = list.filter(p => p !== pattern);
        chrome.storage.local.set({ [storageKey]: updated }, () => {
            renderList(storageKey, updated);
        });
    });
}

// Render Pattern Lists
function renderList(storageKey, patterns) {
    let listElement;
    let countBadge;

    if (storageKey === 'blockedPatterns') {
        listElement = blockedList;
        countBadge = blockedCount;
    } else if (storageKey === 'forbiddenPatterns') {
        listElement = forbiddenList;
        countBadge = forbiddenCount;
    } else {
        listElement = whiteList;
        countBadge = whiteCount;
    }

    countBadge.textContent = patterns.length.toString();
    listElement.innerHTML = '';

    if (patterns.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No sites listed in this category.';
        listElement.appendChild(empty);
        return;
    }

    patterns.forEach((pattern) => {
        const li = document.createElement('li');
        li.className = 'pattern-item';

        const mainDiv = document.createElement('div');
        mainDiv.className = 'pattern-main';

        const textSpan = document.createElement('span');
        textSpan.className = 'pattern-text';
        textSpan.textContent = pattern;
        mainDiv.appendChild(textSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'pattern-actions';

        // Add level switch button if it's blocked or forbidden
        if (storageKey === 'blockedPatterns') {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'toggle-level-btn';
            toggleBtn.textContent = 'Make Forbidden';
            toggleBtn.title = 'Switch to strictly forbidden (no bypass)';
            toggleBtn.onclick = () => toggleSiteLevel(pattern, 'blocked');
            actionsDiv.appendChild(toggleBtn);
        } else if (storageKey === 'forbiddenPatterns') {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'toggle-level-btn';
            toggleBtn.textContent = 'Make AI Review';
            toggleBtn.title = 'Switch to AI review (5m bypass allowed)';
            toggleBtn.onclick = () => toggleSiteLevel(pattern, 'forbidden');
            actionsDiv.appendChild(toggleBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Remove';
        deleteBtn.onclick = () => deletePattern(storageKey, pattern);
        actionsDiv.appendChild(deleteBtn);

        li.appendChild(mainDiv);
        li.appendChild(actionsDiv);
        listElement.appendChild(li);
    });
}

// Sync with storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.blockedPatterns) {
            renderList('blockedPatterns', changes.blockedPatterns.newValue || []);
        }
        if (changes.forbiddenPatterns) {
            renderList('forbiddenPatterns', changes.forbiddenPatterns.newValue || []);
        }
        if (changes.whiteList) {
            renderList('whiteList', changes.whiteList.newValue || []);
        }
    }
});
