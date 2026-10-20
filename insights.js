(() => {
  'use strict';
  // Relay transcript seek requests from the extension to the embedded YouTube player.
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== 'IVW_SEEK_TIME') return;
    const frames = [...document.querySelectorAll('iframe')].filter(frame => {
      try { return /youtube(?:-nocookie)?\.com/.test(new URL(frame.src).hostname); } catch (_) { return false; }
    });
    for (const frame of frames) {
      try { frame.contentWindow?.postMessage({ source: 'ivw-seek', time: Math.max(0, Number(message.time) || 0) }, '*'); } catch (_) {}
    }
  });
})();
