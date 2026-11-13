'use strict';

const sidePanelButton = document.getElementById('open-sidepanel');
const windowButton = document.getElementById('open-window');
const hint = document.getElementById('hint');

async function currentVodTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url ||
      !/^https:\/\/(?:[^/]+\.)?insights\.gg\/dashboard\/video\//.test(tab.url)) {
    throw new Error('Open an Insights.gg VOD page first.');
  }
  return tab;
}

async function open(mode, button) {
  button.disabled = true;
  hint.textContent = '';
  try {
    const tab = await currentVodTab();
    await chrome.runtime.sendMessage({ type: 'IVW_OPEN_TRANSCRIPT', sourceTabId: tab.id, mode });
    window.close();
  } catch (error) {
    hint.textContent = error.message || 'Could not open transcript. Reload the extension and try again.';
  } finally {
    button.disabled = false;
  }
}

sidePanelButton.addEventListener('click', () => open('sidepanel', sidePanelButton));
windowButton.addEventListener('click', () => open('window', windowButton));
