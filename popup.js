'use strict';
const button = document.getElementById('open');
const hint = document.getElementById('hint');
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https:\/\/(?:[^/]+\.)?insights\.gg\/dashboard\/video\//.test(tab.url)) {
      hint.textContent = 'Open an Insights.gg VOD page first, then click the extension icon.';
      return;
    }
    await chrome.runtime.sendMessage({ type: 'IVW_OPEN_TRANSCRIPT', sourceTabId: tab.id });
    window.close();
  } catch (error) {
    hint.textContent = 'Could not open transcript. Reload the extension and try again.';
    console.error('[Insights Transcript]', error);
  } finally {
    button.disabled = false;
  }
});
