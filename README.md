# Simple Browser Copy Pasta

A lightweight Chrome extension for keeping reusable text snippets close at hand. Save named entries with basic rich-text formatting and emoji, preview them at a glance, and copy their contents when needed.

Project: [GitHub repository](https://github.com/skywalker94/SimpleBrowserCopyPasta) · [GitHub Pages site](https://skywalker94.github.io/SimpleBrowserCopyPasta/)

## Website

The static landing page is [`index.html`](./index.html). To publish it, enable GitHub Pages for `skywalker94/SimpleBrowserCopyPasta` and select the repository root as the source. The published URL is <https://skywalker94.github.io/SimpleBrowserCopyPasta/>.

## Features

- Create, edit, and delete named snippets.
- Limit entry names to 50 characters; long names appear on one line and can be read in full by hovering.
- Delete empty entries immediately; entries with text still show a confirmation prompt.
- Optionally assign one of five fixed categories—**Work** (blue), **Ideas** (gold/yellow), **Social** (purple), **Follow-up** (orange), and **Personal** (green)—or leave it as **None**. Categories can be renamed, disabled, or re-enabled; they cannot be added or removed.
- Filter entries by category, including entries with **None**.
- Enjoy animated sun/moon theme icons, slowly drifting clouds in light mode, and softly twinkling stars in dark mode.
- Play a tiny optional whack-a-mole with occasional cats in light mode or owls in dark mode: one appears at a random position for 2–3 seconds and can be clicked to dismiss. Sky decorations and mascots respect reduced-motion preferences.
- Format text with bold, italic, underline, strikethrough, and lists.
- Keep common pasted formatting and emojis in saved snippets.
- Preview a shortened plain-text glimpse of each entry.
- Copy both rich text and plain text to the clipboard when supported.
- Export entries as plain JSON or an optional password-encrypted JSON backup. Imports merge by default: matching entry IDs update the name and content while retaining the local category, and new entries are added. Replacing all entries requires confirmation before file selection and again before changes are applied.
- Choose a light or dark theme.
- Store entries and preferences in `chrome.storage.local` on this browser instance. Nothing is sent to a cloud service.

## Install for development

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose the `SimpleBrowserCopyPasta` folder.
4. Pin the extension if you want quick access from the toolbar.

After changing extension files, use **Reload** on its card at `chrome://extensions`.

## Usage

1. Open the extension and select **＋ New**.
2. Give the entry a name and add or paste text in the editor. Use the formatting toolbar as needed; emoji can be entered or pasted like regular text.
3. Optionally choose a category (or leave **None** selected), then select **Save entry**. Use **Copy** to copy a snippet, **Edit** to change it, or **Delete** to remove it after confirming in the extension popup.
4. Select the file icon beside **New** to export a plain JSON backup, export a password-protected backup, or import a backup. Imports merge by default; encrypted backups prompt for their password. Matching entries get their name and content from the backup but keep their current local category. New entries use the imported category if it is active; otherwise, they are assigned to **None**.
5. To replace entries, choose **Replace entries from JSON**. Confirm before the file picker opens, then confirm again after the backup is selected and read. Cancel either prompt to leave current entries unchanged.
6. Use the switch in the header to change the theme.

Use the category filters above the entry list to show all snippets, entries with no category (**None**), or one active category. Select the gear button to rename categories. Leave a category name blank to disable and hide it; if it contains entries, confirm to move those entries to **None**. Re-enable it at any time by assigning it a name again. Category names are limited to 24 characters; category colors, order, and the number of categories are fixed. Entries formerly assigned to the removed Red or Brown categories move to **None**.

Entries created before categories were introduced are migrated when loaded: the former General category becomes uncategorised, and other matching preset categories are retained.

When available, Copy places both HTML and plain text on the clipboard. The plain-text fallback is used when rich clipboard writing is unavailable.

## Local storage and privacy

Entries, category names, and the theme preference are stored with `chrome.storage.local`, which is scoped to this extension in this browser profile. Backups contain entries only, not category names or theme preferences. Plain JSON backups are unencrypted and include saved snippet text. The optional encrypted format uses browser Web Crypto with AES-256-GCM and a password-derived key using PBKDF2-SHA-256 (600,000 iterations); the password is not stored or sent anywhere. Use a unique, strong password of at least 12 characters, and consider keeping it in a password manager. **If you forget the password, the encrypted backup cannot be recovered; there is no reset or recovery process.** Backup files are limited to 10 MB; imports are validated and sanitized before being applied. The extension requests only local storage and clipboard access; it does not request host access or include analytics, cloud sync, or remote scripts. Removing the extension may remove its locally stored data.

The editor accepts common formatting and safe links. Pasted and saved HTML is filtered before it is stored or copied; unsupported styling and unsafe elements are removed.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension metadata, icon, popup, and storage/clipboard permissions. |
| `images/logo_64.png` | Extension, toolbar, and static site logo. |
| `popup.html` | Popup structure, entry list, and rich-text editor. |
| `popup.css` | Popup layout, controls, and light/dark themes. |
| `popup.js` | Local persistence, editing, sanitization, previews, clipboard, and JSON backup behavior. |
| `index.html` | Static project overview and installation guide for GitHub Pages. |
| `README.md` | Installation and usage documentation. |

The extension opens `popup.html` directly. `index.html` is only the static project website and is not used by the extension popup.
