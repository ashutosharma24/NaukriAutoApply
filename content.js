// content.js

console.log("Content.js (v5): Script execution started. Timestamp:", Date.now());

const RECOMMENDED_JOBS_URL_MATCHER = "/mnjuser/recommendedjobs";
const CONFIRMATION_URL_SUBSTRING_MATCHER = "/myapply/saveApply";
const CHATBOX_SELECTOR = "div#_7jl0sa5haChatbotContainer, div._chatBotContainer";
const CHATBOX_LOADER_SELECTOR = "div.chatbot_loadMore";
const CHECKBOX_ACTIVE_CLASS = 'naukicon-ot-Checked'; 
const JOB_ARTICLE_SELECTOR = 'article.jobTuple';
const JOB_CHECKBOX_CONTAINER_SELECTOR = 'div.tuple-check-box';
const JOB_CHECKBOX_ICON_SELECTOR = 'i.naukicon'; 
const JOB_TITLE_SELECTOR = '.title';
const MAIN_APPLY_BUTTON_SELECTOR = 'button.multi-apply-button';
const TABS_CONTAINER_SELECTOR = '.tabs-container';
const TAB_WRAPPER_BASE_SELECTOR = '.tab-wrapper'; 
const TAB_LIST_ITEM_SELECTOR = '.tab-list-item';
const TAB_ACTIVE_CLASS = 'tab-list-active'; 

let chatboxObserver = null;

console.log("Content.js (v5): Constants defined. CHECKBOX_ACTIVE_CLASS:", CHECKBOX_ACTIVE_CLASS);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function performClick(element, description) {
    if (element && typeof element.click === 'function') {
        console.log(`Content.js (v5): Clicking ${description}`);
        element.click();
        await sleep(150 + Math.random() * 100); 
        return true;
    }
    console.warn(`Content.js (v5): ${description} not found or not clickable.`);
    return false;
}

async function switchToTab(targetTabId) {
    console.log(`Content.js (v5): Attempting to switch to tab with ID: '${targetTabId}'`);
    const tabWrapper = document.querySelector(`${TABS_CONTAINER_SELECTOR} ${TAB_WRAPPER_BASE_SELECTOR}#${targetTabId}`);
    
    if (!tabWrapper) {
        console.warn(`Content.js (v5): Tab wrapper for ID '${targetTabId}' not found.`);
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: false, attemptedTabId: targetTabId, error: 'Tab wrapper not found' });
        return;
    }

    const tabListItem = tabWrapper.querySelector(TAB_LIST_ITEM_SELECTOR);
    if (!tabListItem) {
        console.warn(`Content.js (v5): Tab list item within wrapper ID '${targetTabId}' not found.`);
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: false, attemptedTabId: targetTabId, error: 'Tab list item not found' });
        return;
    }

    if (tabListItem.classList.contains(TAB_ACTIVE_CLASS)) {
        console.log(`Content.js (v5): Tab '${targetTabId}' is already active.`);
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: true, switchedToTabId: targetTabId, alreadyActive: true });
        return;
    }

    console.log(`Content.js (v5): Clicking tab list item for '${targetTabId}'.`);
    await performClick(tabListItem, `Tab list item for '${targetTabId}'`);
    await sleep(1500); 

    const tabListItemAfterClick = document.querySelector(`${TABS_CONTAINER_SELECTOR} ${TAB_WRAPPER_BASE_SELECTOR}#${targetTabId} ${TAB_LIST_ITEM_SELECTOR}`);
    if (tabListItemAfterClick && tabListItemAfterClick.classList.contains(TAB_ACTIVE_CLASS)) {
        console.log(`Content.js (v5): Successfully switched to tab '${targetTabId}'.`);
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: true, switchedToTabId: targetTabId, alreadyActive: false });
    } else {
        console.warn(`Content.js (v5): Failed to confirm switch to tab '${targetTabId}'. Tab did not become active.`);
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: false, attemptedTabId: targetTabId, error: 'Tab did not become active after click' });
    }
}

