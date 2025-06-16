// background.js (Service Worker)

// --- Constants ---
const RECOMMENDED_JOBS_URL = "https://www.naukri.com/mnjuser/recommendedjobs";
const CONFIRMATION_URL_SUBSTRING = "/myapply/saveApply";
const MAX_JOBS_TO_SELECT = 5;
const MESSAGE_RETRY_DELAY = 750;
const MAX_MESSAGE_RETRIES = 4;
const INITIAL_PROCESSING_DELAY = 1500;
const QNA_STORAGE_KEY = "naukriChatQnA_v2";
const MUST_HAVE_KEYWORDS_KEY = "mustHaveKeywords";
const GOOD_TO_HAVE_KEYWORDS_KEY = "goodToHaveKeywords";

// --- State Variables ---
let automationRunning = false;
let currentStatus = "Idle";
let activeTabId = null;
let activeProcessingTabId = null;
let jobsAppliedInCurrentBatch = 0;
let tabSwitchAttemptedForCurrentPageView = false;

// --- Core Functions ---

async function updateGlobalStatus(
  newStatus,
  newAutomationRunningState = automationRunning
) {
  currentStatus = newStatus;
  automationRunning = newAutomationRunningState;
  console.log(
    `Background: Status - ${currentStatus}, Running - ${automationRunning}, Target Tab - ${
      activeProcessingTabId || "None"
    }`
  );
  await chrome.storage.local.set({
    automationRunning: automationRunning,
    activeProcessingTabId: activeProcessingTabId,
    currentStatus: currentStatus,
  });
  try {
    await chrome.runtime.sendMessage({
      command: "updateStatus",
      status: currentStatus,
      automationRunning: automationRunning,
    });
  } catch (error) {
    /* Popup not open */
  }
}

async function stopAutomation(reason) {
  await updateGlobalStatus(reason, false);
  activeTabId = null;
  activeProcessingTabId = null;
  chrome.notifications.create({
    type: "basic",
    iconUrl: "images/icon48.png",
    title: "Naukri Automator",
    message: reason,
  });
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.command === "startAutomation") {
      if (!automationRunning) {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tabs.length > 0) {
          activeTabId = tabs[0].id;
          await updateGlobalStatus("Detecting active tab on page...", true);
          try {
            const response = await sendMessageToContentScriptWithRetry(
              activeTabId,
              { action: "detectActiveTab" }
            );
            if (response && response.activeTabId) {
              activeProcessingTabId = response.activeTabId;
              tabSwitchAttemptedForCurrentPageView = false;
              await updateGlobalStatus(
                `Target tab set to '${activeProcessingTabId}'. Starting...`,
                true
              );
              await processRecommendedJobsPage();
            } else {
              await stopAutomation(
                `Error: Could not detect an active Naukri tab. Please select one and try again.`
              );
            }
          } catch (error) {
            console.error(
              "Background: Error during startAutomation process:",
              error
            );
            await stopAutomation(
              "Error: Could not communicate with the Naukri page to start."
            );
          }
        } else {
          await stopAutomation("Error: No active tab found.");
        }
      }
    } else if (request.command === "stopAutomation") {
      await stopAutomation("Stopped by user.");
    } else if (request.command === "getStatus") {
      const data = await chrome.storage.local.get([
        "automationRunning",
        "currentStatus",
        "activeProcessingTabId",
      ]);
      sendResponse({
        automationRunning: data.automationRunning || false,
        status: data.currentStatus || "Idle",
        activeProcessingTabId: data.activeProcessingTabId || null,
      });
      return; // Explicitly return as sendResponse is synchronous here
    } else if (request.command === "getChatAnswer") {
      const { normalizedQuestion } = request;
      const data = await chrome.storage.local.get(QNA_STORAGE_KEY);
      sendResponse({
        answerData: (data[QNA_STORAGE_KEY] || {})[normalizedQuestion] || null,
      });
      return; // Explicitly return
    } else if (request.command === "storeChatAnswer") {
      const { normalizedQuestion, answer, inputType, answerSource } = request;
      const data = await chrome.storage.local.get(QNA_STORAGE_KEY);
      const qnaStore = data[QNA_STORAGE_KEY] || {};
      qnaStore[normalizedQuestion] = {
        answer,
        inputType,
        lastUpdated: Date.now(),
        source: answerSource || "user_provided",
      };
      await chrome.storage.local.set({ [QNA_STORAGE_KEY]: qnaStore });
      sendResponse({ success: true });
      return; // Explicitly return
    } else if (request.command === "jobsSelectedAndApplied") {
      jobsAppliedInCurrentBatch = request.jobsAttemptedCount;
      await updateGlobalStatus(
        `Applied to ${jobsAppliedInCurrentBatch} jobs on tab '${activeProcessingTabId}'. Waiting...`,
        true
      );
    } else if (request.command === "chatboxQuestionPresented") {
      await updateGlobalStatus(
        `Chatbox: Question - "${request.questionText.substring(0, 50)}..."`,
        true
      );
    } else if (request.command === "confirmationPageReached") {
      await handleApplicationConfirmation();
    } else if (request.command === "tabSwitchResult") {
      if (request.success) {
        await updateGlobalStatus(
          `On tab '${request.switchedToTabId}'. Selecting jobs...`,
          true
        );
        await selectJobsOnCurrentPage();
      } else {
        await stopAutomation(
          `Error: Failed to switch to target tab '${request.attemptedTabId}'.`
        );
      }
    } else if (request.command === "noJobsToApply") {
      await stopAutomation(
        `No more selectable jobs found on tab '${activeProcessingTabId}'.`
      );
    } else if (request.command === "errorOccurred") {
      await stopAutomation(`Error: ${request.message}.`);
    }
  })();

  return true; // Keep channel open for all async operations
});

