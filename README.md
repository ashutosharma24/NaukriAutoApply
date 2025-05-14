# Naukri AutoApply Chrome Extension

A Chrome extension that automates job applications on Naukri.com's recommended jobs page.

## Features

- Automatically selects up to 5 job listings at a time
- Clicks the "Apply" button
- Pauses when a chat/questionnaire overlay appears, waiting for user input
- Automatically returns to the recommended jobs page after application
- Continues the process until no new jobs remain

## Installation

### Developer Mode Installation

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked" and select the directory containing the extension files
5. The extension should now be installed and visible in your extensions list

### Required Files

- `manifest.json` - Extension configuration
- `content.js` - Script that runs on the Naukri recommended jobs page
- `background.js` - Background service worker for navigation handling
- `popup.html` & `popup.js` - Extension popup UI
- `images/` - Directory containing extension icons
  - `icon16.png`
  - `icon48.png`
  - `icon128.png`

## Usage

1. Navigate to [Naukri's Recommended Jobs page](https://www.naukri.com/mnjuser/recommendedjobs)
2. The extension will automatically start selecting jobs and clicking apply
3. When a chat or questionnaire appears, the extension will pause
4. Answer the questions manually, then the extension will continue automatically
5. The process repeats until no more jobs are available

## Extension Controls

- Click the extension icon in your Chrome toolbar to:
  - Start the auto-apply process
  - Stop the auto-apply process
  - See the current status

## Troubleshooting

If the extension doesn't work as expected:

1. Make sure you're on the correct page: `https://www.naukri.com/mnjuser/recommendedjobs`
2. Check the browser console for error messages (F12 > Console)
3. Try refreshing the page and restarting the extension
4. Ensure there are available jobs that haven't been applied to yet

## Technical Details

- Uses Chrome's Manifest V3 format
- Content script interacts with the DOM to select jobs and detect overlays
- Background script handles navigation between pages
- Uses MutationObserver to detect when chat overlay is closed
- Automatically pauses when user input is required

## Disclaimer

This extension is for personal use and educational purposes only. Use it responsibly and in compliance with Naukri.com's terms of service.
