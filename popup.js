// popup.js

document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.getElementById("startAutomation");
  const stopButton = document.getElementById("stopAutomation");
  const statusDisplay = document.getElementById("status");
  const mustHaveKeywordsInput = document.getElementById("mustHaveKeywords");
  const goodToHaveKeywordsInput = document.getElementById("goodToHaveKeywords");
  const saveKeywordsButton = document.getElementById("saveKeywords");
  const saveKeywordsStatus = document.getElementById("saveKeywordsStatus");

  function updateUI(automationRunning, currentStatus) {
    startButton.disabled = automationRunning;
    stopButton.disabled = !automationRunning;
    startButton.classList.toggle("disabled", automationRunning);
    stopButton.classList.toggle("disabled", !automationRunning);
    statusDisplay.textContent = `Status: ${currentStatus}`;
  }

  startButton.addEventListener("click", () => {
    if (!startButton.disabled) {
      chrome.runtime.sendMessage({ command: "startAutomation" });
    }
  });

  stopButton.addEventListener("click", () => {
    if (!stopButton.disabled) {
      chrome.runtime.sendMessage({ command: "stopAutomation" });
    }
  });

  saveKeywordsButton.addEventListener("click", () => {
    const mustHaveText = mustHaveKeywordsInput.value.trim();
    const goodToHaveText = goodToHaveKeywordsInput.value.trim();
    const mustHaveKeywords = mustHaveText
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k);
    const goodToHaveKeywords = goodToHaveText
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k);

    chrome.storage.local.set({ mustHaveKeywords, goodToHaveKeywords }, () => {
      console.log("Keywords saved:", { mustHaveKeywords, goodToHaveKeywords });
      saveKeywordsStatus.textContent = "Keywords Saved!";
      setTimeout(() => {
        saveKeywordsStatus.textContent = "";
      }, 2000);
    });
  });

  function loadKeywords() {
    chrome.storage.local.get(
      ["mustHaveKeywords", "goodToHaveKeywords"],
      (data) => {
        if (data.mustHaveKeywords) {
          mustHaveKeywordsInput.value = data.mustHaveKeywords.join(", ");
        }
        if (data.goodToHaveKeywords) {
          goodToHaveKeywordsInput.value = data.goodToHaveKeywords.join(", ");
        }
      }
    );
  }

  function initializePopup() {
    chrome.runtime.sendMessage({ command: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        statusDisplay.textContent =
          "Error: " + chrome.runtime.lastError.message;
        updateUI(false, "Error connecting");
        return;
      }
      if (response) updateUI(response.automationRunning, response.status);
    });
    loadKeywords();
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "updateStatus") {
      updateUI(request.automationRunning, request.status);
    }
    // It's good practice to send a dummy response if the channel is not used further
    sendResponse({ received: true });
    return true;
  });

  initializePopup();
});
