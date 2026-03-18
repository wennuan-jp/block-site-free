document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const blockedUrl = urlParams.get("url");
  const displayDiv = document.getElementById("blockedUrl");

  console.log("Found div:", displayDiv); // Check your console (F12)
  console.log("URL Param:", blockedUrl);

  if (blockedUrl) {
    displayDiv.textContent = decodeURIComponent(blockedUrl);
  } else {
    displayDiv.textContent = "No URL provided";
    displayDiv.style.display = "block";
  }

  const bypassBtn = document.getElementById("bypassBtn");
  bypassBtn.addEventListener("click", () => {
    const originalUrl = decodeURIComponent(blockedUrl);
    if (!originalUrl) return;

    const intention = prompt("What is your intention for visiting this site?");
    if (intention && intention.trim() !== "") {
      chrome.runtime.sendMessage({
        type: 'START_BYPASS',
        url: originalUrl,
        intention: intention.trim()
      }, (response) => {
        if (response && response.success) {
          window.location.href = originalUrl;
        } else {
          alert("Failed to start bypass. Please try again.");
        }
      });
    } else if (intention !== null) {
      alert("Please enter a valid intention to proceed.");
    }
  });
});
