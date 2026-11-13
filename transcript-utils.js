'use strict';

(function exposeTranscriptUtils(root) {
  const DEFAULT_MAX_WORDS = 85;
  const DEFAULT_PAUSE_SECONDS = 1.8;
  const SENTENCE_END = /[.!?…]["'’”)}\]]*$/;

  function countWords(text) {
    return String(text || '').match(/\S+/g)?.length || 0;
  }

  function groupSegments(segments, options = {}) {
    const maxWords = Math.max(10, Number(options.maxWords) || DEFAULT_MAX_WORDS);
    const pauseSeconds = Math.max(0, Number(options.pauseSeconds) || DEFAULT_PAUSE_SECONDS);
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
      const text = String(segment.text || '').replace(/\s+/g, ' ').trim();
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
      const words = countWords(text);
      const gap = paragraph ? safeStart - paragraph.end : 0;

      if (paragraph && gap > pauseSeconds && paragraphWords >= 8) flush();
      if (paragraph && paragraphWords + words > maxWords) flush();

      if (!paragraph) {
        paragraph = { start: safeStart, end, text, firstIndex: index, lastIndex: index };
      } else {
        paragraph.text += ` ${text}`;
        paragraph.end = Math.max(paragraph.end, end);
        paragraph.lastIndex = index;
      }
      paragraphWords += words;

      if (paragraphWords >= maxWords || (paragraphWords >= 35 && SENTENCE_END.test(text))) flush();
    }

    flush();
    return result;
  }

  const api = Object.freeze({ normalizeText, countWords, groupSegments });
  root.InsightsTranscriptUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
