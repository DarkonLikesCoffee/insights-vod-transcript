'use strict';

const PREFIX = '[Insights Transcript]';
const STATE_KEY = tabId => `ivwTranscriptState:${tabId}`;
const SOURCE_KEY = 'ivwSourceTabId';
const WINDOW_KEY = 'ivwTranscriptWindowId';
const MODE_KEY = 'ivwDisplayMode';
const initialState = () => ({
  videoId: '', playerVideoId: '', language: '', segments: [], currentTime: 0,
  status: 'Waiting for captions. Start playback and enable CC if needed.',
  updatedAt: Date.now()
});

// Keep one independent context per Insights tab. The Side Panel follows the
// active browser tab; a separate window stays pinned to the VOD that opened it.
const contexts = new Map();
let sourceTabId = null;
let windowId = null;
let displayMode = 'sidepanel';
let activeTabId = null;

const ready = (async () => {
  const data = await chrome.storage.local.get([SOURCE_KEY, WINDOW_KEY, MODE_KEY]);
  sourceTabId = data[SOURCE_KEY] ?? null;
  windowId = data[WINDOW_KEY] ?? null;
  displayMode = data[MODE_KEY] || 'sidepanel';
})();

function isVodUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)insights\.gg$/i.test(parsed.hostname) &&
      /^\/dashboard\/video\//.test(parsed.pathname);
  } catch (_) {
    return false;
  }
}

async function getContext(tabId) {
  await ready;
  if (!contexts.has(tabId)) {
    const context = { state: initialState(), activeVideoId: '', currentTime: 0, loaded: false };
    contexts.set(tabId, context);
  }
  const context = contexts.get(tabId);
  if (!context.loaded) {
    const stored = await chrome.storage.local.get(STATE_KEY(tabId));
    if (stored[STATE_KEY(tabId)]) context.state = stored[STATE_KEY(tabId)];
    context.activeVideoId = context.state.playerVideoId || context.state.videoId || '';
    context.currentTime = Number(context.state.currentTime) || 0;
    context.loaded = true;
  }
  return context;
}

async function persistContext(tabId, context) {
  context.state = { ...context.state, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STATE_KEY(tabId)]: context.state });
}

async function getActiveVodTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id && isVodUrl(tab.url || '')) return tab.id;
  return null;
}

async function sendToWindow(message) {
  if (windowId == null) return;
  try {
    const win = await chrome.windows.get(windowId, { populate: true });
    const tabId = win.tabs?.[0]?.id;
    if (tabId != null) await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    // The transcript window may be in the process of closing.
  }
}

async function publishState(tabId, mode = displayMode) {
  const context = await getContext(tabId);
  const payload = { type: 'IVW_STATE', state: { ...context.state, currentTime: context.currentTime }, sourceTabId: tabId };
  if (mode === 'window') {
    await sendToWindow(payload);
  } else {
    // Runtime messages are received by the single Side Panel document. The
    // sourceTabId lets it ignore late messages from tabs that are no longer active.
    try { await chrome.runtime.sendMessage({ ...payload, target: 'sidepanel' }); } catch (_) {}
  }
}

async function resetForVideo(tabId, videoId) {
  const context = await getContext(tabId);
  if (!videoId || context.activeVideoId === videoId) return context;
  context.activeVideoId = videoId;
  context.currentTime = 0;
  const next = initialState();
  next.playerVideoId = videoId;
  next.status = 'Waiting for captions for this video. Enable CC if needed.';
  context.state = next;
  await persistContext(tabId, context);
  if (tabId === activeTabId) await publishState(tabId);
  return context;
}

async function openTranscript(tabId, mode) {
  await ready;
  if (!tabId) throw new Error('No active Insights.gg VOD tab.');
  sourceTabId = tabId;
  activeTabId = tabId;
  displayMode = mode;
  await chrome.storage.local.set({ [SOURCE_KEY]: sourceTabId, [MODE_KEY]: displayMode });
  await getContext(tabId);

  if (mode === 'sidepanel') {
    await chrome.sidePanel.setOptions({ tabId, path: 'transcript.html', enabled: true });
    await chrome.sidePanel.open({ tabId });
    await publishState(tabId, 'sidepanel');
    return;
  }

  if (windowId != null) {
    try {
      await chrome.windows.get(windowId);
      await chrome.windows.update(windowId, { focused: true });
      await publishState(tabId, 'window');
      return;
    } catch (_) {
      windowId = null;
    }
  }

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`transcript.html?mode=window&sourceTabId=${tabId}`),
    type: 'popup',
    focused: true,
    width: 620,
    height: 760
  });
  windowId = win.id;
  await chrome.storage.local.set({ [WINDOW_KEY]: windowId });
}

