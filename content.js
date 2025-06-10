// content.js (User-Selected Tab & Chat Logic v1)

console.log("Content.js (User-Selected Tab): Script execution started.");

// --- Constants ---
const RECOMMENDED_JOBS_URL_MATCHER = "/mnjuser/recommendedjobs";
const CONFIRMATION_URL_SUBSTRING_MATCHER = "/myapply/saveApply";
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

const CHATBOX_MAIN_CONTAINER_SELECTOR = "div._chatBotContainer";
const CHATBOX_MESSAGE_LIST_SELECTOR = "div.chatbot_MessageContainer ul.list"; 
const CHATBOX_BOT_MESSAGE_ITEM_SELECTOR = "li.botItem.chatbot_ListItem"; 
const CHATBOX_QUESTION_TEXT_SELECTOR = "div.botMsg > div > span"; 
const CHATBOX_TEXT_INPUT_SELECTOR = "div.textArea[contenteditable='true']"; 
const CHATBOX_SUBMIT_BUTTON_SELECTOR = "div.sendMsgbtn_container .sendMsg"; 

// --- Global variables ---
let isChatboxUiVisible = false;
let currentFullQuestionText = null;
let currentNormalizedQuestion = null; 
let lastProcessedBotMessageNode = null; 
let chatboxVisibilityObserver = null; 
let chatboxMessagesObserver = null; 
let chatboxSubmitButton = null; 
let chatboxSubmitButtonListenerAttached = false; 

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'had', 'do', 'does', 'did', 
    'will', 'would', 'should', 'can', 'could', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'your', 'him', 'her', 'us', 'them', 'my', 'his', 'its', 'our', 'their', 'what', 'which', 'who', 'whom', 
    'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'by', 'for', 'with', 
    'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 
    'up', 'down', 'out', 'off', 'how', 'many', 'please', 'kindly', 'tell', 'me', 'of', 'experience', 'salary', 'ctc',
    'expected', 'notice', 'period', 'current', 'location', 'years', 'yr', 'yrs', 'relevant', 'per', 'annum', 'lakhs'
]); 

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function normalizeQuestionText(text) {
    if (!text) return "";
    const cleanedText = text.toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
    const words = cleanedText.split(" ");
    const keywords = words.filter(word => word.length > 1 && !STOP_WORDS.has(word));
    return keywords.sort().join("|"); 
}
async function performClick(element, description) {
    if (element && typeof element.click === 'function') {
        console.log(`Content.js: Clicking ${description}`);
        element.click();
        await sleep(200); 
        return true;
    }
    console.warn(`Content.js: ${description} not found or not clickable.`);
    return false;
}

// --- New Function to Detect Active Tab ---
function detectAndSendActiveTab() {
    console.log("Content.js: Attempting to detect active Naukri tab.");
    const activeTabListItem = document.querySelector(`${TABS_CONTAINER_SELECTOR} ${TAB_LIST_ITEM_SELECTOR}.${TAB_ACTIVE_CLASS}`);
    if (activeTabListItem) {
        const activeTabWrapper = activeTabListItem.closest(TAB_WRAPPER_BASE_SELECTOR);
        if (activeTabWrapper && activeTabWrapper.id) {
            console.log(`Content.js: Found active tab wrapper with ID: '${activeTabWrapper.id}'. Sending to background.`);
            chrome.runtime.sendMessage({ command: 'setActiveTabAndStart', activeTabId: activeTabWrapper.id });
            return;
        }
    }
    console.warn("Content.js: Could not find an active Naukri tab element.");
    chrome.runtime.sendMessage({ command: 'setActiveTabAndStart', activeTabId: null }); // Inform background that none was found
}

