// background.js (Service Worker)

// Constants
const RECOMMENDED_JOBS_URL = "https://www.naukri.com/mnjuser/recommendedjobs";
const CONFIRMATION_URL_SUBSTRING = "/myapply/saveApply";
const MAX_JOBS_TO_SELECT = 5;
const MESSAGE_RETRY_DELAY = 750; // ms
const MAX_MESSAGE_RETRIES = 4; 
const INITIAL_PROCESSING_DELAY = 1500; // ms 
const TAB_SWITCH_DELAY = 1000; // ms to wait after attempting a tab click

const TAB_IDS_IN_ORDER = ['top_candidate', 'profile', 'apply', 'preference', 'similar_jobs'];

// Initial state
let automationRunning = false;
let nextJobStartIndex = 0; // Always 0 for a new tab/page processing
let currentStatus = "Idle";
let activeTabId = null;
let jobsAppliedInCurrentBatch = 0; 
let currentTabIndex = 0; // Index for TAB_IDS_IN_ORDER
let tabSwitchAttemptedForCurrentPageView = false; // Runtime flag, not stored

// Function to update status and inform popup
async function updateGlobalStatus(newStatus, newAutomationRunningState = automationRunning) {
    currentStatus = newStatus;
    automationRunning = newAutomationRunningState;
    console.log(`Background: Status - ${currentStatus}, Running - ${automationRunning}, Current Tab Index - ${currentTabIndex}`);
    await chrome.storage.local.set({
        automationRunning: automationRunning,
        currentTabIndex: currentTabIndex, // Store currentTabIndex
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

// Load initial state from storage
chrome.runtime.onStartup.addListener(async () => {
    console.log("Extension started up.");
    const data = await chrome.storage.local.get(['automationRunning', 'currentTabIndex', 'currentStatus']);
    automationRunning = data.automationRunning || false;
    currentTabIndex = data.currentTabIndex || 0;
    nextJobStartIndex = 0; 
    currentStatus = data.currentStatus || "Idle";
    if (automationRunning) {
        console.log("Automation was running on startup, resetting to Idle.");
        await updateGlobalStatus("Idle", false); // currentTabIndex will be preserved from storage if needed
    }
    console.log("Initial state loaded:", { automationRunning, currentTabIndex, currentStatus });
});

// Listener for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => { 
        if (request.command === 'startAutomation') {
            if (!automationRunning) {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs.length > 0) {
                    activeTabId = tabs[0].id;
                    currentTabIndex = 0; // Start with the first tab in the order
                    tabSwitchAttemptedForCurrentPageView = false;
                    await updateGlobalStatus("Starting...", true);
                    nextJobStartIndex = 0; 
                    jobsAppliedInCurrentBatch = 0;
                    if (tabs[0].url && tabs[0].url.includes(RECOMMENDED_JOBS_URL)) {
                        console.log("Background: Already on recommended jobs page. Adding delay then processing.");
                        await new Promise(resolve => setTimeout(resolve, INITIAL_PROCESSING_DELAY));
                        await processRecommendedJobsPage();
                    } else {
                        await updateGlobalStatus("Navigating to recommended jobs...", true);
                        await chrome.tabs.update(activeTabId, { url: RECOMMENDED_JOBS_URL });
                    }
                } else {
                    await updateGlobalStatus("Error: No active tab found.", false);
                }
            }
            sendResponse({ automationRunning: automationRunning, status: currentStatus });
        } else if (request.command === 'stopAutomation') {
            await updateGlobalStatus("Idle", false);
            activeTabId = null;
            sendResponse({ automationRunning: automationRunning, status: currentStatus });
        } else if (request.command === 'getStatus') {
            const data = await chrome.storage.local.get(['automationRunning', 'currentStatus', 'currentTabIndex']);
            sendResponse({ automationRunning: data.automationRunning || automationRunning, status: data.currentStatus || currentStatus, currentTabIndex: data.currentTabIndex || 0 });
        } else if (request.command === 'jobsSelectedAndApplied') {
            jobsAppliedInCurrentBatch = request.jobsAttemptedCount; 
            await updateGlobalStatus(`Applied to ${jobsAppliedInCurrentBatch} jobs on tab '${TAB_IDS_IN_ORDER[currentTabIndex]}'. Waiting...`, true);
        } else if (request.command === 'chatboxDetected') {
            await updateGlobalStatus("Chatbox detected. Waiting for user...", true);
        } else if (request.command === 'confirmationPageReached') {
            await handleApplicationConfirmation();
        } else if (request.command === 'tabSwitchResult') {
            if (request.success) {
                console.log(`Background: Successfully switched to/confirmed tab '${request.switchedToTabId}'. Proceeding to select jobs.`);
                await updateGlobalStatus(`On tab '${request.switchedToTabId}'. Selecting jobs...`, true);
                await selectJobsOnCurrentPage(); // New function to just select jobs
            } else {
                console.warn(`Background: Failed to switch to tab '${request.attemptedTabId}'. Error: ${request.error}. Trying next tab.`);
                await handleNoJobsOrTabSwitchFail();
            }
        } else if (request.command === 'noJobsToApply') {
            console.log(`Background: No more selectable jobs on tab '${TAB_IDS_IN_ORDER[currentTabIndex]}'. Trying next tab.`);
            await handleNoJobsOrTabSwitchFail();
        } else if (request.command === 'errorOccurred') {
            console.error("Background: Error from content script:", request.error, "Message:", request.message);
            await updateGlobalStatus(`Error: ${request.message}. Stopping.`, false);
        } else {
            console.log("Background: Received unhandled message command:", request.command);
            sendResponse({status: "unhandled_command", command: request.command});
        }
    })(); 
    return true; 
});

