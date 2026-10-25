# Simple Browser Copy Pasta

A lightweight Chrome extension for keeping reusable text snippets close at hand. Save named entries with basic rich-text formatting and emoji, preview them at a glance, and copy their contents when needed.

## Website

The static project page is intended to be served at [skywalker94.github.io/SimpleBrowserCopyPasta](https://skywalker94.github.io/SimpleBrowserCopyPasta/). Its source is [`index.html`](./index.html). Enable GitHub Pages for this repository and publish from the repository root for that URL to become available.

The source repository is [github.com/skywalker94/SimpleBrowserCopyPasta](https://github.com/skywalker94/SimpleBrowserCopyPasta), with downloadable builds on the [releases page](https://github.com/skywalker94/SimpleBrowserCopyPasta/releases).

## Features

- Create, edit, and delete named snippets.
- Limit entry names to 50 characters; long names appear on one line and can be read in full by hovering.
- Optionally assign a category or leave it blank (gray/uncategorized). Five preset categories—blue, green, purple, ochre, and orange—can be renamed but not added or removed.
- Filter entries by category, including uncategorized entries.
- Format text with bold, italic, underline, strikethrough, and lists.
- Keep common pasted formatting and emojis in saved snippets.
- Preview a shortened plain-text glimpse of each entry.
- Copy both rich text and plain text to the clipboard when supported.
- Choose a light or dark theme.
- Store entries and preferences in `chrome.storage.local` on this browser instance. Nothing is sent to a cloud service.

## Install for development

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose the `SimpleBrowserCopyPasta` folder.
4. Pin the extension if you want quick access from the toolbar.

After changing extension files, use **Reload** on its card at `chrome://extensions`.

## Usage

1. Open the extension and select **New entry**.
2. Give the entry a name and add or paste text in the editor. Use the formatting toolbar as needed; emoji can be entered or pasted like regular text.
3. Optionally choose a category (or leave **No category** selected), then select **Save entry**. Use **Copy** to copy a snippet, **Edit** to change it, or **Delete** to remove it after confirming in the extension popup.
4. Use the switch in the header to change the theme.

Use the category filters above the entry list to show all snippets, uncategorized entries, or one category. Select **Rename categories** to rename any of the five preset categories. Category names are limited to 24 characters; category colors and the number of categories are fixed.

Entries created before categories were introduced are migrated when loaded: the former General category becomes uncategorized, and other matching preset categories are retained.

When available, Copy places both HTML and plain text on the clipboard. The plain-text fallback is used when rich clipboard writing is unavailable.

## Local storage and privacy

Entries and the theme preference are stored with `chrome.storage.local`, which is scoped to this extension in this browser profile. The extension does not request host access and does not include analytics, cloud sync, or remote scripts. Removing the extension may remove its locally stored data.

The editor accepts common formatting and safe links. Pasted and saved HTML is filtered before it is stored or copied; unsupported styling and unsafe elements are removed.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension metadata, popup, and storage/clipboard permissions. |
| `popup.html` | Popup structure, entry list, and rich-text editor. |
| `popup.css` | Popup layout, controls, and light/dark themes. |
| `popup.js` | Local persistence, editing, sanitization, previews, and clipboard behavior. |
| `index.html` | Self-contained static project and installation guide for GitHub Pages. |
| `README.md` | Installation and usage documentation. |

The extension opens `popup.html` directly. `index.html` is only the static project website and is not used by the extension popup.
