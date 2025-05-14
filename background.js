// background.js - Handles navigation and tab events
console.log("Naukri AutoApply: Background script loaded");

// Track the active tab state
let activeTab = null;

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log(`Tab ${tabId} updated:`, changeInfo);
  
  // Check if URL is available and loaded
  if (changeInfo.status === 'complete' && tab.url) {
    console.log(`Tab ${tabId} loaded with URL: ${tab.url}`);
    
    // If we've navigated to the saveApply page, we need to go back to recommended jobs
    if (tab.url.includes('naukri.com/myapply/saveApply')) {
      console.log("Detected saveApply URL, waiting before redirecting back");
      
      // Wait a moment to let the confirmation page load and register
      setTimeout(() => {
        console.log("Navigating back to recommended jobs page");
        try {
          chrome.tabs.update(tabId, {
            url: 'https://www.naukri.com/mnjuser/recommendedjobs'
          }).catch(err => {
            console.error("Failed to navigate back:", err);
            // Try a direct redirect if chrome.tabs.update fails
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => { window.location.href = 'https://www.naukri.com/mnjuser/recommendedjobs'; }
            }).catch(err2 => {
              console.error("Failed to execute script for redirect:", err2);
            });
          });
        } catch (error) {
          console.error("Error navigating back:", error);
        }
      }, 2000);
    }
    
    // If we've navigated back to the recommended jobs page
    else if (tab.url.includes('naukri.com/mnjuser/recommendedjobs')) {
      console.log("Back on recommended jobs page, will send message to restart process");
      
      // Wait for the page to fully load
      setTimeout(() => {
        try {
          // Send a message to the content script to restart the auto-apply process
          chrome.tabs.sendMessage(tabId, {
            action: "startAutoApply"
          }, (response) => {
            // Handle possible errors with chrome.runtime.lastError
            if (chrome.runtime.lastError) {
              console.log("Error sending message:", chrome.runtime.lastError);
              
              // If the content script isn't ready yet, try executing it directly
              chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
              }).then(() => {
                console.log("Content script injected");
                // Try sending the message again after a short delay
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, { action: "startAutoApply" })
                    .catch(err => console.log("Second attempt error:", err));
                }, 500);
              }).catch(err => {
                console.error("Failed to inject content script:", err);
              });
            } else {
              console.log("Message sent successfully, response:", response);
            }
          });
        } catch (error) {
          console.error("Error sending message to content script:", error);
        }
      }, 3000);
    }
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message);
  
  if (message.action === "contentScriptLoaded") {
    console.log("Content script loaded in tab:", sender.tab.id);
    activeTab = sender.tab.id;
    sendResponse({status: "acknowledged"});
  }
  
  // Always return true for async response
  return true;
});
