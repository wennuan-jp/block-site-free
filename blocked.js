// blocked.js

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const blockedUrl = urlParams.get("url");
  let level = urlParams.get("level") || "";

  const displayDiv = document.getElementById("blockedUrl");
  const goBackBtn = document.getElementById("goBackBtn");
  const bypassBtn = document.getElementById("bypassBtn");
  const statusBadge = document.getElementById("statusBadge");
  const mainTitle = document.getElementById("mainTitle");
  const mainTagline = document.getElementById("mainTagline");

  // Modal elements
  const modal = document.getElementById("intentionModal");
  const intentionInput = document.getElementById("intentionInput");
  const feedbackBox = document.getElementById("feedbackBox");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalSubmitBtn = document.getElementById("modalSubmitBtn");

  const originalUrl = blockedUrl ? decodeURIComponent(blockedUrl) : "";

  if (originalUrl) {
    displayDiv.textContent = originalUrl;
  } else {
    displayDiv.textContent = "No URL specified";
  }

  // Helper to extract hostname
  function getHostname(url) {
    try {
      const u = new URL(url.startsWith("http://") || url.startsWith("https://") ? url : "https://" + url);
      return u.hostname.toLowerCase();
    } catch (e) {
      return url.replace(/^(http|https):\/\//, "").split("/")[0].toLowerCase();
    }
  }

  const hostname = getHostname(originalUrl);

  // Configure UI for forbidden or blocked mode
  function applyLevelMode(currentLevel) {
    if (currentLevel === "forbidden") {
      document.body.classList.add("forbidden-mode");
      statusBadge.textContent = "Forbidden \u00B7 Zero Access";
      statusBadge.className = "badge badge-forbidden";
      mainTitle.textContent = "Site is Forbidden";
      mainTagline.textContent = "Strict Focus \u00B7 Permanently Restricted";
      if (bypassBtn) bypassBtn.style.display = "none";
    } else {
      document.body.classList.remove("forbidden-mode");
      statusBadge.textContent = "Blocked \u00B7 AI Evaluation";
      statusBadge.className = "badge badge-blocked";
      mainTitle.textContent = "Site is Blocked";
      mainTagline.textContent = "Stay Focused \u00B7 Regain Control";
      if (bypassBtn) bypassBtn.style.display = "inline-flex";
    }
  }

  // If level not specified in URL, check storage to determine
  if (!level && originalUrl) {
    chrome.storage.local.get(["forbiddenPatterns", "blockedPatterns"], (result) => {
      const forbidden = result.forbiddenPatterns || [];
      const isForbidden = forbidden.some((p) => {
        const clean = p.toLowerCase().trim();
        return clean && (hostname === clean || hostname.endsWith("." + clean));
      });
      level = isForbidden ? "forbidden" : "blocked";
      applyLevelMode(level);
    });
  } else {
    applyLevelMode(level);
  }

  // Go back button
  goBackBtn.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  });

  // Open modal
  bypassBtn.addEventListener("click", () => {
    if (!originalUrl) return;
    modal.classList.add("active");
    feedbackBox.style.display = "none";
    feedbackBox.className = "feedback-box";
    feedbackBox.textContent = "";
    intentionInput.value = "";
    modalSubmitBtn.disabled = false;
    setTimeout(() => intentionInput.focus(), 100);
  });

  // Close modal
  function closeModal() {
    modal.classList.remove("active");
  }

  modalCancelBtn.addEventListener("click", closeModal);

  // Close on Escape or click outside
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Keyboard shortcut Ctrl/Cmd + Enter to submit
  intentionInput.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      submitIntention();
    }
  });

  modalSubmitBtn.addEventListener("click", submitIntention);

  function showFeedback(type, message, isLoading = false) {
    feedbackBox.style.display = "block";
    feedbackBox.className = `feedback-box feedback-${type}`;
    if (isLoading) {
      feedbackBox.innerHTML = `<div class="spinner"></div><span>${message}</span>`;
    } else {
      feedbackBox.textContent = message;
    }
  }

  function submitIntention() {
    const intention = intentionInput.value.trim();
    if (!intention) {
      showFeedback("denied", "Please provide a valid intention for visiting this site.");
      return;
    }

    if (!originalUrl) return;

    modalSubmitBtn.disabled = true;
    showFeedback("loading", "Evaluating intention with LM Studio...", true);

    chrome.runtime.sendMessage(
      {
        type: "JUDGE_INTENTION",
        url: originalUrl,
        intention: intention,
      },
      (response) => {
        if (!response) {
          showFeedback("error", "No response from ZenBlock background service.");
          modalSubmitBtn.disabled = false;
          return;
        }

        if (response.success && response.valid) {
          showFeedback(
            "approved",
            `\u2714 Access Granted: ${response.reason || "Intention approved by AI."}\nRedirecting in 2 seconds...`
          );

          chrome.runtime.sendMessage(
            {
              type: "START_BYPASS",
              url: originalUrl,
              intention: intention,
            },
            (bypassRes) => {
              if (bypassRes && bypassRes.success) {
                setTimeout(() => {
                  window.location.href = originalUrl;
                }, 1500);
              } else {
                showFeedback("error", bypassRes?.error || "Failed to start temporary bypass session.");
                modalSubmitBtn.disabled = false;
              }
            }
          );
        } else if (response.success && !response.valid) {
          showFeedback("denied", `\u2718 Access Denied: ${response.reason || "AI determined this is not a productive task."}`);
          modalSubmitBtn.disabled = false;
        } else {
          showFeedback("error", `\u26A0 ${response.error || "Could not connect to LM Studio."}`);
          modalSubmitBtn.disabled = false;
        }
      }
    );
  }
});
