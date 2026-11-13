'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { countWords, parseJson3, groupSegments } = require('../transcript-utils.js');

function makeSegments(text, start = 0, wordsPerSegment = 5) {
  const words = text.split(/\s+/);
  const result = [];
  for (let i = 0; i < words.length; i += wordsPerSegment) {
    const chunk = words.slice(i, i + wordsPerSegment).join(' ');
    result.push({ start: start + result.length * 0.5, duration: 0.4, text: chunk });
  }
  return result;
}

test('counts words using whitespace rather than literal backslashes', () => {
  assert.equal(countWords('one two\nthree'), 3);
  assert.equal(countWords(''), 0);
});

test('splits long transcripts into multiple bounded paragraphs', () => {
  const segments = makeSegments(Array.from({ length: 240 }, (_, i) => `word${i}`).join(' '));
  const paragraphs = groupSegments(segments);
  assert.ok(paragraphs.length > 1);
  assert.ok(paragraphs.every(item => countWords(item.text) <= 85));
  assert.equal(paragraphs.map(item => countWords(item.text)).reduce((a, b) => a + b, 0), 240);
});

test('starts a new paragraph after a meaningful playback gap', () => {
  const paragraphs = groupSegments([
    { start: 0, duration: 0.5, text: 'First short sentence.' },
    { start: 0.6, duration: 0.5, text: 'A little more text here.' },
    { start: 5, duration: 0.5, text: 'This begins after a pause.' }
  ]);
  assert.equal(paragraphs.length, 2);
  assert.match(paragraphs[1].text, /^This begins/);
});

test('preserves caption order and ignores empty caption segments', () => {
  const paragraphs = groupSegments([
    { start: 0, duration: 1, text: '  Hello   there. ' },
    { start: 1, duration: 1, text: ' ' },
    { start: 2, duration: 1, text: 'How are you?' }
  ]);
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].text, 'Hello there. How are you?');
  assert.equal(paragraphs[0].firstIndex, 0);
  assert.equal(paragraphs[0].lastIndex, 2);
});

test('uses end timestamps when duration is not supplied', () => {
  const [paragraph] = groupSegments([{ start: 2, end: 3.5, text: 'Timed caption' }]);
  assert.equal(paragraph.end, 3.5);
});

test('splits one oversized caption rather than creating an unbounded paragraph', () => {
  const words = Array.from({ length: 190 }, (_, i) => `caption${i}`).join(' ');
  const paragraphs = groupSegments([{ start: 4, duration: 3, text: words }]);
  assert.equal(paragraphs.length, 3);
  assert.ok(paragraphs.every(item => countWords(item.text) <= 85));
  assert.equal(paragraphs.map(item => countWords(item.text)).reduce((a, b) => a + b, 0), 190);
});

test('parses JSON3 caption durations into consistent start and duration fields', () => {
  const segments = parseJson3({
    events: [
      { tStartMs: 1250, dDurationMs: 900, segs: [{ utf8: 'Hello ' }, { utf8: 'world.' }] },
      { tStartMs: 2200, dDurationMs: 500, segs: [{ utf8: 'Next line.' }] },
      { tStartMs: 3000, dDurationMs: 500, segs: [{ utf8: '   ' }] }
    ]
  });
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { start: 1.25, duration: 0.9, end: 2.15, text: 'Hello world.' });
  assert.equal(segments[1].start, 2.2);
});

test('returns an empty list for malformed JSON3 structures', () => {
  assert.deepEqual(parseJson3(null), []);
  assert.deepEqual(parseJson3({ events: 'not-an-array' }), []);
});
