# Insights.gg Transcript

Version 1.0.1. Chrome Manifest V3 extension that captures captions from the embedded YouTube player on Insights.gg VODs and displays a synchronized transcript in Chrome's Side Panel or a separate window.

## Features
- Clicking the extension icon opens a small chooser, with **Open in Side Panel** as the primary option and **Open in separate window** as the alternative.
- The action popup offers **Open in Side Panel** (primary) and **Open in separate window**.
- The Side Panel follows the active Insights.gg VOD tab. Each VOD tab has an independent transcript context.
- The separate window remains pinned to the VOD that opened it.
- Search highlights matching text without hiding other captions.
- Click a caption or paragraph to seek the embedded player.
- Choose individual captions or grouped paragraphs. Grouped paragraphs are split at sentence boundaries, meaningful pauses, and an 85-word maximum. Very long single caption events are split too.
- Customize spacing, text size, font, theme, timestamps, and playback auto-follow.
- Playback time is relayed in memory; transcript data is persisted per VOD tab.

## Install
1. Open `chrome://extensions` and enable Developer mode.
2. Select **Load unpacked** and choose the folder containing `manifest.json`.
3. Open an Insights.gg VOD, click the extension icon, and choose **Open in Side Panel**.
4. To use the alternative window, click the extension icon and select **Open in separate window**.

## Development and tests
No third-party packages are required. Node.js 18 or newer is recommended.

```bash
npm test
```

The tests cover paragraph grouping, whitespace normalization, JSON3 parsing and timing, oversized caption handling, and manifest asset integrity.

## Architecture
- `transcript-utils.js` contains shared caption parsing, normalization, and paragraph grouping used by both the transcript UI and embedded player frame.
- `transcript.html`, `transcript.js`, and `transcript.css` power both display modes.
- `background.js` owns per-tab transcript state and routes playback, seek, and display-mode messages.
- `youtube-hook.js` captures embedded player timedtext responses; `youtube-frame.js` parses and forwards them.
- `popup.js` is only the display-mode chooser.

## Known limitations
- Caption capture depends on the embedded YouTube player requesting timedtext data. Some VODs require enabling CC and starting playback.
- Chrome's Side Panel API requires Chrome 114 or newer.
- The test suite does not replace live testing against multiple Insights.gg VODs and player configurations.
