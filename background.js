// background.js

const DEFAULT_BASE_URL = 'http://127.0.0.1:1234';

const DEFAULT_SYSTEM_PROMPT = `You are a strict productivity guardian AI. The user has intentionally blocked this website to avoid procrastination and stay focused on work or study.

The user wants temporary 5-minute access to this site and has provided their intention.

Judge whether the user's intention is valid, productive, or necessary for study/work/urgent tasks, or if it is merely procrastination, casual browsing, entertainment, or an evasive excuse.

Respond ONLY with a valid JSON object matching this schema:
{
  "valid": true or false,
  "reason": "A concise 1-2 sentence explanation of your judgment directly to the user."
}`;

const DEFAULT_LM_STUDIO_CONFIG = {
  baseUrl: DEFAULT_BASE_URL,
  modelName: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  token: ''
};

// Initialize storage on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['blockedPatterns', 'forbiddenPatterns', 'whiteList', 'temporaryBypass', 'lmStudioConfig'], (result) => {
    const updates = {};

    if (!result.blockedPatterns) {
      updates.blockedPatterns = [];
    }
    if (!result.forbiddenPatterns) {
      updates.forbiddenPatterns = [];
    }
    if (!result.whiteList) {
      updates.whiteList = [];
    }
    if (!result.temporaryBypass) {
      updates.temporaryBypass = {};
    }
    if (!result.lmStudioConfig) {
      updates.lmStudioConfig = DEFAULT_LM_STUDIO_CONFIG;
    } else {
      // Migrate or complement keys if needed
      updates.lmStudioConfig = {
        baseUrl: result.lmStudioConfig.baseUrl || result.lmStudioConfig.endpoint?.replace(/\/v1$/, '') || DEFAULT_BASE_URL,
        modelName: result.lmStudioConfig.modelName ?? (result.lmStudioConfig.model || ''),
        systemPrompt: result.lmStudioConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT
      };
    }

    // Normalize existing patterns and whitelist on install/update
    if (result.blockedPatterns) {
      const normalizedBlocked = [...new Set(result.blockedPatterns.map(p => normalizePattern(p)))];
      if (JSON.stringify(normalizedBlocked) !== JSON.stringify(result.blockedPatterns)) {
        updates.blockedPatterns = normalizedBlocked;
      }
    }
    if (result.forbiddenPatterns) {
      const normalizedForbidden = [...new Set(result.forbiddenPatterns.map(p => normalizePattern(p)))];
      if (JSON.stringify(normalizedForbidden) !== JSON.stringify(result.forbiddenPatterns)) {
        updates.forbiddenPatterns = normalizedForbidden;
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
      console.log('ZenBlock storage initialized:', updates);
    }
  });
});

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
 * Extracts hostname from URL or pattern.
 */
