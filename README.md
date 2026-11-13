# Insights.gg Transcript

Version 1.0.0. Chrome Manifest V3 extension that displays a synchronized transcript in Chrome's native Side Panel by default, with the existing separate popup-style window retained as an alternative. Both modes reuse the same transcript page and rendering logic.

## Features
- Clicking the extension icon on an Insights.gg VOD opens the native Chrome Side Panel.
- The action popup offers **Open in Side Panel** (primary) and **Open in separate window** (alternative).
- The Side Panel follows the active Insights.gg VOD tab. Each source tab keeps its own transcript context.
- The separate window stays associated with the VOD tab that opened it and retains its 620 × 760 dimensions.
- Search highlights matching text without hiding other captions.
- Click a caption or grouped paragraph to seek the VOD.
- Individual captions or approximately 100-word grouped paragraphs.
- Customizable density, text size, font, theme, timestamps, and playback auto-follow.
- Playback ticks are kept in memory and relayed without rewriting the full transcript to storage.

## Install
1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select the folder containing `manifest.json`.
3. Open an Insights.gg VOD and click the extension icon to open the Side Panel.
4. To use a separate window, click the extension icon and choose **Open in separate window**.

## Architecture
- `transcript.html` and `transcript.js` are shared by the Side Panel and separate window.
- `background.js` keeps per-tab transcript state and routes messages to the active Side Panel or the VOD-specific window.
- `popup.js` selects the display mode; transcript rendering is not duplicated.

## Limitations
- Caption capture depends on the embedded YouTube player requesting timedtext data. Some VODs require enabling CC and starting playback.
- Chrome Side Panel API support is required (Chrome 114+).
- Static checks do not replace testing with multiple live Insights.gg VOD tabs.
