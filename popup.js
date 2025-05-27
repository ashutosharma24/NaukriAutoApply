// Get references to the buttons and status display
const startButton = document.getElementById('startAutomation');
const stopButton = document.getElementById('stopAutomation');
const statusDisplay = document.getElementById('status');

// Function to update button states and status display
function updateUI(automationRunning, currentStatus) {
    if (automationRunning) {
        startButton.classList.add('disabled');
        startButton.disabled = true;
        stopButton.classList.remove('disabled');
        stopButton.disabled = false;
    } else {
        startButton.classList.remove('disabled');
        startButton.disabled = false;
        stopButton.classList.add('disabled');
        stopButton.disabled = true;
    }
    statusDisplay.textContent = `Status: ${currentStatus}`;
}

// Add event listener for the "Start Automation" button
startButton.addEventListener('click', () => {
    if (!startButton.disabled) {
        // Send a message to the background script to start automation
        chrome.runtime.sendMessage({ command: 'startAutomation' }, (response) => {
            if (chrome.runtime.lastError) {
                statusDisplay.textContent = 'Error: Could not connect to service worker.';
                console.error("Error sending startAutomation message:", chrome.runtime.lastError.message);
                return;
            }
            if (response) {
                updateUI(response.automationRunning, response.status);
            }
        });
    }
});

// Add event listener for the "Stop Automation" button
stopButton.addEventListener('click', () => {
    if (!stopButton.disabled) {
        // Send a message to the background script to stop automation
        chrome.runtime.sendMessage({ command: 'stopAutomation' }, (response) => {
             if (chrome.runtime.lastError) {
                statusDisplay.textContent = 'Error: Could not connect to service worker.';
                console.error("Error sending stopAutomation message:", chrome.runtime.lastError.message);
                return;
            }
            if (response) {
                updateUI(response.automationRunning, response.status);
            }
        });
    }
});

// Request initial status when the popup is opened
chrome.runtime.sendMessage({ command: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) {
        statusDisplay.textContent = 'Error: Could not connect to service worker.';
        console.error("Error sending getStatus message:", chrome.runtime.lastError.message);
        // Attempt to give a default state if background isn't ready
        updateUI(false, "Idle (Error connecting)");
        return;
    }
    if (response) {
        updateUI(response.automationRunning, response.status);
    } else {
        // Handle cases where background script might not have responded yet or is inactive
        // This can happen if the service worker was inactive and is just starting up.
        // We can set a default state and perhaps try again shortly, or rely on user action.
        console.warn("No response to getStatus, background script might be initializing.");
        updateUI(false, "Initializing..."); // A temporary status
        // Optionally, try to get status again after a short delay
        setTimeout(() => {
            chrome.runtime.sendMessage({ command: 'getStatus' }, (delayedResponse) => {
                if (delayedResponse) {
                     updateUI(delayedResponse.automationRunning, delayedResponse.status);
                } else if (chrome.runtime.lastError) {
                     console.error("Delayed getStatus failed:", chrome.runtime.lastError.message);
                     statusDisplay.textContent = 'Error: Service worker unavailable.';
                }
            });
        }, 500);
    }
});

// Listen for status updates from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'updateStatus') {
        updateUI(request.automationRunning, request.status);
        sendResponse({ received: true });
    }
    return true; // Keep the message channel open for asynchronous sendResponse
});
