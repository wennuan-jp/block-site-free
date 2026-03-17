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
});
