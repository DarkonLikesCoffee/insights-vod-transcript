'use strict';

const sidePanelButton = document.getElementById('open-sidepanel');
const windowButton = document.getElementById('open-window');
const hint = document.getElementById('hint');

async function getCurrentVodTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('Open an Insights.gg VOD page first.');

  const url = new URL(tab.url);
  const isInsights = url.hostname === 'insights.gg' || url.hostname.endsWith('.insights.gg');
  if (!isInsights || !url.pathname.startsWith('/dashboard/video/')) {
    throw new Error('Open an Insights.gg VOD page first.');
  }
  return tab;
}

async function open(mode, button) {
  button.disabled = true;
  hint.textContent = '';

  try {
    const tab = await getCurrentVodTab();

    if (mode === 'sidepanel') {
      // Open directly from this click handler so Chrome receives the required
      // user activation for sidePanel.open().
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: 'transcript.html',
        enabled: true
      });
      await chrome.sidePanel.open({ tabId: tab.id });

      const result = await chrome.runtime.sendMessage({
        type: 'IVW_DISPLAY_SELECTED',
        sourceTabId: tab.id
      });
      if (!result?.ok) throw new Error(result?.error || 'Could not activate the Side Panel.');
    } else {
      const result = await chrome.runtime.sendMessage({
        type: 'IVW_OPEN_TRANSCRIPT',
        sourceTabId: tab.id,
        mode: 'window'
      });
      if (!result?.ok) throw new Error(result?.error || 'Could not open the transcript window.');
    }

    window.close();
  } catch (error) {
    hint.textContent = error.message || 'Could not open transcript. Reload the extension and try again.';
  } finally {
    button.disabled = false;
  }
}

sidePanelButton.addEventListener('click', () => open('sidepanel', sidePanelButton));
windowButton.addEventListener('click', () => open('window', windowButton));
