(() => {
  'use strict';
  if (!location.hostname.includes('youtube.com') && !location.hostname.includes('youtube-nocookie.com')) return;
  // Only hook embedded players loaded by Insights.gg, never ordinary YouTube tabs.
  const parentOrigin = location.ancestorOrigins?.[0] || '';
  if (window === window.top || !/(^|\.)insights\.gg$/i.test(new URL(parentOrigin || 'https://invalid.local').hostname)) return;
  const PREFIX = '[Insights Subtitle Test]';

  function isTimedText(url) {
    try {
      const u = new URL(url, location.href);
      return u.hostname.endsWith('youtube.com') && u.pathname.includes('/api/timedtext');
    } catch (_) { return false; }
  }

  function publish(url, body) {
    if (typeof body !== 'string') return;
    let language = '';
    try { language = new URL(url, location.href).searchParams.get('lang') || ''; } catch (_) {}
    window.postMessage({ source: 'ivw-caption-response', body, language }, '*');
  }

  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    const response = await originalFetch.apply(this, arguments);
    let url = typeof input === 'string' ? input : input?.url;
    if (url && isTimedText(url)) {
      response.clone().text().then(body => publish(url, body)).catch(() => {});
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__ivwTimedTextUrl = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    if (this.__ivwTimedTextUrl && isTimedText(this.__ivwTimedTextUrl)) {
      this.addEventListener('load', () => {
        try { publish(this.__ivwTimedTextUrl, this.responseText); } catch (_) {}
      }, { once: true });
    }
    return originalSend.apply(this, arguments);
  };
  console.info(PREFIX, 'network hook installed before YouTube player loads');
})();