async function handleNoJobsOrTabSwitchFail() {
    currentTabIndex++;
    tabSwitchAttemptedForCurrentPageView = false; // Reset for the new tab
    if (currentTabIndex < TAB_IDS_IN_ORDER.length) {
        const nextTabId = TAB_IDS_IN_ORDER[currentTabIndex];
        await updateGlobalStatus(`Switching to next tab: '${nextTabId}'...`, true);
        await processRecommendedJobsPage(); // This will trigger the tab switch logic
    } else {
        await updateGlobalStatus("All tabs processed. No more jobs. Stopping.", false);
        chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: 'Naukri Automator', message: 'All tabs processed. Automation stopped.'});
    }
}

// Listener for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tabId === activeTabId && changeInfo.status === 'complete' && automationRunning) {
        console.log(`Background: Tab updated. URL: ${tab.url}, Current Status: ${currentStatus}`);
        if (tab.url && tab.url.includes(RECOMMENDED_JOBS_URL)) {
            if (currentStatus !== "Idle" && !currentStatus.startsWith("Error:")) {
                 console.log("Background: Reached recommended jobs page. Resetting tab switch flag and adding delay.");
                 tabSwitchAttemptedForCurrentPageView = false; // Reset for the reloaded page
                 await new Promise(resolve => setTimeout(resolve, INITIAL_PROCESSING_DELAY));
                 await processRecommendedJobsPage();
            } else {
                console.log("Background: Tab updated to recommended jobs, but no processing due to status:", currentStatus);
            }
        } else if (tab.url && tab.url.includes(CONFIRMATION_URL_SUBSTRING)) {
            if (currentStatus.startsWith("Applied to") || currentStatus.startsWith("Chatbox detected") || currentStatus.startsWith("Waiting")) {
                 await handleApplicationConfirmation();
            }
        }
    }
});

async function sendMessageToContentScriptWithRetry(tabId, message, retries = MAX_MESSAGE_RETRIES) {
    try {
        await chrome.tabs.get(tabId); 
        // console.log(`Background: Attempting to send message to tab ${tabId}, retries left: ${retries}`, message); // Can be noisy
        const response = await chrome.tabs.sendMessage(tabId, message);
        // console.log("Background: Message sent successfully, response:", response); // Can be noisy
        return response;
    } catch (error) {
        if (retries > 0 && (error.message.includes("Could not establish connection") || error.message.includes("No tab with id") || error.message.includes("Receiving end does not exist"))) {
            console.warn(`Background: Connection error with tab ${tabId} ("${error.message}"). Retrying in ${MESSAGE_RETRY_DELAY}ms... (${retries -1} retries left)`);
            await new Promise(resolve => setTimeout(resolve, MESSAGE_RETRY_DELAY));
            return sendMessageToContentScriptWithRetry(tabId, message, retries - 1);
        } else {
            console.error(`Background: Error sending message to content script in tab ${tabId} after all retries or for a different error:`, error);
            throw error; 
        }
    }
}