// --- Chatbox Functions (largely unchanged) ---
function handleNewBotQuestion(questionElement) {
    if (!questionElement || questionElement === lastProcessedBotMessageNode) return;
    lastProcessedBotMessageNode = questionElement;
    const questionTextElement = questionElement.querySelector(CHATBOX_QUESTION_TEXT_SELECTOR);
    if (questionTextElement) {
        currentFullQuestionText = questionTextElement.textContent.trim();
        currentNormalizedQuestion = normalizeQuestionText(currentFullQuestionText);
        console.log(`Content.js: New Question: "${currentFullQuestionText}" (Normalized: "${currentNormalizedQuestion}")`);
        chrome.runtime.sendMessage({ command: 'chatboxQuestionPresented', questionText: currentFullQuestionText });
        if (currentNormalizedQuestion) {
            chrome.runtime.sendMessage({ command: 'getChatAnswer', normalizedQuestion: currentNormalizedQuestion }, (response) => {
                if (response && response.answerData) {
                    console.log("Content.js: Received stored answer:", response.answerData);
                    prefillAnswer(response.answerData);
                }
            });
        }
    }
}
function prefillAnswer(answerData) {
    if (!answerData || !answerData.answer) return;
    const activeChatbox = document.querySelector(CHATBOX_MAIN_CONTAINER_SELECTOR + ":not([style*='display: none'])");
    if (!activeChatbox) return;
    const textInput = activeChatbox.querySelector(CHATBOX_TEXT_INPUT_SELECTOR);
    if (textInput && (answerData.inputType === 'text' || !answerData.inputType)) {
        textInput.textContent = answerData.answer; 
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // TODO: Add logic for other input types
}
function getCurrentAnswerFromInputs() {
    const activeChatbox = document.querySelector(CHATBOX_MAIN_CONTAINER_SELECTOR + ":not([style*='display: none'])");
    if (!activeChatbox) return { answer: null, inputType: 'unknown' };
    const textInput = activeChatbox.querySelector(CHATBOX_TEXT_INPUT_SELECTOR);
    if (textInput && textInput.textContent.trim() !== "") {
        return { answer: textInput.textContent.trim(), inputType: 'text' };
    }
    return { answer: null, inputType: 'unknown' }; 
}
async function handleChatSubmit() {
    if (!currentNormalizedQuestion || !isChatboxUiVisible) return;
    const { answer, inputType } = getCurrentAnswerFromInputs();
    if (answer !== null && answer !== "") { 
        console.log(`Content.js: User submitted answer for "${currentFullQuestionText}". Answer: "${answer}"`);
        const storedAnswerResponse = await chrome.runtime.sendMessage({ command: 'getChatAnswer', normalizedQuestion: currentNormalizedQuestion });
        let answerSource = (storedAnswerResponse && storedAnswerResponse.answerData) ? 'user_corrected' : 'user_provided_new';
        if (storedAnswerResponse && storedAnswerResponse.answerData && storedAnswerResponse.answerData.answer === answer) answerSource = 'user_confirmed_prefill';
        chrome.runtime.sendMessage({ command: 'storeChatAnswer', normalizedQuestion: currentNormalizedQuestion, answer, inputType, answerSource });
    }
    await sleep(500); 
    currentFullQuestionText = null;
    currentNormalizedQuestion = null;
    lastProcessedBotMessageNode = null; 
}
function setupChatboxSubmitListener() {
    if (chatboxSubmitButtonListenerAttached) return;
    const activeChatbox = document.querySelector(CHATBOX_MAIN_CONTAINER_SELECTOR + ":not([style*='display: none'])");
    if (!activeChatbox) return;
    chatboxSubmitButton = activeChatbox.querySelector(CHATBOX_SUBMIT_BUTTON_SELECTOR);
    if (chatboxSubmitButton) {
        chatboxSubmitButton.removeEventListener('click', handleChatSubmit, true); 
        chatboxSubmitButton.addEventListener('click', handleChatSubmit, true); 
        chatboxSubmitButtonListenerAttached = true;
    }
}
function removeChatboxSubmitListener() {
    if (chatboxSubmitButton && chatboxSubmitButtonListenerAttached) {
        chatboxSubmitButton.removeEventListener('click', handleChatSubmit, true);
        chatboxSubmitButtonListenerAttached = false;
    }
}
function startChatboxMessagesObserver(chatboxElement) {
    if (chatboxMessagesObserver) chatboxMessagesObserver.disconnect();
    const messageList = chatboxElement.querySelector(CHATBOX_MESSAGE_LIST_SELECTOR);
    if (!messageList) return;
    chatboxMessagesObserver = new MutationObserver((mutationsList) => {
        mutationsList.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches(CHATBOX_BOT_MESSAGE_ITEM_SELECTOR) && node.querySelector(CHATBOX_QUESTION_TEXT_SELECTOR)) {
                         handleNewBotQuestion(node);
                    }
                });
            }
        });
        if(isChatboxUiVisible && !chatboxSubmitButtonListenerAttached) setupChatboxSubmitListener();
    });
    chatboxMessagesObserver.observe(messageList, { childList: true });
    const existingBotMessages = messageList.querySelectorAll(`${CHATBOX_BOT_MESSAGE_ITEM_SELECTOR}:has(${CHATBOX_QUESTION_TEXT_SELECTOR})`);
    if (existingBotMessages.length > 0) handleNewBotQuestion(existingBotMessages[existingBotMessages.length - 1]);
    if(isChatboxUiVisible && !chatboxSubmitButtonListenerAttached) setupChatboxSubmitListener();
}
function stopChatboxMessagesObserver() {
    if (chatboxMessagesObserver) chatboxMessagesObserver.disconnect();
    removeChatboxSubmitListener();
}
function initializeChatboxDetection() {
    if (chatboxVisibilityObserver) chatboxVisibilityObserver.disconnect();
    chatboxVisibilityObserver = new MutationObserver(() => {
        const chatboxElement = document.querySelector(CHATBOX_MAIN_CONTAINER_SELECTOR);
        const nowVisible = chatboxElement && chatboxElement.offsetParent !== null;
        if (nowVisible && !isChatboxUiVisible) {
            console.log("Content.js: Chatbox became visible.");
            isChatboxUiVisible = true;
            lastProcessedBotMessageNode = null; 
            startChatboxMessagesObserver(chatboxElement);
        } else if (!nowVisible && isChatboxUiVisible) {
            console.log("Content.js: Chatbox became hidden.");
            isChatboxUiVisible = false;
            stopChatboxMessagesObserver();
            currentFullQuestionText = null; 
            currentNormalizedQuestion = null;
        }
    });
    chatboxVisibilityObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    const chatboxElement = document.querySelector(CHATBOX_MAIN_CONTAINER_SELECTOR);
    if (chatboxElement && chatboxElement.offsetParent !== null) {
        if (!isChatboxUiVisible) {
            isChatboxUiVisible = true;
            startChatboxMessagesObserver(chatboxElement);
        }
    } else {
        isChatboxUiVisible = false;
    }
}

