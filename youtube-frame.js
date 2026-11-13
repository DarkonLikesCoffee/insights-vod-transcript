(() => {
  'use strict';

  const host = location.hostname.toLowerCase();
  const isYouTubeHost = host === 'youtube.com' || host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
  if (window === window.top || !isYouTubeHost) return;

  const parentOrigin = location.ancestorOrigins?.[0] || '';
  let parentHost = '';
  try { parentHost = new URL(parentOrigin).hostname.toLowerCase(); } catch (_) {}
  if (!(parentHost === 'insights.gg' || parentHost.endsWith('.insights.gg'))) return;

  const PREFIX = '[Insights VOD Transcript]';
  const { parseJson3 } = globalThis.InsightsTranscriptUtils;
  const sent = new Set();
  let lastSentBucket = -1;

  function getVideoId() {
    const queryId = new URLSearchParams(location.search).get('v');
    if (queryId) return queryId;
    const pathParts = location.pathname.split('/').filter(Boolean);
    const embedIndex = pathParts.indexOf('embed');
    return embedIndex >= 0 ? (pathParts[embedIndex + 1] || '') : '';
  }

  function fingerprint(segments) {
    const input = segments.map(item => `${item.start}|${item.text}`).join('¦');
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function sendTranscript(body, language) {
    const json = typeof body === 'string' ? JSON.parse(body) : body;
    const segments = parseJson3(json);
    const videoId = getVideoId() || 'unknown';

    if (!segments.length) {
      chrome.runtime.sendMessage({
        type: 'IVW_TRANSCRIPT',
        videoId,
        language: language || '',
        segments: [],
        status: 'YouTube returned an empty caption response. Try toggling CC or check whether captions are available.'
      }).catch(() => {});
      return;
    }

    const key = `${videoId}:${fingerprint(segments)}`;
    if (sent.has(key)) return;
    sent.add(key);
    if (sent.size > 20) sent.delete(sent.values().next().value);

    chrome.runtime.sendMessage({
      type: 'IVW_TRANSCRIPT',
      videoId,
      language: language || '',
      segments
    }).catch(() => {});
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'ivw-caption-response') return;
    if (event.data.body == null || event.data.body === '') return;
    try {
      sendTranscript(event.data.body, event.data.language);
    } catch (error) {
      console.warn(PREFIX, 'Could not parse YouTube timedtext response', error);
    }
  });

  // Seek requests are relayed by the Insights.gg top-frame content script.
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.source !== 'ivw-seek') return;
    const video = document.querySelector('video');
    const time = Number(event.data.time);
    if (!video || !Number.isFinite(time) || time < 0) return;
    try {
      video.currentTime = time;
      const playResult = video.play();
      if (playResult?.catch) playResult.catch(() => {});
    } catch (error) {
      console.warn(PREFIX, 'Could not seek embedded player', error);
    }
  });

  // Playback time is transient; only caption data is persisted.
  setInterval(() => {
    const video = document.querySelector('video');
    if (!video || !Number.isFinite(video.currentTime)) return;
    const bucket = Math.floor(video.currentTime * 4);
    if (bucket === lastSentBucket) return;
    lastSentBucket = bucket;

    chrome.runtime.sendMessage({
      type: 'IVW_TIME',
      videoId: getVideoId(),
      currentTime: video.currentTime
    }).catch(() => {});
  }, 250);

  console.info(PREFIX, 'Caption listener ready in embedded YouTube frame');
})();
