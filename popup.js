'use strict';

const sidePanelButton = document.getElementById('open-sidepanel');
const windowButton = document.getElementById('open-window');
const hint = document.getElementById('hint');
let currentVodTabId = null;

function isInsightsVod(tab) {
  if (!tab?.id || !tab.url) return false;
  try {
    const url = new URL(tab.url);
    const hostMatches = url.hostname === 'insights.gg' || url.hostname.endsWith('.insights.gg');
    return hostMatches && url.pathname.startsWith('/dashboard/video/');
  } catch (_) {
    return false;
  }
}

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isInsightsVod(tab)) throw new Error('Open an Insights.gg VOD page first.');
    currentVodTabId = tab.id;
    await chrome.sidePanel.setOptions({
      tabId: currentVodTabId,
      path: 'transcript.html',
      enabled: true
    });
    sidePanelButton.disabled = false;
    windowButton.disabled = false;
    hint.textContent = 'The Side Panel is the default experience.';
  } catch (error) {
    sidePanelButton.disabled = true;
    windowButton.disabled = true;
    hint.textContent = error.message || 'Could not detect an Insights.gg VOD tab.';
  }
}

sidePanelButton.addEventListener('click', () => {
  if (currentVodTabId == null) return;
  sidePanelButton.disabled = true;

  // This API call is deliberately the first asynchronous operation in the
  // click handler so it retains the direct user gesture required by Chrome.
  chrome.sidePanel.open({ tabId: currentVodTabId })
    .then(async () => {
      const result = await chrome.runtime.sendMessage({
        type: 'IVW_DISPLAY_SELECTED',
        sourceTabId: currentVodTabId
      });
      if (!result?.ok) throw new Error(result?.error || 'Could not activate the Side Panel.');
      window.close();
    })
    .catch(error => {
      hint.textContent = error.message || 'Could not open the Side Panel.';
      sidePanelButton.disabled = false;
    });
});

windowButton.addEventListener('click', async () => {
  if (currentVodTabId == null) return;
  windowButton.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'IVW_OPEN_TRANSCRIPT',
      sourceTabId: currentVodTabId,
      mode: 'window'
    });
    if (!result?.ok) throw new Error(result?.error || 'Could not open the transcript window.');
    window.close();
  } catch (error) {
    hint.textContent = error.message || 'Could not open the transcript window.';
    windowButton.disabled = false;
  }
});

initialize();