async function processRecommendedJobsPage() {
    if (!automationRunning || !activeTabId) {
        console.log("Background: processRecommendedJobsPage check: Automation not running or no active tab.");
        return;
    }
    
    if (currentTabIndex >= TAB_IDS_IN_ORDER.length) {
        console.log("Background: All tabs have been processed according to currentTabIndex.");
        await updateGlobalStatus("All tabs processed. Stopping.", false);
        chrome.notifications.create({ type: 'basic', iconUrl: 'images/icon48.png', title: 'Naukri Automator', message: 'Finished all configured tabs.'});
        return;
    }

    const targetTabId = TAB_IDS_IN_ORDER[currentTabIndex];

    if (!tabSwitchAttemptedForCurrentPageView) {
        console.log(`Background: Attempting to switch to tab: '${targetTabId}' (Index: ${currentTabIndex})`);
        await updateGlobalStatus(`Switching to tab '${targetTabId}'...`, true);
        try {
            await sendMessageToContentScriptWithRetry(activeTabId, {
                action: 'switchToTab',
                targetTabId: targetTabId
            });
            tabSwitchAttemptedForCurrentPageView = true;
            // Wait for 'tabSwitchResult' message from content.js
        } catch (error) {
            console.error(`Background: Failed to send switchToTab message for '${targetTabId}'. Error: ${error.message}`);
            await handleNoJobsOrTabSwitchFail(); // Treat as a tab switch failure
        }
    } else {
        // Tab switch was already attempted for this page view (or not needed initially)
        // This path is usually taken after a successful tabSwitchResult
        console.log(`Background: Tab switch already handled for this view (tab '${targetTabId}'). Proceeding to select jobs.`);
        await selectJobsOnCurrentPage();
    }
}

async function selectJobsOnCurrentPage() {
    if (!automationRunning || !activeTabId) return;

    nextJobStartIndex = 0; 
    const currentProcessingTabId = TAB_IDS_IN_ORDER[currentTabIndex] || "unknown";
    console.log(`Background: Set nextJobStartIndex to 0 for processing tab '${currentProcessingTabId}'.`);
    await updateGlobalStatus(`Selecting jobs on tab '${currentProcessingTabId}'...`, true);

    try {
        await sendMessageToContentScriptWithRetry(activeTabId, {
            action: 'selectAndApplyJobs',
            startIndex: nextJobStartIndex, 
            maxJobs: MAX_JOBS_TO_SELECT
        });
    } catch (error) {
        console.error(`Background: Failed to send 'selectAndApplyJobs' message for tab '${currentProcessingTabId}'.`, error.message);
        // If communication fails here, it's a more critical error, stop.
        await updateGlobalStatus(`Error: Failed to communicate with page on tab '${currentProcessingTabId}'. Stopping.`, false);
    }
}


async function handleApplicationConfirmation() {
    if (!automationRunning) return;
    if (currentStatus === "Application confirmed. Returning to jobs page..." || currentStatus === "Returning to jobs page...") {
        return;
    }
    const confirmedOnTab = TAB_IDS_IN_ORDER[currentTabIndex] || "unknown";
    await updateGlobalStatus(`Application confirmed on tab '${confirmedOnTab}'. Returning to jobs page...`, true);
    
    await chrome.storage.local.set({ nextJobStartIndex: 0 }); // nextJobStartIndex is always 0 for a new page view
    console.log(`Background: Application confirmed. nextJobStartIndex will be 0 for next cycle on tab '${confirmedOnTab}'.`);
    jobsAppliedInCurrentBatch = 0; 

    if (activeTabId) {
        try {
            // When navigating back, tabSwitchAttemptedForCurrentPageView will be reset by onUpdated listener
            await chrome.tabs.update(activeTabId, { url: RECOMMENDED_JOBS_URL });
        } catch (error) {
            console.error("Background: Error navigating back:", error);
            await updateGlobalStatus("Error: Failed to navigate back. Stopping.", false);
            if (error.message.includes("No tab with id")) activeTabId = null;
        }
    } else {
        await updateGlobalStatus("Error: No active tab to navigate back. Stopping.", false);
    }
}

// Clean up if the tab is closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    if (tabId === activeTabId && automationRunning) {
        console.log("Background: Active tab closed. Stopping.");
        await updateGlobalStatus("Idle (Tab Closed)", false);
        activeTabId = null;
    }
});

// Initial load of state
(async () => {
    console.log("Service worker active/re-activated.");
    const data = await chrome.storage.local.get(['automationRunning', 'currentTabIndex', 'currentStatus']);
    automationRunning = data.automationRunning || false;
    currentTabIndex = data.currentTabIndex || 0;
    nextJobStartIndex = 0; 
    if (automationRunning && (data.currentStatus !== "Idle" && !data.currentStatus.startsWith("Error:"))) {
        currentStatus = "Idle (Recovered)";
        automationRunning = false; 
    } else {
        currentStatus = data.currentStatus || "Idle";
    }
    await updateGlobalStatus(currentStatus, automationRunning); 
    console.log("Service worker initialized state:", { automationRunning, currentTabIndex, currentStatus });
})();