// --- General Page Functions (Tab Switching, Job Selection) ---
async function switchToTab(targetTabId) {
    console.log(`Content.js: Attempting to switch to tab with ID: '${targetTabId}'`);
    const tabWrapper = document.querySelector(`${TABS_CONTAINER_SELECTOR} ${TAB_WRAPPER_BASE_SELECTOR}#${targetTabId}`);
    if (!tabWrapper) {
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: false, attemptedTabId: targetTabId, error: 'Tab wrapper not found' });
        return;
    }
    const tabListItem = tabWrapper.querySelector(TAB_LIST_ITEM_SELECTOR);
    if (!tabListItem) {
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: false, attemptedTabId: targetTabId, error: 'Tab list item not found' });
        return;
    }
    if (tabListItem.classList.contains(TAB_ACTIVE_CLASS)) {
        console.log(`Content.js: Tab '${targetTabId}' is already active.`);
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: true, switchedToTabId: targetTabId, alreadyActive: true });
        return;
    }
    await performClick(tabListItem, `Tab list item for '${targetTabId}'`);
    await sleep(1500); 
    const tabListItemAfterClick = document.querySelector(`${TABS_CONTAINER_SELECTOR} ${TAB_WRAPPER_BASE_SELECTOR}#${targetTabId} ${TAB_LIST_ITEM_SELECTOR}`);
    if (tabListItemAfterClick && tabListItemAfterClick.classList.contains(TAB_ACTIVE_CLASS)) {
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: true, switchedToTabId: targetTabId, alreadyActive: false });
    } else {
        chrome.runtime.sendMessage({ command: 'tabSwitchResult', success: false, attemptedTabId: targetTabId, error: 'Tab did not become active' });
    }
}
async function selectAndApplyJobs(startIndex, maxJobs) {
    console.log(`Content.js: --- Starting selectAndApplyJobs ---`);
    let jobsSelectedCount = 0;
    const allJobArticles = Array.from(document.querySelectorAll(JOB_ARTICLE_SELECTOR));
    if (allJobArticles.length === 0) {
        chrome.runtime.sendMessage({ command: 'noJobsToApply' });
        return;
    }
    let unappliedJobsFoundAndAttemptedThisRun = 0;
    for (const jobArticle of allJobArticles) {
        if (unappliedJobsFoundAndAttemptedThisRun >= maxJobs) break; 
        const checkboxContainer = jobArticle.querySelector(JOB_CHECKBOX_CONTAINER_SELECTOR);
        const checkboxIcon = checkboxContainer ? checkboxContainer.querySelector(JOB_CHECKBOX_ICON_SELECTOR) : null;
        if (checkboxContainer && checkboxIcon && !checkboxIcon.classList.contains(CHECKBOX_ACTIVE_CLASS) && checkboxIcon.classList.contains('naukicon-ot-checkbox')) { 
            await performClick(checkboxContainer, `Job checkbox`);
            await sleep(500); 
            const iconAfterClick = checkboxContainer.querySelector(JOB_CHECKBOX_ICON_SELECTOR); 
            if (iconAfterClick && iconAfterClick.classList.contains(CHECKBOX_ACTIVE_CLASS)) { 
                unappliedJobsFoundAndAttemptedThisRun++;
            }
        }
    }
    jobsSelectedCount = unappliedJobsFoundAndAttemptedThisRun;
    if (jobsSelectedCount === 0) {
        chrome.runtime.sendMessage({ command: 'noJobsToApply' });
        return;
    }
    const applyButton = document.querySelector(MAIN_APPLY_BUTTON_SELECTOR);
    if (applyButton) {
        let retries = 20; 
        while (applyButton.disabled && retries > 0) { await sleep(500); retries--; }
        if (applyButton.disabled) {
            chrome.runtime.sendMessage({ command: 'errorOccurred', message: "Apply button did not enable." });
            return;
        }
        if (await performClick(applyButton, "Main Apply button")) {
            chrome.runtime.sendMessage({ command: 'jobsSelectedAndApplied', jobsAttemptedCount: jobsSelectedCount });
        } else {
             chrome.runtime.sendMessage({ command: 'errorOccurred', message: "Could not click Apply button." });
        }
    } else {
        chrome.runtime.sendMessage({ command: 'errorOccurred', message: "Main Apply button missing." });
    }
}
function runInitialChecks() {
    console.log("Content.js: runInitialChecks() called.");
    if (window.location.href.includes(CONFIRMATION_URL_SUBSTRING_MATCHER)) {
        chrome.runtime.sendMessage({ command: 'confirmationPageReached' });
    } else if (window.location.href.includes(RECOMMENDED_JOBS_URL_MATCHER)) {
        initializeChatboxDetection(); 
    }
}

