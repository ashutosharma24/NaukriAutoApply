// content.js - Runs on the recommended jobs page
console.log("Naukri AutoApply: Content script loaded");

// Global variables
let isProcessing = false;
let chatOverlayObserver = null;

// Start the automation process when the page is fully loaded
window.addEventListener('load', () => {
  console.log("Page loaded, starting auto-apply process");
  setTimeout(initAutoApply, 2000); // Give the page a moment to fully render
});

// Initialize the auto-apply process
function initAutoApply() {
  console.log("Initializing auto-apply");
  
  // Check if we're on the right page
  if (!window.location.href.includes("naukri.com/mnjuser/recommendedjobs")) {
    console.log("Not on the recommended jobs page, exiting");
    return;
  }
  
  // Check if the page has finished loading job listings
  const checkPageReady = () => {
    const jobListings = findJobCheckboxes();
    
    if (jobListings.length > 0) {
      console.log(`Page ready with ${jobListings.length} job listings`);
      // Start the auto-apply cycle if automation is active
      if (autoApplyActive) {
        autoApplyCycle();
      }
    } else {
      console.log("Page not ready yet, waiting...");
      // Try again after a delay
      setTimeout(checkPageReady, 1000);
    }
  };
  
  // Start checking if the page is ready
  checkPageReady();
}

// The main auto-apply cycle function
function autoApplyCycle() {
  console.log("Starting auto-apply cycle");
  
  // If automation is disabled or already processing, don't start another cycle
  if (!autoApplyActive) {
    console.log("Auto-apply is disabled, exiting cycle");
    return;
  }
  
  if (isProcessing) {
    console.log("Already processing, skipping");
    return;
  }
  
  // Check if chat overlay is present
  if (isChatOverlayPresent()) {
    console.log("Chat overlay detected, waiting for user input");
    observeChatOverlay();
    return;
  }
  
  // Start processing
  isProcessing = true;
  
  // Find job checkboxes
  const jobCheckboxes = findJobCheckboxes();
  console.log(`Found ${jobCheckboxes.length} job checkboxes`);
  
  // If no job checkboxes found, try to wait and retry
  if (jobCheckboxes.length === 0) {
    console.log("No job checkboxes found, waiting and retrying");
    isProcessing = false;
    
    // Try again after a delay if auto-apply is still active
    setTimeout(() => {
      if (autoApplyActive) {
        console.log("Retrying auto-apply cycle");
        autoApplyCycle();
      }
    }, 3000);
    return;
  }
  
  // Select up to 5 unchecked jobs
  const selectedJobs = selectJobCheckboxes(jobCheckboxes, 5);
  console.log(`Selected ${selectedJobs} jobs`);
  
  // If no jobs were selected, we might be done
  if (selectedJobs === 0) {
    // Check if there are any jobs that are already selected
    const anySelected = document.querySelectorAll('[class*="checkbox-selected"]').length > 0;
    
    if (anySelected) {
      console.log("No new jobs selected but some are already selected, proceeding to apply");
      // Click the apply button since there are already selected jobs
      setTimeout(() => {
        clickApplyButton();
      }, 1000);
    } else {
      console.log("No more jobs to apply for");
      isProcessing = false;
      return;
    }
  } else {
    // Click the apply button for newly selected jobs
    setTimeout(() => {
      clickApplyButton();
    }, 1000);
  }
}

// Find job checkboxes on the page
function findJobCheckboxes() {
  // Based on the provided DOM structure
  // Checkboxes are in the dspIB saveJobContainer tuple-check-box divs
  const checkboxContainers = document.querySelectorAll('.dspIB.saveJobContainer.tuple-check-box');
  
  // Fallback to other potential selectors if the primary one doesn't work
  if (!checkboxContainers || checkboxContainers.length === 0) {
    const fallbacks = [
      document.querySelectorAll('.tuple-check-box'),
      document.querySelectorAll('.jobTuple .saveJobContainer'),
      document.querySelectorAll('.jobTuple [class*="check-box"]')
    ];
    
    for (const selector of fallbacks) {
      if (selector && selector.length > 0) {
        return Array.from(selector);
      }
    }
  }
  
  return Array.from(checkboxContainers);
}

