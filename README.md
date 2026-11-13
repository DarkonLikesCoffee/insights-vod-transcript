# Insights.gg Transcript

Version 1.0.0. Chrome Manifest V3 extension that displays a synchronized transcript in Chrome's native Side Panel by default, with the original separate popup-style window retained as an alternative. Both modes share the same transcript page and rendering logic.

## Features
- Clicking the extension icon on an Insights.gg VOD opens Chrome's native Side Panel.
- The extension action popup offers **Open in Side Panel** (primary) and **Open in separate window**.
- The Side Panel follows the active Insights.gg VOD tab and each tab retains its own transcript context.
- The separate window stays pinned to the VOD that opened it and retains its 620 × 760 dimensions.
- Search highlights matches without hiding other captions.
- Click captions or grouped paragraphs to seek the VOD.
- Individual captions or approximately 100-word grouped paragraphs.
- Customizable spacing, text size, font, theme, timestamps, and playback auto-follow.
- Playback ticks are relayed in memory; transcript data is persisted per VOD tab.

## Install
1. Open `chrome://extensions` and enable Developer mode.
2. Select **Load unpacked** and choose the folder containing `manifest.json`.
3. Open an Insights.gg VOD and click the extension icon to open the Side Panel.
4. For the separate window, click the extension icon and select **Open in separate window**.

## Architecture
- `transcript.html` and `transcript.js` power both display modes; rendering and settings are not duplicated.
- `background.js` owns per-tab contexts and routes state, playback, and seek messages.
- `popup.js` is only the display-mode chooser.

## Limitations
- Caption capture depends on the embedded YouTube player requesting timedtext data; some VODs require enabling CC and starting playback.
- Chrome Side Panel API support is required (Chrome 114+).
- Test multiple live Insights.gg tabs to verify tab switching and context isolation.
