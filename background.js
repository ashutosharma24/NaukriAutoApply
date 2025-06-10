// background.js (Service Worker)

// Constants
const RECOMMENDED_JOBS_URL = "https://www.naukri.com/mnjuser/recommendedjobs";
const CONFIRMATION_URL_SUBSTRING = "/myapply/saveApply";
const MAX_JOBS_TO_SELECT = 5;
const MESSAGE_RETRY_DELAY = 750; // ms
const MAX_MESSAGE_RETRIES = 4; 
const INITIAL_PROCESSING_DELAY = 1500; // ms 
const QNA_STORAGE_KEY = 'naukriChatQnA_v2';

// --- State Variables ---
let automationRunning = false;
let currentStatus = "Idle";
let activeTabId = null; // The ID of the browser tab
let activeProcessingTabId = null; // The ID of the Naukri tab to process (e.g., 'profile', 'top_candidate')
let jobsAppliedInCurrentBatch = 0; 
let tabSwitchAttemptedForCurrentPageView = false;

// --- Core Functions ---

async function updateGlobalStatus(newStatus, newAutomationRunningState = automationRunning) {
    currentStatus = newStatus;
    automationRunning = newAutomationRunningState;
    console.log(`Background: Status - ${currentStatus}, Running - ${automationRunning}, Target Tab - ${activeProcessingTabId || 'None'}`);
    // Store state needed for persistence
    await chrome.storage.local.set({
        automationRunning: automationRunning,
        activeProcessingTabId: activeProcessingTabId, 
        currentStatus: currentStatus
    });
    try {
        await chrome.runtime.sendMessage({
            command: 'updateStatus',
            status: currentStatus,
            automationRunning: automationRunning
        });
    } catch (error) {
        // console.log("Popup not open or not listening:", error.message);
    }
}

async function stopAutomation(reason) {
    await updateGlobalStatus(reason, false);
    activeTabId = null;
    activeProcessingTabId = null; // Clear the target tab on stop
    chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: 'Naukri Automator', message: reason});
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => { 
        if (request.command === 'startAutomation') {
            if (!automationRunning) {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs.length > 0) {
                    activeTabId = tabs[0].id;
                    await updateGlobalStatus("Detecting active tab on page...", true);
                    // Ask content script for the currently active tab before starting
                    await sendMessageToContentScriptWithRetry(activeTabId, { action: 'detectActiveTab' });
                } else {
                    await stopAutomation("Error: No active tab found.");
                }
            }
            sendResponse({ automationRunning: automationRunning, status: currentStatus });
        } 
        else if (request.command === 'setActiveTabAndStart') {
            if (request.activeTabId) {
                activeProcessingTabId = request.activeTabId;
                tabSwitchAttemptedForCurrentPageView = false;
                await updateGlobalStatus(`Target tab set to '${activeProcessingTabId}'. Starting...`, true);
                await processRecommendedJobsPage();
            } else {
                await stopAutomation(`Error: Could not detect an active Naukri tab. Please select a tab like 'Profile' or 'Top Candidate' and try again.`);
            }
        }
        else if (request.command === 'stopAutomation') {
            await stopAutomation("Stopped by user.");
            sendResponse({ automationRunning: false, status: currentStatus });
        } 
        else if (request.command === 'getStatus') {
            const data = await chrome.storage.local.get(['automationRunning', 'currentStatus', 'activeProcessingTabId']);
            sendResponse({ automationRunning: data.automationRunning || false, status: data.currentStatus || "Idle", activeProcessingTabId: data.activeProcessingTabId || null });
        } 
        else if (request.command === 'jobsSelectedAndApplied') {
            jobsAppliedInCurrentBatch = request.jobsAttemptedCount; 
            await updateGlobalStatus(`Applied to ${jobsAppliedInCurrentBatch} jobs on tab '${activeProcessingTabId}'. Waiting...`, true);
        } 
        else if (request.command === 'chatboxQuestionPresented') {
            await updateGlobalStatus(`Chatbox: Question - "${request.questionText.substring(0,50)}..."`, true);
        } 
        else if (request.command === 'confirmationPageReached') {
            await handleApplicationConfirmation();
        } 
        else if (request.command === 'tabSwitchResult') {
             if (request.success) {
                console.log(`Background: Successfully on tab '${request.switchedToTabId}'. Selecting jobs.`);
                await updateGlobalStatus(`On tab '${request.switchedToTabId}'. Selecting jobs...`, true);
                await selectJobsOnCurrentPage(); 
            } else {
                await stopAutomation(`Error: Failed to switch to target tab '${request.attemptedTabId}'.`);
            }
        } 
        else if (request.command === 'noJobsToApply') {
            await stopAutomation(`No more selectable jobs found on tab '${activeProcessingTabId}'.`);
        } 
        else if (request.command === 'errorOccurred') {
            await stopAutomation(`Error: ${request.message}.`);
        } 
        // Q&A Handlers
        else if (request.command === 'getChatAnswer') {
            const { normalizedQuestion } = request;
            const data = await chrome.storage.local.get(QNA_STORAGE_KEY);
            const qnaStore = data[QNA_STORAGE_KEY] || {};
            const answerData = qnaStore[normalizedQuestion] || null;
            sendResponse({ answerData });
        } 
        else if (request.command === 'storeChatAnswer') {
            const { normalizedQuestion, answer, inputType, answerSource } = request;
            const data = await chrome.storage.local.get(QNA_STORAGE_KEY);
            const qnaStore = data[QNA_STORAGE_KEY] || {};
            qnaStore[normalizedQuestion] = { answer, inputType, lastUpdated: Date.now(), source: answerSource || 'user_provided' };
            await chrome.storage.local.set({ [QNA_STORAGE_KEY]: qnaStore });
            sendResponse({ success: true });
        }
        else {
            console.log("Background: Received unhandled message command:", request.command);
            sendResponse({status: "unhandled_command", command: request.command});
        }
    })(); 
    return true; 
});


