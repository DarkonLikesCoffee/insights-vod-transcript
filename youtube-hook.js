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

  function isTimedText(url) {
    try {
      const parsed = new URL(url, location.href);
      const requestHost = parsed.hostname.toLowerCase();
      const isYouTubeRequest = requestHost === 'youtube.com' ||
        requestHost.endsWith('.youtube.com') ||
        requestHost === 'youtube-nocookie.com' ||
        requestHost.endsWith('.youtube-nocookie.com');
      return isYouTubeRequest && parsed.pathname.includes('/api/timedtext');
    } catch (_) {
      return false;
    }
  }

  function publish(url, body) {
    if (body == null) return;
    let language = '';
    try { language = new URL(url, location.href).searchParams.get('lang') || ''; } catch (_) {}
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    window.postMessage({ source: 'ivw-caption-response', body: payload, language }, '*');
  }

  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    const response = await originalFetch.apply(this, arguments);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (url && isTimedText(url)) {
      response.clone().text()
        .then(body => publish(url, body))
        .catch(error => console.warn(PREFIX, 'Could not read timedtext fetch response', error));
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__ivwTimedTextUrl = url instanceof URL ? url.href : url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    const url = this.__ivwTimedTextUrl;
    if (url && isTimedText(url)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === 'json') publish(url, this.response);
          else if (this.responseType === '' || this.responseType === 'text') publish(url, this.responseText);
        } catch (error) {
          console.warn(PREFIX, 'Could not read timedtext XHR response', error);
        }
      }, { once: true });
    }
    return originalSend.apply(this, arguments);
  };

  console.info(PREFIX, 'Network hook installed in embedded Insights.gg player');
})();