function getHostname(url) {
  try {
    const urlObj = new URL(url.startsWith('http://') || url.startsWith('https://') ? url : 'https://' + url);
    return urlObj.hostname.toLowerCase();
  } catch (e) {
    let host = url.replace(/^(http|https):\/\//, '').split('/')[0];
    return host.split(/[?#]/)[0].toLowerCase();
  }
}

// Ensure basic initialization on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('ZenBlock background worker started.');
  // Periodic cleanup of expired bypasses
  const result = await chrome.storage.local.get(['temporaryBypass']);
  if (result.temporaryBypass) {
    const now = Date.now();
    const updatedBypasses = {};
    let changed = false;
    for (const [host, data] of Object.entries(result.temporaryBypass)) {
      if (data.endTime > now) {
        updatedBypasses[host] = data;
      } else {
        changed = true;
      }
    }
    if (changed) {
      await chrome.storage.local.set({ temporaryBypass: updatedBypasses });
    }
  }
});

/**
 * Parses LM Studio model response schemas (matches LibGrow Client's parseLmStudioModels).
 * Handles both LM Studio native schema (/api/v1/models) and OpenAI schema (/v1/models).
 */
function parseLmStudioModels(body) {
  if (!body || typeof body !== 'object') return [];
  const modelsMap = new Map();

  function addModel(id, displayName, isLoaded = false) {
    if (!id || typeof id !== 'string') return;
    const cleanId = id.trim();
    if (!cleanId) return;

    const existing = modelsMap.get(cleanId);
    modelsMap.set(cleanId, {
      id: cleanId,
      displayName: (displayName && displayName.trim()) ? displayName.trim() : (existing?.displayName || cleanId),
      isLoaded: isLoaded || (existing?.isLoaded ?? false)
    });
  }

  function addModelEntry(entry, assumeLoaded = false) {
    if (typeof entry === 'string') {
      addModel(entry, entry, assumeLoaded);
      return;
    }
    if (!entry || typeof entry !== 'object') return;

    // Filter out non-LLM models if type specified
    if (entry.type && entry.type !== 'llm') return;

    const displayName = entry.display_name || entry.name;
    const modelId = entry.id || entry.key || entry.selected_variant;
    const loadedInstances = entry.loaded_instances;

    let hasLoadedInstance = false;
    if (Array.isArray(loadedInstances) && loadedInstances.length > 0) {
      for (const instance of loadedInstances) {
        if (instance && instance.id) {
          hasLoadedInstance = true;
          addModel(instance.id, displayName, true);
        }
      }
    }

    if (!hasLoadedInstance && modelId) {
      addModel(modelId, displayName, assumeLoaded);
    }
  }

  // Handle OpenAI-compatible response format: { data: [{ id: "..." }] }
  if (Array.isArray(body.data)) {
    for (const item of body.data) {
      addModelEntry(item, true);
    }
  }

  // Handle LM Studio native response format: { models: [{ id: "...", type: "llm", loaded_instances: [...] }] }
  if (Array.isArray(body.models)) {
    for (const item of body.models) {
      addModelEntry(item, false);
    }
  }

  const list = Array.from(modelsMap.values());
  // Sort: loaded models first, then alphabetical by displayName
  list.sort((a, b) => {
    if (a.isLoaded !== b.isLoaded) return a.isLoaded ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return list;
}

/**
 * Fetches models from LM Studio using native and OpenAI-compatible endpoints.
 */
async function fetchLmStudioModels(baseUrl) {
  let cleanUrl = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  if (cleanUrl.endsWith('/v1')) {
    cleanUrl = cleanUrl.substring(0, cleanUrl.length - 3);
  }

  const startTime = Date.now();
  let models = [];
  let errorMsg = null;

  // 1. Try LM Studio native endpoint /api/v1/models (gives richest info including loaded instances)
  try {
    const storedConfig = await chrome.storage.local.get(['lmStudioConfig']);
    const token = storedConfig.lmStudioConfig?.token;
    const res = await fetch(`${cleanUrl}/api/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      models = parseLmStudioModels(data);
    }
  } catch (e) {
    errorMsg = e.message;
  }

  // 2. If no models found, fallback to OpenAI-compatible endpoint /v1/models
  if (models.length === 0) {
    try {
      const res = await fetch(`${cleanUrl}/v1/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        models = parseLmStudioModels(data);
        errorMsg = null;
      }
    } catch (e) {
      if (!errorMsg) errorMsg = e.message;
    }
  }

  const latency = Date.now() - startTime;
  const isReachable = models.length > 0 || (errorMsg === null);

  return {
    success: isReachable,
    models,
    latency,
    error: errorMsg
  };
}

/**
 * Constructs the chat completions endpoint from the base URL.
 */
function getChatEndpoint(baseUrl) {
  let cleanUrl = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  if (!cleanUrl.endsWith('/v1')) {
    cleanUrl = `${cleanUrl}/v1`;
  }
  return `${cleanUrl}/chat/completions`;
}

/**
 * Robustly parses AI response to extract JSON { valid: boolean, reason: string }.
 */
function parseAiResponse(content) {
  if (!content) {
    return { valid: false, reason: 'Empty response received from AI model.' };
  }

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(content.trim());
    if (typeof parsed.valid === 'boolean') {
      return {
        valid: parsed.valid,
        reason: parsed.reason || (parsed.valid ? 'Intention approved.' : 'Intention deemed not sufficiently valid.')
      };
    }
  } catch (e) {}

  // 2. Extract JSON enclosed in markdown code fences or curly braces
  const jsonMatch = content.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.valid === 'boolean') {
        return {
          valid: parsed.valid,
          reason: parsed.reason || (parsed.valid ? 'Intention approved.' : 'Intention deemed not sufficiently valid.')
        };
      }
    } catch (e) {}
  }

  // 3. Fallback heuristics if the LLM output was formatted as text
  const lower = content.toLowerCase();
  const validPattern = /"valid"\s*:\s*true|valid\s*:\s*true|\b(approved|authorized|valid intention|granted|acceptable)\b/;
  const invalidPattern = /"valid"\s*:\s*false|valid\s*:\s*false|\b(denied|rejected|invalid intention|procrastination|unacceptable)\b/;

  const cleanedReason = content.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();

  if (validPattern.test(lower) && !invalidPattern.test(lower)) {
    return { valid: true, reason: cleanedReason || 'Intention approved by AI.' };
  }

  return { valid: false, reason: cleanedReason || 'Intention rejected by AI.' };
}

