(() => {
  'use strict';
  if (window === window.top) return;
  if (!location.hostname.includes('youtube.com') && !location.hostname.includes('youtube-nocookie.com')) return;
  const parentOrigin = location.ancestorOrigins?.[0] || '';
  if (!/(^|\.)insights\.gg$/i.test(new URL(parentOrigin || 'https://invalid.local').hostname)) return;
  const PREFIX = '[Insights VOD Workspace]';
  const sent = new Set();

  function parseJson3(json) {
    return (json.events || []).flatMap(event => {
      const text = (event.segs || []).map(s => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
      if (!text) return [];
      const start = Number(event.tStartMs || 0) / 1000;
      return [{ start, end: start + Number(event.dDurationMs || 0) / 1000, text }];
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'ivw-caption-response' || !event.data.body) return;
    try {
      const json = typeof event.data.body === 'string' ? JSON.parse(event.data.body) : event.data.body;
      const segments = parseJson3(json);
      if (!segments.length) {
        console.info(PREFIX, 'timedtext response received but contained no transcript segments');
        const videoId = new URLSearchParams(location.search).get('v') || location.pathname.match(/\/embed\/([^/?]+)/)?.[1] || 'unknown';
        chrome.runtime.sendMessage({ type: 'IVW_TRANSCRIPT', videoId, language: event.data.language || '', segments: [], status: 'YouTube returned an empty caption response. Try toggling CC or check whether captions are available.' }).catch(() => {});
        return;
      }
      const videoId = new URLSearchParams(location.search).get('v') || location.pathname.match(/\/embed\/([^/?]+)/)?.[1] || 'unknown';
      const key = `${videoId}:${segments.length}:${segments[0]?.start}:${segments[0]?.text}`;
      if (sent.has(key)) return;
      sent.add(key);
      console.info(PREFIX, 'captured YouTube timedtext response', { videoId, segments: segments.length });
      chrome.runtime.sendMessage({
        type: 'IVW_TRANSCRIPT', videoId,
        language: event.data.language || '', segments
      }).catch(() => {});
    } catch (error) {
      console.warn(PREFIX, 'could not parse timedtext response', error);
    }
  });

  // Seek requests are relayed by the Insights.gg top-frame content script.
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.source !== 'ivw-seek') return;
    const video = document.querySelector('video');
    const time = Number(event.data.time);
    if (video && Number.isFinite(time) && time >= 0) { video.currentTime = time; video.play().catch(() => {}); }
  });

  // Relay embedded playback time; never persist the clock in storage.
  let lastSentSecond = -1;
  setInterval(() => {
    const video = document.querySelector('video');
    if (!video || !Number.isFinite(video.currentTime)) return;
    const bucket = Math.floor(video.currentTime * 4);
    if (bucket === lastSentSecond) return;
    lastSentSecond = bucket;
    chrome.runtime.sendMessage({
      type: 'IVW_TIME',
      videoId: new URLSearchParams(location.search).get('v') || location.pathname.match(/\/embed\/([^/?]+)/)?.[1] || '',
      currentTime: video.currentTime
    }).catch(() => {});
  }, 250);

  console.info(PREFIX, 'caption response listener ready in YouTube frame');
})();
