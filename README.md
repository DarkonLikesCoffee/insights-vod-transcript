# Insights.gg Transcript

Version 0.9.2. A Chrome Manifest V3 extension that opens a separate customizable transcript window with a sticky header that keeps search and settings accessible while scrolling for an Insights.gg VOD and synchronizes transcript highlighting with playback. Click any caption or paragraph to seek to its start time.

## Features
- Capture captions requested by the embedded YouTube player (captions may need to be enabled manually).
- Separate popup-style transcript window.
- Click transcript text to seek the VOD.
- Search highlights matching text without hiding other captions.
- Customizable display: individual captions or grouped paragraphs, density, text size, font, theme, timestamps, and playback auto-follow.
- Playback-time updates are relayed without reading or rewriting the full transcript in storage on every tick.
- Settings are saved locally using `chrome.storage.local`.

## Install
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Open an Insights.gg VOD and click the extension icon, then **Open transcript window**.

## Display settings
Click **Settings** to show the settings panel; click it again to hide the panel. Preferences are saved automatically. In **Grouped paragraphs** mode, captions are combined into blocks of approximately 100 words. A block ends at the caption boundary that reaches or passes 100 words, so the final block can be shorter. Each paragraph retains a timestamp at its beginning (if timestamps are enabled) and clicking it seeks to that point.

## Limitations
- Caption capture depends on the embedded YouTube player requesting caption data. In some VODs, enable CC and allow playback to begin.
- Static syntax/package checks do not replace testing in a live Chrome/Insights.gg session.
- The extension does not record video or audio.


### v0.9.3

The settings panel is now part of the sticky header, so opening Settings while scrolled far down keeps the panel visible. On short windows, the settings panel has its own scroll area.