// Select up to maxCount unchecked job checkboxes
function selectJobCheckboxes(checkboxes, maxCount) {
  let selectedCount = 0;
  
  // Get already checked boxes - use multiple selector options based on the DOM structure
  const checkedBoxesSelectors = [
    '.dspIB.saveJobContainer.tuple-check-box i.naukicon-ot-checkbox-selected',
    '.tuple-check-box i.naukicon-ot-checkbox-selected',
    '.jobTuple .saveJobContainer i[class*="checkbox-selected"]'
  ];
  
  let checkedBoxes = [];
  for (const selector of checkedBoxesSelectors) {
    const selected = document.querySelectorAll(selector);
    if (selected && selected.length > 0) {
      checkedBoxes = selected;
      break;
    }
  }
  
  console.log(`Already checked boxes: ${checkedBoxes.length}`);
  
  // If we already have 5 checked, don't do anything
  if (checkedBoxes.length >= 5) {
    console.log("Already have 5 jobs selected");
    clickApplyButton();
    return 0;
  }
  
  // How many more we can select
  const remainingSelections = 5 - checkedBoxes.length;
  
  for (const container of checkboxes) {
    // Find the checkbox icon - try multiple possible selectors
    const checkbox = container.querySelector('i.naukicon-ot-checkbox') || 
                     container.querySelector('i[class*="checkbox"]:not([class*="selected"])');
    
    // If this checkbox is not already selected and we haven't reached max count
    if (checkbox && !checkbox.classList.contains('naukicon-ot-checkbox-selected') && selectedCount < remainingSelections) {
      // Click the checkbox
      console.log("Clicking a checkbox");
      checkbox.click();
      selectedCount++;
      
      // If we've reached the max, stop
      if (selectedCount >= maxCount) {
        break;
      }
    }
  }
  
  return selectedCount;
}

// Click the apply button
function clickApplyButton() {
  console.log("Attempting to click apply button");
  
  // Find the apply button - using multiple possible selectors based on the DOM structure
  const applyButtonSelectors = [
    '.multi-apply-button',
    'button.multi-apply-button',
    '.head-body .fright button',
    'button:contains("Apply")',
    '[class*="apply-button"]'
  ];
  
  let applyButton = null;
  
  // Try each selector until we find a match
  for (const selector of applyButtonSelectors) {
    try {
      if (selector.includes(':contains')) {
        // Handle the jQuery-like :contains selector
        const text = selector.match(/:contains\("(.+?)"\)/)[1];
        const buttons = Array.from(document.querySelectorAll('button'));
        applyButton = buttons.find(btn => btn.textContent.includes(text));
      } else {
        applyButton = document.querySelector(selector);
      }
      
      if (applyButton) break;
    } catch (error) {
      console.error(`Error with selector ${selector}:`, error);
    }
  }
  
  if (applyButton) {
    console.log("Found apply button:", applyButton);
    
    // Check if button is disabled
    if (applyButton.disabled || applyButton.classList.contains('opaque-button')) {
      console.log("Apply button is disabled, enabling it");
      // Enable the button if possible
      applyButton.disabled = false;
      applyButton.classList.remove('opaque-button');
    }
    
    // Click the apply button
    console.log("Clicking apply button");
    applyButton.click();
    
    // Reset the processing flag after a delay
    setTimeout(() => {
      isProcessing = false;
    }, 5000);
  } else {
    console.log("Apply button not found");
    isProcessing = false;
  }
}

// Check if chat overlay is present
function isChatOverlayPresent() {
  // Based on the provided DOM structure for the chatbot container
  const chatSelectors = [
    '[id$="ChatbotContainer"]',
    '[class*="chatbot_Drawer"]',
    '[class*="_chatBotContainer"]',
    '.chatbot_Drawer',
    '.chatbot_MessageContainer'
  ];
  
  for (const selector of chatSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log("Chat overlay detected using selector:", selector);
      return true;
    }
  }
  
  return false;
}

