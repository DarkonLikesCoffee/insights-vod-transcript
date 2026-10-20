'use strict';
const PREFIX = '[Insights Transcript]';
const STATE_KEY = 'ivwTranscriptState';
const SOURCE_KEY = 'ivwSourceTabId';
const WINDOW_KEY = 'ivwTranscriptWindowId';
const initialState = () => ({ videoId: '', playerVideoId: '', language: '', segments: [], currentTime: 0, status: 'Waiting for captions. Start playback and enable CC if needed.', updatedAt: Date.now() });
let sourceTabId = null;
let windowId = null;
let activeVideoId = '';
let currentTime = 0;
let stateCache = initialState();

// Load only once on worker startup. Playback ticks never read or write transcript storage.
const ready = (async () => {
  const data = await chrome.storage.local.get([STATE_KEY, SOURCE_KEY, WINDOW_KEY]);
  stateCache = data[STATE_KEY] || initialState();
  sourceTabId = data[SOURCE_KEY] ?? null;
  windowId = data[WINDOW_KEY] ?? null;
  activeVideoId = stateCache.playerVideoId || stateCache.videoId || '';
  currentTime = Number(stateCache.currentTime) || 0;
})();
async function sendTranscriptMessage(message) {
  await ready;
  if (windowId == null) return;
  try {
    const win = await chrome.windows.get(windowId, { populate: true });
    const tabId = win.tabs?.[0]?.id;
    if (tabId != null) await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {}
}
async function persistState(next, sendFull = false) {
  stateCache = { ...next, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STATE_KEY]: stateCache });
  if (sendFull) await sendTranscriptMessage({ type: 'IVW_STATE', state: { ...stateCache, currentTime } });
  return stateCache;
}
async function resetForVideo(videoId) {
  await ready;
  if (!videoId || activeVideoId === videoId) return stateCache;
  activeVideoId = videoId;
  currentTime = 0;
  const next = initialState();
  next.playerVideoId = videoId;
  next.status = 'Waiting for captions for this video. Enable CC if needed.';
  return persistState(next, true);
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ready;
    if (message?.type === 'IVW_OPEN_TRANSCRIPT') {
      const tabId = message.sourceTabId ?? sender.tab?.id;
      if (tabId == null) return;
      const previousSource = sourceTabId;
      sourceTabId = tabId;
      await chrome.storage.local.set({ [SOURCE_KEY]: sourceTabId });
      if (previousSource !== tabId) {
        activeVideoId = ''; currentTime = 0;
        await persistState(initialState(), false);
      }
      if (windowId != null) {
        try {
          await chrome.windows.get(windowId);
          await chrome.windows.update(windowId, { focused: true });
          await sendTranscriptMessage({ type: 'IVW_STATE', state: { ...stateCache, currentTime } });
          return;
        } catch (_) {}
      }
      const win = await chrome.windows.create({ url: chrome.runtime.getURL('transcript.html'), type: 'popup', focused: true, width: 620, height: 760 });
      windowId = win.id;
      await chrome.storage.local.set({ [WINDOW_KEY]: windowId });
      return;
    }
    if (message?.type === 'IVW_GET_STATE') {
      // Only the extension's own transcript page may request its current state.
      if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('transcript.html')) return;
      sendResponse({ state: { ...stateCache, currentTime }, sourceTabId, windowId });
      return;
    }
    // Seeking originates in the extension transcript window, not the Insights tab.
    // Validate the extension page explicitly, then relay only to the stored source tab.
    if (message?.type === 'IVW_SEEK_TIME') {
      if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('transcript.html')) return;
      const time = Math.max(0, Number(message.time) || 0);
      if (sourceTabId != null) {
        try { await chrome.tabs.sendMessage(sourceTabId, { type: 'IVW_SEEK_TIME', time }); } catch (_) {}
      }
      return;
    }
    // Ignore messages from any other tab before doing any storage work.
    if (sourceTabId != null && sender.tab?.id !== sourceTabId) return;
    if (message?.type === 'IVW_TIME') {
      const videoId = message.videoId || '';
      if (videoId && activeVideoId && videoId !== activeVideoId) await resetForVideo(videoId);
      else if (videoId && !activeVideoId) activeVideoId = videoId;
      currentTime = Number(message.currentTime) || 0;
      await sendTranscriptMessage({ type: 'IVW_TIME', videoId, currentTime });
      return;
    }
    if (message?.type === 'IVW_TRANSCRIPT') {
      const videoId = message.videoId || '';
      if (videoId && activeVideoId && videoId !== activeVideoId) await resetForVideo(videoId);
      if (videoId) activeVideoId = videoId;
      const segments = Array.isArray(message.segments) ? message.segments : [];
      const next = { ...stateCache, videoId, playerVideoId: videoId || activeVideoId, language: message.language || '', segments, currentTime, status: segments.length ? 'Transcript ready' : (message.status || 'No captions found for this video.') };
      await persistState(next, true);
      console.info(PREFIX, 'transcript update', { videoId, segments: segments.length, status: next.status });
      return;
    }
    if (message?.type === 'IVW_STATUS') {
      await persistState({ ...stateCache, status: String(message.status || 'Transcript unavailable') }, true);
      return;
    }
  })().catch(error => console.warn(PREFIX, 'message handler failed', error));
  return message?.type === 'IVW_GET_STATE';
});
chrome.windows.onRemoved.addListener(async removedId => {
  await ready;
  if (windowId === removedId) { windowId = null; await chrome.storage.local.remove(WINDOW_KEY); }
});
chrome.tabs.onRemoved.addListener(async removedTabId => {
  await ready;
  if (sourceTabId === removedTabId) {
    sourceTabId = null; activeVideoId = ''; currentTime = 0;
    await chrome.storage.local.remove([SOURCE_KEY, STATE_KEY]);
    stateCache = initialState();
  }
});