chrome.action.onClicked.addListener(async tab => {
  try {
    if (!tab?.id || !isVodUrl(tab.url || '')) return;
    await openTranscript(tab.id, 'sidepanel');
  } catch (error) {
    console.warn(PREFIX, 'could not open Side Panel', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ready;

    if (message?.type === 'IVW_OPEN_TRANSCRIPT') {
      const tabId = message.sourceTabId ?? sender.tab?.id ?? await getActiveVodTab();
      if (tabId == null) return;
      await openTranscript(tabId, message.mode === 'window' ? 'window' : 'sidepanel');
      return;
    }

    if (message?.type === 'IVW_GET_STATE') {
      if (sender.id !== chrome.runtime.id ||
          !sender.url?.startsWith(chrome.runtime.getURL('transcript.html'))) return;
      const url = new URL(sender.url);
      const tabId = url.searchParams.get('mode') === 'window'
        ? Number(url.searchParams.get('sourceTabId')) || sourceTabId
        : await getActiveVodTab();
      const context = tabId != null ? await getContext(tabId) : null;
      sendResponse({
        state: context ? { ...context.state, currentTime: context.currentTime } : initialState(),
        sourceTabId: tabId,
        displayMode: url.searchParams.get('mode') === 'window' ? 'window' : 'sidepanel'
      });
      return;
    }

    if (message?.type === 'IVW_SEEK_TIME') {
      if (sender.id !== chrome.runtime.id ||
          !sender.url?.startsWith(chrome.runtime.getURL('transcript.html'))) return;
      const url = new URL(sender.url);
      const tabId = url.searchParams.get('mode') === 'window'
        ? Number(url.searchParams.get('sourceTabId')) || sourceTabId
        : await getActiveVodTab();
      if (tabId != null) {
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'IVW_SEEK_TIME',
            time: Math.max(0, Number(message.time) || 0)
          });
        } catch (_) {}
      }
      return;
    }

    const tabId = sender.tab?.id;
    if (tabId == null) return;
    const context = await getContext(tabId);

    if (message?.type === 'IVW_TIME') {
      const videoId = message.videoId || '';
      if (videoId && context.activeVideoId && videoId !== context.activeVideoId) {
        await resetForVideo(tabId, videoId);
      } else if (videoId && !context.activeVideoId) {
        context.activeVideoId = videoId;
      }
      context.currentTime = Number(message.currentTime) || 0;
      if (tabId === activeTabId) {
        try {
          await chrome.runtime.sendMessage({
            type: 'IVW_TIME', target: 'sidepanel', sourceTabId: tabId,
            videoId, currentTime: context.currentTime
          });
        } catch (_) {}
      }
      if (displayMode === 'window' && tabId === sourceTabId) {
        await sendToWindow({ type: 'IVW_TIME', sourceTabId: tabId, videoId, currentTime: context.currentTime });
      }
      return;
    }

    if (message?.type === 'IVW_TRANSCRIPT') {
      const videoId = message.videoId || '';
      if (videoId && context.activeVideoId && videoId !== context.activeVideoId) {
        await resetForVideo(tabId, videoId);
      }
      if (videoId) context.activeVideoId = videoId;
      const segments = Array.isArray(message.segments) ? message.segments : [];
      context.state = {
        ...context.state,
        videoId,
        playerVideoId: videoId || context.activeVideoId,
        language: message.language || '',
        segments,
        currentTime: context.currentTime,
        status: segments.length ? 'Transcript ready' :
          (message.status || 'No captions found for this video.')
      };
      await persistContext(tabId, context);
      if (tabId === activeTabId) await publishState(tabId, 'sidepanel');
      if (displayMode === 'window' && tabId === sourceTabId) await publishState(tabId, 'window');
      return;
    }

    if (message?.type === 'IVW_STATUS') {
      context.state = { ...context.state, status: String(message.status || 'Transcript unavailable') };
      await persistContext(tabId, context);
      if (tabId === activeTabId) await publishState(tabId, 'sidepanel');
      if (displayMode === 'window' && tabId === sourceTabId) await publishState(tabId, 'window');
    }
  })().catch(error => console.warn(PREFIX, 'message handler failed', error));

  return message?.type === 'IVW_GET_STATE';
});

chrome.tabs.onActivated.addListener(async info => {
  await ready;
  activeTabId = info.tabId;
  const tab = await chrome.tabs.get(info.tabId).catch(() => null);
  if (!tab || !isVodUrl(tab.url || '')) return;
  await publishState(info.tabId, 'sidepanel');
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await ready;
  if (tab.active && (changeInfo.status === 'complete' || changeInfo.url)) {
    if (isVodUrl(tab.url || '')) {
      activeTabId = tabId;
      await publishState(tabId, 'sidepanel');
    }
  }
});

chrome.windows.onRemoved.addListener(async removedId => {
  await ready;
  if (windowId === removedId) {
    windowId = null;
    await chrome.storage.local.remove(WINDOW_KEY);
  }
});

chrome.tabs.onRemoved.addListener(async removedTabId => {
  await ready;
  contexts.delete(removedTabId);
  await chrome.storage.local.remove(STATE_KEY(removedTabId));
  if (sourceTabId === removedTabId) {
    sourceTabId = null;
    await chrome.storage.local.remove(SOURCE_KEY);
  }
  if (activeTabId === removedTabId) activeTabId = null;
});
