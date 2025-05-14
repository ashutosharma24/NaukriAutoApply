// popup.js - Handles the extension popup UI
document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusText = document.getElementById('statusText');
  
  let isRunning = false;
  
  // Check if we're on the Naukri recommended jobs page
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab && currentTab.url && currentTab.url.includes('naukri.com/mnjuser/recommendedjobs')) {
      statusText.textContent = 'Ready to auto-apply on this page!';
      startBtn.disabled = false;
    } else {
      statusText.textContent = 'Please navigate to Naukri recommended jobs page first.';
      startBtn.disabled = true;
    }
  });
  
  // Start button click handler
  startBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      
      if (currentTab && currentTab.url && currentTab.url.includes('naukri.com/mnjuser/recommendedjobs')) {
        // Send message to content script to start the auto-apply process
        chrome.tabs.sendMessage(currentTab.id, {action: 'startAutoApply'}, function(response) {
          if (chrome.runtime.lastError) {
            console.error('Error:', chrome.runtime.lastError);
            statusText.textContent = 'Error: Content script not ready. Please refresh the page.';
          } else {
            console.log('Response received:', response);
            statusText.textContent = 'Auto-apply process started!';
            isRunning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
          }
        });
      } else {
        statusText.textContent = 'Please navigate to Naukri recommended jobs page first.';
      }
    });
  });
  
  // Stop button click handler
  stopBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      
      if (currentTab) {
        // Send message to content script to stop the auto-apply process
        chrome.tabs.sendMessage(currentTab.id, {action: 'stopAutoApply'}, function(response) {
          statusText.textContent = 'Auto-apply process stopped.';
          isRunning = false;
          startBtn.disabled = false;
          stopBtn.disabled = true;
        });
      }
    });
  });
});