// --- Event Listeners & Core Logic ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    tabId === activeTabId &&
    changeInfo.status === "complete" &&
    automationRunning
  ) {
    if (tab.url && tab.url.includes(RECOMMENDED_JOBS_URL)) {
      if (currentStatus !== "Idle" && !currentStatus.startsWith("Error:")) {
        tabSwitchAttemptedForCurrentPageView = false;
        await new Promise((resolve) =>
          setTimeout(resolve, INITIAL_PROCESSING_DELAY)
        );
        await processRecommendedJobsPage();
      }
    } else if (tab.url && tab.url.includes(CONFIRMATION_URL_SUBSTRING)) {
      if (
        currentStatus.startsWith("Applied to") ||
        currentStatus.includes("Chatbox") ||
        currentStatus.startsWith("Waiting")
      ) {
        await handleApplicationConfirmation();
      }
    }
  }
});

async function processRecommendedJobsPage() {
  if (!automationRunning || !activeTabId || !activeProcessingTabId) return;
  if (!tabSwitchAttemptedForCurrentPageView) {
    await updateGlobalStatus(
      `Verifying tab '${activeProcessingTabId}'...`,
      true
    );
    try {
      await sendMessageToContentScriptWithRetry(activeTabId, {
        action: "switchToTab",
        targetTabId: activeProcessingTabId,
      });
      tabSwitchAttemptedForCurrentPageView = true;
    } catch (error) {
      await stopAutomation(`Error sending 'switchToTab' message.`);
    }
  } else {
    await selectJobsOnCurrentPage();
  }
}

async function selectJobsOnCurrentPage() {
  if (!automationRunning || !activeTabId) return;
  const currentProcessingTabId = activeProcessingTabId || "unknown";
  const data = await chrome.storage.local.get([
    MUST_HAVE_KEYWORDS_KEY,
    GOOD_TO_HAVE_KEYWORDS_KEY,
  ]);
  const mustHaveKeywords = data[MUST_HAVE_KEYWORDS_KEY] || [];
  const goodToHaveKeywords = data[GOOD_TO_HAVE_KEYWORDS_KEY] || [];
  await updateGlobalStatus(
    `Filtering & selecting jobs on tab '${currentProcessingTabId}'...`,
    true
  );
  try {
    await sendMessageToContentScriptWithRetry(activeTabId, {
      action: "selectAndApplyJobs",
      startIndex: 0,
      maxJobs: MAX_JOBS_TO_SELECT,
      mustHaveKeywords,
      goodToHaveKeywords,
    });
  } catch (error) {
    await stopAutomation(
      `Error communicating on tab '${currentProcessingTabId}'.`
    );
  }
}

async function handleApplicationConfirmation() {
  if (!automationRunning || currentStatus.startsWith("Application confirmed."))
    return;
  const confirmedOnTab = activeProcessingTabId || "unknown";
  await updateGlobalStatus(
    `Application confirmed on tab '${confirmedOnTab}'. Returning...`,
    true
  );
  jobsAppliedInCurrentBatch = 0;
  if (activeTabId) {
    try {
      await chrome.tabs.update(activeTabId, { url: RECOMMENDED_JOBS_URL });
    } catch (error) {
      await stopAutomation("Error: Failed to navigate back.");
    }
  } else {
    await stopAutomation("Error: No active tab to navigate back.");
  }
}

async function sendMessageToContentScriptWithRetry(
  tabId,
  message,
  retries = MAX_MESSAGE_RETRIES
) {
  try {
    await chrome.tabs.get(tabId);
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (
      retries > 0 &&
      (error.message.includes("Could not establish connection") ||
        error.message.includes("Receiving end does not exist"))
    ) {
      await new Promise((resolve) => setTimeout(resolve, MESSAGE_RETRY_DELAY));
      return sendMessageToContentScriptWithRetry(tabId, message, retries - 1);
    } else {
      throw error;
    }
  }
}

// --- Startup & Cleanup ---
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === activeTabId && automationRunning)
    await stopAutomation("Idle (Tab Closed)");
});

(async () => {
  console.log("Service worker active/re-activated.");
  const data = await chrome.storage.local.get([
    "automationRunning",
    "currentStatus",
    QNA_STORAGE_KEY,
  ]);
  automationRunning = data.automationRunning || false;
  activeProcessingTabId = null;
  if (data[QNA_STORAGE_KEY] === undefined)
    await chrome.storage.local.set({ [QNA_STORAGE_KEY]: {} });
  if (automationRunning) await updateGlobalStatus("Idle (Recovered)", false);
  else await updateGlobalStatus(data.currentStatus || "Idle", false);
  console.log("Service worker initialized.");
})();