/**
 * Calls LM Studio to judge intention, following LibGrow Client's error handling.
 */
async function judgeIntentionWithLMStudio(url, intention) {
  const result = await chrome.storage.local.get(['lmStudioConfig', 'forbiddenPatterns']);
  const forbiddenPatterns = result.forbiddenPatterns || [];
  const hostname = getHostname(url);

  // Strictly check if forbidden
  const isForbidden = forbiddenPatterns.some(p => {
    const clean = p.toLowerCase().trim();
    return clean && (hostname === clean || hostname.endsWith('.' + clean));
  });

  if (isForbidden) {
    return {
      success: true,
      valid: false,
      reason: 'This site is marked as Forbidden. Access cannot be granted under any circumstances.'
    };
  }

  const config = result.lmStudioConfig || DEFAULT_LM_STUDIO_CONFIG;
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  let modelName = (config.modelName || '').trim();

  // If no model selected, try auto-detecting the loaded model
  if (!modelName) {
    const modelsResult = await fetchLmStudioModels(baseUrl);
    if (modelsResult.success && modelsResult.models.length > 0) {
      const loaded = modelsResult.models.find(m => m.isLoaded);
      modelName = loaded ? loaded.id : modelsResult.models[0].id;
    }
  }

  const systemPrompt = (config.systemPrompt && config.systemPrompt.trim())
    ? config.systemPrompt.trim()
    : DEFAULT_SYSTEM_PROMPT;

  const chatEndpoint = getChatEndpoint(baseUrl);

  try {
    const payload = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Target Website: ${hostname}\nUser's Stated Intention: "${intention}"` }
      ],
      temperature: 0.2,
      max_tokens: 300
    };

    if (modelName) {
      payload.model = modelName;
    }

    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { 'Authorization': `Bearer ${config.token}` } : {})
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      const errText = await response.text();
      const lower = (errText || '').toLowerCase();
      if (lower.includes('no lm studio llm is loaded') || lower.includes('model not found') || lower.includes('not loaded')) {
        return {
          success: false,
          error: 'No loaded LM Studio model responded. Load the LLM in LM Studio and try again.'
        };
      }
      return {
        success: false,
        error: `LM Studio returned status ${response.status}: ${errText || response.statusText}`
      };
    }

    const data = await response.json();
    const rawContent = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseAiResponse(rawContent);

    return {
      success: true,
      valid: parsed.valid,
      reason: parsed.reason,
      model: modelName || data.model || 'LM Studio'
    };
  } catch (error) {
    console.error('Error connecting to LM Studio:', error);
    let msg = error.message;
    if (error.name === 'TimeoutError') {
      msg = 'Request timed out after 20 seconds. The local model took too long to generate a response.';
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('connection refused')) {
      msg = `LM Studio is not reachable at ${baseUrl}. Make sure LM Studio is running, the local server is started, and the configured base URL is correct.`;
    }
    return {
      success: false,
      error: msg
    };
  }
}

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_LM_STUDIO_MODELS') {
    const { baseUrl } = message;
    (async () => {
      const result = await fetchLmStudioModels(baseUrl);
      sendResponse(result);
    })();
    return true;
  }

  if (message.type === 'ADD_BLOCK_AND_RELOAD') {
    const { host, tabId, level } = message;
    const isForbidden = level === 'forbidden';

    (async () => {
      try {
        const result = await chrome.storage.local.get(['blockedPatterns', 'forbiddenPatterns']);
        let blockedPatterns = result.blockedPatterns || [];
        let forbiddenPatterns = result.forbiddenPatterns || [];

        if (isForbidden) {
          if (!forbiddenPatterns.includes(host)) {
            forbiddenPatterns = [...forbiddenPatterns, host];
          }
          blockedPatterns = blockedPatterns.filter(p => p !== host);
        } else {
          if (!blockedPatterns.includes(host)) {
            blockedPatterns = [...blockedPatterns, host];
          }
          forbiddenPatterns = forbiddenPatterns.filter(p => p !== host);
        }

        await chrome.storage.local.set({ blockedPatterns, forbiddenPatterns });

        await new Promise(resolve => setTimeout(resolve, 150));

        if (tabId) {
          await chrome.tabs.reload(tabId);
        }

        sendResponse({ success: true });
      } catch (error) {
        console.error('Block reload failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();

    return true;
  }

  if (message.type === 'REMOVE_PATTERN') {
    const { pattern } = message;
    (async () => {
      try {
        const result = await chrome.storage.local.get(['blockedPatterns', 'forbiddenPatterns']);
        const blockedPatterns = (result.blockedPatterns || []).filter(p => p !== pattern);
        const forbiddenPatterns = (result.forbiddenPatterns || []).filter(p => p !== pattern);
        await chrome.storage.local.set({ blockedPatterns, forbiddenPatterns });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }

  if (message.type === 'SET_PATTERN_LEVEL') {
    const { pattern, level } = message;
    (async () => {
      try {
        const result = await chrome.storage.local.get(['blockedPatterns', 'forbiddenPatterns']);
        let blockedPatterns = (result.blockedPatterns || []).filter(p => p !== pattern);
        let forbiddenPatterns = (result.forbiddenPatterns || []).filter(p => p !== pattern);

        if (level === 'forbidden') {
          forbiddenPatterns.push(pattern);
        } else {
          blockedPatterns.push(pattern);
        }

        await chrome.storage.local.set({ blockedPatterns, forbiddenPatterns });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }

  if (message.type === 'ADD_TO_WHITELIST') {
    const { url } = message;
    const normalized = normalizePattern(url);

    (async () => {
      try {
        const result = await chrome.storage.local.get(['whiteList']);
        const whiteList = result.whiteList || [];

        if (!whiteList.includes(normalized)) {
          const updatedWhiteList = [...whiteList, normalized];
          await chrome.storage.local.set({ whiteList: updatedWhiteList });
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Whitelist update failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();

    return true;
  }

  if (message.type === 'START_BYPASS') {
    const { url, intention } = message;
    const hostname = getHostname(url);
    const endTime = Date.now() + 5 * 60 * 1000;

    (async () => {
      try {
        const result = await chrome.storage.local.get(['temporaryBypass', 'forbiddenPatterns']);
        const forbiddenPatterns = result.forbiddenPatterns || [];

        const isForbidden = forbiddenPatterns.some(p => {
          const clean = p.toLowerCase().trim();
          return clean && (hostname === clean || hostname.endsWith('.' + clean));
        });

        if (isForbidden) {
          sendResponse({ success: false, error: 'Forbidden sites cannot be bypassed.' });
          return;
        }

        const bypasses = result.temporaryBypass || {};
        bypasses[hostname] = {
          endTime,
          intention
        };

        await chrome.storage.local.set({ temporaryBypass: bypasses });
        sendResponse({ success: true });
      } catch (error) {
        console.error('Bypass start failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }

  if (message.type === 'END_BYPASS') {
    const { hostname } = message;
    (async () => {
      try {
        const result = await chrome.storage.local.get(['temporaryBypass']);
        const bypasses = result.temporaryBypass || {};
        if (bypasses[hostname]) {
          delete bypasses[hostname];
          await chrome.storage.local.set({ temporaryBypass: bypasses });
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Bypass end failed:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }

  if (message.type === 'JUDGE_INTENTION') {
    const { url, intention } = message;
    (async () => {
      const evaluation = await judgeIntentionWithLMStudio(url, intention);
      sendResponse(evaluation);
    })();
    return true;
  }
});