// --- Event Listeners & Core Logic ---

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tabId === activeTabId && changeInfo.status === 'complete' && automationRunning) {
        if (tab.url && tab.url.includes(RECOMMENDED_JOBS_URL)) {
            if (currentStatus !== "Idle" && !currentStatus.startsWith("Error:")) {
                 console.log("Background: Returned to recommended jobs page. Adding delay before processing.");
                 tabSwitchAttemptedForCurrentPageView = false; 
                 await new Promise(resolve => setTimeout(resolve, INITIAL_PROCESSING_DELAY));
                 await processRecommendedJobsPage();
            }
        } else if (tab.url && tab.url.includes(CONFIRMATION_URL_SUBSTRING)) {
            if (currentStatus.startsWith("Applied to") || currentStatus.includes("Chatbox") || currentStatus.startsWith("Waiting")) {
                 await handleApplicationConfirmation();
            }
        }
    }
});

async function processRecommendedJobsPage() {
    if (!automationRunning || !activeTabId || !activeProcessingTabId) {
        console.log("Background: processRecommendedJobsPage check failed: Automation not running, no active tab, or no target Naukri tab set.");
        // Don't stop here, might be in a transient state. Let the flow correct itself.
        return;
    }
    
    if (!tabSwitchAttemptedForCurrentPageView) {
        console.log(`Background: Attempting to switch to user-selected tab: '${activeProcessingTabId}'`);
        await updateGlobalStatus(`Verifying/switching to tab '${activeProcessingTabId}'...`, true);
        try {
            await sendMessageToContentScriptWithRetry(activeTabId, {
                action: 'switchToTab',
                targetTabId: activeProcessingTabId
            });
            tabSwitchAttemptedForCurrentPageView = true;
        } catch (error) {
            await stopAutomation(`Error: Failed to send 'switchToTab' message.`);
        }
    } else {
        console.log(`Background: Tab switch already handled for this view. Proceeding to select jobs.`);
        await selectJobsOnCurrentPage();
    }
}

async function selectJobsOnCurrentPage() {
    if (!automationRunning || !activeTabId) return;
    const currentProcessingTabId = activeProcessingTabId || "unknown";
    await updateGlobalStatus(`Selecting jobs on tab '${currentProcessingTabId}'...`, true);
    try {
        await sendMessageToContentScriptWithRetry(activeTabId, { action: 'selectAndApplyJobs', startIndex: 0, maxJobs: MAX_JOBS_TO_SELECT });
    } catch (error) {
        await stopAutomation(`Error: Failed to communicate on tab '${currentProcessingTabId}'.`);
    }
}

async function handleApplicationConfirmation() {
    if (!automationRunning) return;
    if (currentStatus.startsWith("Application confirmed.")) return; 
    const confirmedOnTab = activeProcessingTabId || "unknown";
    await updateGlobalStatus(`Application confirmed on tab '${confirmedOnTab}'. Returning...`, true);
    jobsAppliedInCurrentBatch = 0; 
    if (activeTabId) {
        try {
            await chrome.tabs.update(activeTabId, { url: RECOMMENDED_JOBS_URL });
        } catch (error) {
            await stopAutomation("Error: Failed to navigate back.");
            if (error.message.includes("No tab with id")) activeTabId = null;
        }
    } else {
        await stopAutomation("Error: No active tab to navigate back.");
    }
}

async function sendMessageToContentScriptWithRetry(tabId, message, retries = MAX_MESSAGE_RETRIES) {
    try {
        await chrome.tabs.get(tabId); 
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
    } catch (error) {
        if (retries > 0 && (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist"))) {
            console.warn(`Background: Connection error to tab ${tabId}. Retrying... (${retries -1} left)`);
            await new Promise(resolve => setTimeout(resolve, MESSAGE_RETRY_DELAY));
            return sendMessageToContentScriptWithRetry(tabId, message, retries - 1);
        } else {
            console.error(`Background: Final error sending message to tab ${tabId}:`, error);
            throw error; 
        }
    }
}

// --- Startup & Cleanup ---
chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (tabId === activeTabId && automationRunning) {
        await stopAutomation("Idle (Tab Closed)");
    }
});

(async () => {
    console.log("Service worker active/re-activated.");
    // On reactivation, retrieve running state but clear the specific processing tab ID.
    // The user will need to start again to define the target tab.
    const data = await chrome.storage.local.get(['automationRunning', 'currentStatus', QNA_STORAGE_KEY]);
    automationRunning = data.automationRunning || false;
    activeProcessingTabId = null; // Important: Force re-detection of tab on new session

    if (data[QNA_STORAGE_KEY] === undefined) {
        await chrome.storage.local.set({ [QNA_STORAGE_KEY]: {} });
    }
    if (automationRunning) {
        // If it was running, it's safer to reset to Idle as the context is lost
        await updateGlobalStatus("Idle (Recovered)", false); 
    } else {
        await updateGlobalStatus(data.currentStatus || "Idle", false);
    }
    console.log("Service worker initialized.");
})();