// Observe the chat overlay for changes
function observeChatOverlay() {
  console.log("Setting up chat overlay observer");
  
  // If we already have an observer, disconnect it
  if (chatOverlayObserver) {
    chatOverlayObserver.disconnect();
    chatOverlayObserver = null;
  }
  
  // Find the chat container using multiple possible selectors
  const chatContainerSelectors = [
    '[id$="ChatbotContainer"]',
    '[class*="chatbot_Drawer"]',
    '[class*="_chatBotContainer"]',
    '.chatbot_MessageContainer'
  ];
  
  let chatContainer = null;
  for (const selector of chatContainerSelectors) {
    chatContainer = document.querySelector(selector);
    if (chatContainer) break;
  }
  
  // If no chat container found, use body as fallback
  if (!chatContainer) {
    console.log("No chat container found, using body as fallback");
    chatContainer = document.body;
  } else {
    console.log("Found chat container:", chatContainer);
  }
  
  // Check for the save/submit button in the chat
  const saveButton = document.querySelector('.sendMsg') || 
                     document.querySelector('[class*="send"] [class*="save"]') ||
                     document.querySelector('[class*="send"] [class*="Save"]');
                     
  if (saveButton) {
    console.log("Found save button in chat:", saveButton);
    // We'll just watch for click events on this button in addition to the mutation observer
    saveButton.addEventListener('click', function saveBtnHandler() {
      console.log("Save button clicked, checking in 3 seconds if overlay is still present");
      setTimeout(() => {
        if (!isChatOverlayPresent()) {
          console.log("Chat overlay removed after save button click");
          // Remove the event listener to prevent multiple triggers
          saveButton.removeEventListener('click', saveBtnHandler);
          
          if (autoApplyActive) {
            isProcessing = false;
            setTimeout(autoApplyCycle, 1000);
          }
        }
      }, 3000);
    });
  }
  
  // Set up a mutation observer to watch for the removal of the chat overlay
  chatOverlayObserver = new MutationObserver((mutations) => {
    // Only check every second at most to avoid excessive checks
    if (!chatOverlayCheckTimeout) {
      chatOverlayCheckTimeout = setTimeout(() => {
        // Check if the chat overlay is still present
        const stillPresent = isChatOverlayPresent();
        console.log("Checking if chat overlay still present:", stillPresent);
        
        if (!stillPresent) {
          console.log("Chat overlay no longer present, resuming process");
          if (chatOverlayObserver) {
            chatOverlayObserver.disconnect();
            chatOverlayObserver = null;
          }
          
          clearTimeout(chatOverlayCheckTimeout);
          chatOverlayCheckTimeout = null;
          
          if (autoApplyActive) {
            isProcessing = false;
            setTimeout(autoApplyCycle, 1000);
          }
        } else {
          chatOverlayCheckTimeout = null;
        }
      }, 1000);
    }
  });
  
  // Start observing with a comprehensive configuration
  chatOverlayObserver.observe(chatContainer, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: false
  });
  
  // Also observe the body for changes that might indicate removal of overlay
  chatOverlayObserver.observe(document.body, {
    childList: true,
    subtree: false
  });
  
  console.log("Chat overlay observer set up");
}

// Add a timeout tracker for chat overlay checks
let chatOverlayCheckTimeout = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message);
  
  if (message.action === "startAutoApply") {
    console.log("Received start auto-apply message");
    isProcessing = false;
    autoApplyActive = true;
    autoApplyCycle();
    sendResponse({status: "started"});
  }
  
  if (message.action === "stopAutoApply") {
    console.log("Received stop auto-apply message");
    autoApplyActive = false;
    isProcessing = false;
    if (chatOverlayObserver) {
      chatOverlayObserver.disconnect();
      chatOverlayObserver = null;
    }
    sendResponse({status: "stopped"});
  }
  
  // Always return true to indicate async response
  return true;
});

// Global flag to track if auto-apply is active
let autoApplyActive = true;

// Notify the background script that the content script is loaded
chrome.runtime.sendMessage({action: "contentScriptLoaded"});