async function selectAndApplyJobs(startIndex, maxJobs) {
    console.log(`Content.js (v5): --- Starting selectAndApplyJobs --- Received StartIndex: ${startIndex}, MaxJobs: ${maxJobs}`);
    let jobsSelectedCount = 0;
    const allJobArticles = Array.from(document.querySelectorAll(JOB_ARTICLE_SELECTOR));
    console.log(`Content.js (v5): Found ${allJobArticles.length} total job articles on the current tab.`);

    if (allJobArticles.length === 0) {
        console.log("Content.js (v5): No job articles found on the current tab.");
        chrome.runtime.sendMessage({ command: 'noJobsToApply', message: "No job articles found on current tab." });
        return;
    }
    
    if (startIndex >= allJobArticles.length && allJobArticles.length > 0) { 
        console.log(`Content.js (v5): Start index (${startIndex}) is beyond available jobs (${allJobArticles.length}) on current tab.`);
        chrome.runtime.sendMessage({ command: 'noJobsToApply', message: "Start index beyond available jobs on current tab." });
        return;
    }
    
    let currentJobIndexOnPage = 0; 
    let unappliedJobsFoundAndAttemptedThisRun = 0;

    for (const jobArticle of allJobArticles) {
        const jobTitleElement = jobArticle.querySelector(JOB_TITLE_SELECTOR);
        const jobTitle = jobTitleElement ? jobTitleElement.title : 'Unknown Title';
        const jobId = jobArticle.getAttribute('data-job-id') || 'Unknown Job ID';

        if (currentJobIndexOnPage < startIndex) {
            currentJobIndexOnPage++;
            continue; 
        }
        if (unappliedJobsFoundAndAttemptedThisRun >= maxJobs) break; 

        const checkboxContainer = jobArticle.querySelector(JOB_CHECKBOX_CONTAINER_SELECTOR);
        const checkboxIcon = checkboxContainer ? checkboxContainer.querySelector(JOB_CHECKBOX_ICON_SELECTOR) : null;
        
        if (!checkboxContainer || !checkboxIcon) {
            if (unappliedJobsFoundAndAttemptedThisRun < maxJobs && currentJobIndexOnPage < maxJobs + 3) {
                console.warn(`Content.js (v5): Checkbox container/icon not found for job "${jobTitle}" (ID: ${jobId}). Skipping.`);
            }
            currentJobIndexOnPage++;
            continue;
        }

        const isAlreadySelected = checkboxIcon.classList.contains(CHECKBOX_ACTIVE_CLASS);
        if (isAlreadySelected) {
            // console.log(`Content.js (v5): Job "${jobTitle}" (ID: ${jobId}) is ALREADY SELECTED. Skipping.`);
        } else {
            if (checkboxIcon.classList.contains('naukicon-ot-checkbox')) { 
                console.log(`Content.js (v5): Attempting to select job: "${jobTitle}" (ID: ${jobId}).`);
                await performClick(checkboxContainer, `Job checkbox for "${jobTitle}"`);
                await sleep(500); 
                const iconAfterClick = checkboxContainer.querySelector(JOB_CHECKBOX_ICON_SELECTOR); 
                if (iconAfterClick && iconAfterClick.classList.contains(CHECKBOX_ACTIVE_CLASS)) { 
                    console.log(`Content.js (v5): SUCCESS - Job "${jobTitle}" (ID: ${jobId}) checkbox is now active.`);
                    unappliedJobsFoundAndAttemptedThisRun++;
                } else {
                    console.warn(`Content.js (v5): FAILURE - Job "${jobTitle}" (ID: ${jobId}) checkbox did NOT become active with class '${CHECKBOX_ACTIVE_CLASS}'.`);
                }
            }
        }
        currentJobIndexOnPage++;
    }
    
    jobsSelectedCount = unappliedJobsFoundAndAttemptedThisRun;
    console.log(`Content.js (v5): Total jobs selected in this run on current tab: ${jobsSelectedCount}`);

    if (jobsSelectedCount === 0) {
        console.log("Content.js (v5): No new jobs were selected in this run on current tab.");
        chrome.runtime.sendMessage({ command: 'noJobsToApply', message: "No new jobs were selected in this run on current tab." });
        return;
    }

    const applyButton = document.querySelector(MAIN_APPLY_BUTTON_SELECTOR);
    if (applyButton) {
        let retries = 20; 
        while (applyButton.disabled && retries > 0) {
            await sleep(500);
            retries--;
        }
        if (applyButton.disabled) {
            console.error("Content.js (v5): Main Apply button did not enable after selecting jobs.");
            chrome.runtime.sendMessage({ command: 'errorOccurred', error: "Apply button stuck disabled", message: "Apply button did not enable." });
            return;
        }
        console.log("Content.js (v5): Main Apply button is enabled. Clicking it.");
        if (await performClick(applyButton, "Main Apply button")) {
            chrome.runtime.sendMessage({ command: 'jobsSelectedAndApplied', jobsAttemptedCount: jobsSelectedCount });
            observeForChatbox();
        } else {
             chrome.runtime.sendMessage({ command: 'errorOccurred', error: "Failed to click Apply button", message: "Could not click Apply button." });
        }
    } else {
        console.error(`Content.js (v5): Main Apply button not found with selector '${MAIN_APPLY_BUTTON_SELECTOR}'.`);
        chrome.runtime.sendMessage({ command: 'errorOccurred', error: "Apply button not found", message: "Main Apply button selector missing." });
    }
    console.log(`Content.js (v5): --- Finished selectAndApplyJobs ---`);
}

