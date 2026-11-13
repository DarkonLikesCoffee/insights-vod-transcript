'use strict';

(function exposeTranscriptUtils(root) {
  const DEFAULT_MAX_WORDS = 85;
  const DEFAULT_PAUSE_SECONDS = 1.8;
  const SENTENCE_END = /[.!?…]["'’”)}\]]*$/;

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function countWords(text) {
    return normalizeText(text).match(/\S+/g)?.length || 0;
  }

  function parseJson3(json) {
    if (!json || !Array.isArray(json.events)) return [];
    return json.events.flatMap(event => {
      const text = (Array.isArray(event.segs) ? event.segs : [])
        .map(segment => segment.utf8 || '')
        .join('');
      const normalizedText = normalizeText(text);
      if (!normalizedText) return [];

      const start = Math.max(0, Number(event.tStartMs) || 0) / 1000;
      const duration = Math.max(0, Number(event.dDurationMs) || 0) / 1000;
      return [{ start, duration, end: start + duration, text: normalizedText }];
    });
  }

  function groupSegments(segments, options = {}) {
    const requestedMaxWords = Number(options.maxWords);
    const requestedPause = Number(options.pauseSeconds);
    const maxWords = Number.isFinite(requestedMaxWords) && requestedMaxWords >= 10
      ? requestedMaxWords
      : DEFAULT_MAX_WORDS;
    const pauseSeconds = Number.isFinite(requestedPause) && requestedPause >= 0
      ? requestedPause
      : DEFAULT_PAUSE_SECONDS;
    const result = [];
    let paragraph = null;
    let paragraphWords = 0;

    function flush() {
      if (paragraph) result.push(paragraph);
      paragraph = null;
      paragraphWords = 0;
    }

    for (let index = 0; index < (Array.isArray(segments) ? segments.length : 0); index += 1) {
      const segment = segments[index] || {};
      const text = normalizeText(segment.text);
      if (!text) continue;

      const start = Number(segment.start);
      const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
      const rawDuration = Number(segment.duration);
      const segmentEnd = Number(segment.end);
      const end = Number.isFinite(rawDuration) && rawDuration > 0
        ? safeStart + rawDuration
        : Number.isFinite(segmentEnd) && segmentEnd > safeStart
          ? segmentEnd
          : safeStart;
      const wordList = text.split(/\s+/);
      const words = wordList.length;
      const gap = paragraph ? safeStart - paragraph.end : 0;

      if (paragraph && gap > pauseSeconds && paragraphWords >= 8) flush();
      if (paragraph && paragraphWords + words > maxWords) flush();

      // A single unusually long caption must not bypass the paragraph limit.
      if (words > maxWords) {
        flush();
        for (let offset = 0; offset < words; offset += maxWords) {
          result.push({
            start: safeStart,
            end,
            text: wordList.slice(offset, offset + maxWords).join(' '),
            firstIndex: index,
            lastIndex: index
          });
        }
        continue;
      }

      if (!paragraph) {
        paragraph = { start: safeStart, end, text, firstIndex: index, lastIndex: index };
      } else {
        paragraph.text += \` \${text}\`;
        paragraph.end = Math.max(paragraph.end, end);
        paragraph.lastIndex = index;
      }
      paragraphWords += words;

      if (paragraphWords >= maxWords || (paragraphWords >= 35 && SENTENCE_END.test(text))) flush();
    }

    flush();
    return result;
  }

  const api = Object.freeze({ normalizeText, countWords, parseJson3, groupSegments });
  root.InsightsTranscriptUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