// --- Message Listener ---
console.log("Content.js: Setting up chrome.runtime.onMessage listener.");
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const receivedAction = request.action ? String(request.action).trim() : undefined;
    console.log(`Content.js: Message received. Action: '${receivedAction}'`);
    switch(receivedAction) {
        case 'detectActiveTab':
            detectAndSendActiveTab();
            sendResponse({status: "detectActiveTab_initiated"});
            break;
        case 'selectAndApplyJobs':
            const attemptSelection = () => selectAndApplyJobs(request.startIndex, request.maxJobs).catch(err => console.error("Error in selectAndApplyJobs:", err));
            if (document.readyState === "complete" || document.readyState === "interactive") attemptSelection();
            else window.addEventListener('DOMContentLoaded', attemptSelection, { once: true });
            sendResponse({ status: "selectAndApplyJobs_initiated" }); 
            break;
        case 'switchToTab':
            switchToTab(request.targetTabId).catch(err => console.error("Error in switchToTab:", err));
            sendResponse({ status: "switchToTab_initiated" });
            break;
        default:
            console.log(`Content.js: Received unknown action: '${receivedAction}'`);
            sendResponse({ status: "unknown_action" });
    }
    return true; // Keep channel open for async responses
});
console.log("Content.js: chrome.runtime.onMessage listener SET UP.");

runInitialChecks();
console.log("Content.js: Script execution finished initial setup.");