function observeForChatbox() {
    if (chatboxObserver) chatboxObserver.disconnect(); 
    const targetNode = document.body;
    const config = { childList: true, subtree: true };
    chatboxObserver = new MutationObserver(() => {
        const chatboxElement = document.querySelector(CHATBOX_SELECTOR);
        if (chatboxElement && chatboxElement.offsetParent !== null) { 
            if (!chatboxElement.querySelector(CHATBOX_LOADER_SELECTOR)) {
                 console.log("Content.js (v5): Chatbox is not loading. Notifying background.");
                 chrome.runtime.sendMessage({ command: 'chatboxDetected' });
                 if(chatboxObserver) chatboxObserver.disconnect(); 
                 chatboxObserver = null;
            }
        }
    });
    chatboxObserver.observe(targetNode, config);
    console.log("Content.js (v5): Observer for chatbox started.");
    setTimeout(() => {
        if (chatboxObserver) chatboxObserver.disconnect();
        chatboxObserver = null;
    }, 15000);
}

function runInitialChecks() {
    const currentURL = window.location.href;
    console.log("Content.js (v5): runInitialChecks() called. URL:", currentURL);
    if (currentURL.includes(CONFIRMATION_URL_SUBSTRING_MATCHER)) {
        console.log("Content.js (v5): On confirmation page.");
        if (chatboxObserver) chatboxObserver.disconnect();
        chrome.runtime.sendMessage({ command: 'confirmationPageReached' });
    } else if (currentURL.includes(RECOMMENDED_JOBS_URL_MATCHER)) {
        const existingChatbox = document.querySelector(CHATBOX_SELECTOR);
        if (existingChatbox && existingChatbox.offsetParent !== null) {
            if (!existingChatbox.querySelector(CHATBOX_LOADER_SELECTOR)) {
                chrome.runtime.sendMessage({ command: 'chatboxDetected' });
            }
        }
    }
    console.log("Content.js (v5): runInitialChecks() finished.");
}

console.log("Content.js (v5): Setting up chrome.runtime.onMessage listener.");
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const receivedAction = request.action ? String(request.action).trim() : undefined;
    console.log(`Content.js (v5): Message received. Original action: '${request.action}', Trimmed action: '${receivedAction}'`);

    if (receivedAction === 'selectAndApplyJobs') {
        console.log(`Content.js (v5): Matched 'selectAndApplyJobs'. StartIndex: ${request.startIndex}`);
        const attemptSelection = () => {
            selectAndApplyJobs(request.startIndex, request.maxJobs)
                .catch(err => {
                    console.error("Content.js (v5): Error in selectAndApplyJobs promise:", err);
                    chrome.runtime.sendMessage({ command: 'errorOccurred', error: err.message, message: "Content script failed during job selection." });
                });
        };
        if (document.readyState === "complete" || document.readyState === "interactive") {
            attemptSelection();
        } else {
            window.addEventListener('DOMContentLoaded', attemptSelection, { once: true });
        }
        sendResponse({ status: "selectAndApplyJobs_initiated" }); 
        return true; 
    } else if (receivedAction === 'switchToTab') {
        console.log(`Content.js (v5): Matched 'switchToTab'. Target ID: ${request.targetTabId}`);
        switchToTab(request.targetTabId)
            .catch(err => {
                console.error("Content.js (v5): Error in switchToTab promise:", err);
                chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: false, attemptedTabId: request.targetTabId, error: `Exception during tab switch: ${err.message}` });
            });
        sendResponse({ status: "switchToTab_initiated" });
        return true; 
    } else {
        console.log(`Content.js (v5): Received unknown or undefined action. Original: '${request.action}', Trimmed: '${receivedAction}'`);
        sendResponse({ status: "unknown_action", received_action: receivedAction });
        // No return true needed here as sendResponse is synchronous for this else block
    }
});
console.log("Content.js (v5): chrome.runtime.onMessage listener SET UP.");

runInitialChecks();
console.log("Content.js (v5): Script execution finished.");
