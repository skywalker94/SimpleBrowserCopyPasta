/* globals chrome */

(() => {
  'use strict';

  const ENTRIES_KEY = 'simple_copy_pasta_entries_v1';
  const THEME_KEY = 'simple_copy_pasta_theme';
  const CATEGORY_NAMES_KEY = 'simple_copy_pasta_category_names_v1';
  const BACKUP_FORMAT = 'simple-browser-copy-pasta';
  const BACKUP_VERSION = 1;
  const ENCRYPTED_BACKUP_FORMAT = 'simple-browser-copy-pasta-encrypted';
  const ENCRYPTED_BACKUP_VERSION = 1;
  const BACKUP_KDF_ITERATIONS = 600000;
  const BACKUP_PASSWORD_MIN_LENGTH = 12;
  const MAX_BACKUP_SIZE = 10 * 1024 * 1024;
  const MAX_ENTRY_NAME_LENGTH = 50;
  const MAX_PREVIEW_LENGTH = 180;
  const MAX_CATEGORY_NAME_LENGTH = 24;
  const UNCATEGORIZED_COLOR = '#94a3b8';
  const REMOVED_CATEGORY_IDS = new Set(['red', 'brown']);
  const CATEGORIES = {
    work: { defaultName: 'Work', color: '#3b82f6', inputId: 'categoryNameWork' },
    ideas: { defaultName: 'Ideas', color: '#c49a2a', inputId: 'categoryNameIdeas' },
    social: { defaultName: 'Social', color: '#a855f7', inputId: 'categoryNameSocial' },
    followup: { defaultName: 'Follow-up', color: '#f97316', inputId: 'categoryNameFollowup' },
    personal: { defaultName: 'Personal', color: '#22a06b', inputId: 'categoryNamePersonal' }
  };
  const DEFAULT_CATEGORY_NAMES = Object.fromEntries(
    Object.entries(CATEGORIES).map(([id, category]) => [id, category.defaultName])
  );
  const ALLOWED_TAGS = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM', 'H1', 'H2',
    'H3', 'H4', 'H5', 'H6', 'I', 'LI', 'OL', 'P', 'PRE', 'S', 'STRONG',
    'SUB', 'SUP', 'U', 'UL'
  ]);
  const BLOCK_TAGS = new Set([
    'BLOCKQUOTE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'OL',
    'P', 'PRE', 'UL'
  ]);

  const listView = document.getElementById('listView');
  const editorView = document.getElementById('editorView');
  const entryList = document.getElementById('entryList');
  const emptyState = document.getElementById('emptyState');
  const entryForm = document.getElementById('entryForm');
  const entryName = document.getElementById('entryName');
  const entryCategory = document.getElementById('entryCategory');
  const entryContent = document.getElementById('entryContent');
  const editorHeading = document.getElementById('editorHeading');
  const status = document.getElementById('status');
  const themeToggle = document.getElementById('themeToggle');
  const categoryFilters = document.getElementById('categoryFilters');
  const deleteDialog = document.getElementById('deleteDialog');
  const deleteDialogMessage = document.getElementById('deleteDialogMessage');
  const cancelDelete = document.getElementById('cancelDelete');
  const confirmDelete = document.getElementById('confirmDelete');
  const categoryDialog = document.getElementById('categoryDialog');
  const disableCategoryDialog = document.getElementById('disableCategoryDialog');
  const disableCategoryMessage = document.getElementById('disableCategoryMessage');
  const backupDialog = document.getElementById('backupDialog');
  const backupError = document.getElementById('backupError');
  const backupFileInput = document.getElementById('backupFileInput');
  const replaceConfirmDialog = document.getElementById('replaceConfirmDialog');
  const replaceConfirmMessage = document.getElementById('replaceConfirmMessage');
  const replaceError = document.getElementById('replaceError');
  const backupPasswordDialog = document.getElementById('backupPasswordDialog');
  const backupPasswordForm = document.getElementById('backupPasswordForm');
  const backupPassword = document.getElementById('backupPassword');
  const backupPasswordConfirm = document.getElementById('backupPasswordConfirm');
  const backupPasswordConfirmGroup = document.getElementById('backupPasswordConfirmGroup');
  const backupPasswordDescription = document.getElementById('backupPasswordDescription');
  const backupPasswordError = document.getElementById('backupPasswordError');
  const submitBackupPassword = document.getElementById('submitBackupPassword');
  const categoryForm = document.getElementById('categoryForm');
  const categoryError = document.getElementById('categoryError');
  const cancelCategories = document.getElementById('cancelCategories');
  const cancelDisableCategory = document.getElementById('cancelDisableCategory');
  const confirmDisableCategory = document.getElementById('confirmDisableCategory');
  const mascot = document.getElementById('mascot');
  const categoryNameInputs = Object.fromEntries(
    Object.entries(CATEGORIES).map(([id, category]) => [id, document.getElementById(category.inputId)])
  );

  let entries = [];
  let categoryNames = { ...DEFAULT_CATEGORY_NAMES };
  let editingId = null;
  let activeFilter = 'all';
  let pendingDeleteEntry = null;
  let returnFocusTo = null;
  let categoryDialogReturnFocus = null;
  let pendingCategoryNames = null;
  let pendingDisabledCategories = [];
  let pendingImportEntries = null;
  let pendingEncryptedBackup = null;
  let pendingImportMode = 'merge';
  let backupPasswordMode = null;
  let replaceStage = 'choose-file';
  let themeAnimationTimeout = null;
  let mascotTimer = null;

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result);
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function showBackupError(message) {
    backupError.textContent = message;
    backupError.hidden = !message;
  }

  function openBackupDialog() {
    showBackupError('');
    backupDialog.hidden = false;
    document.getElementById('exportBackup').focus();
  }

  function openBackupPasswordDialog(mode, encryptedBackup = null) {
    backupPasswordMode = mode;
    pendingEncryptedBackup = encryptedBackup;
    backupPasswordForm.reset();
    backupPasswordError.hidden = true;
    const isExport = mode === 'export';
    backupPasswordConfirmGroup.hidden = !isExport;
    backupPasswordConfirm.required = isExport;
    document.getElementById('backupPasswordTitle').textContent = isExport
      ? 'Protect backup with a password'
      : 'Unlock encrypted backup';
    backupPasswordDescription.textContent = isExport
      ? `Use a unique password of at least ${BACKUP_PASSWORD_MIN_LENGTH} characters. It encrypts the backup on this device and is not saved. If you forget it, the backup cannot be unlocked; there is no reset or recovery.`
      : 'Enter the password used to encrypt this backup. If it is forgotten, the backup cannot be unlocked; there is no reset or recovery.';
    submitBackupPassword.textContent = isExport ? 'Encrypt and download' : 'Unlock backup';
    backupPasswordDialog.hidden = false;
    backupPassword.focus();
  }

  function closeBackupPasswordDialog() {
    const returnTo = backupPasswordMode === 'export'
      ? 'exportEncryptedBackup'
      : pendingEncryptedBackup?.mode === 'replace' ? 'replaceBackup' : 'importBackup';
    backupPasswordDialog.hidden = true;
    backupPasswordForm.reset();
    backupPasswordError.hidden = true;
    backupPasswordMode = null;
    pendingEncryptedBackup = null;
    if (!backupDialog.hidden) {
      document.getElementById(returnTo).focus();
    }
  }

  function closeBackupDialog(restoreFocus = true) {
    backupDialog.hidden = true;
    replaceConfirmDialog.hidden = true;
    backupPasswordDialog.hidden = true;
    pendingImportEntries = null;
    pendingEncryptedBackup = null;
    backupPasswordMode = null;
    backupPasswordForm.reset();
    replaceStage = 'choose-file';
    showBackupError('');
    replaceError.hidden = true;
    if (restoreFocus) document.getElementById('openBackup').focus();
  }

  function closeReplaceConfirm(restoreFocus = true) {
    replaceConfirmDialog.hidden = true;
    pendingImportEntries = null;
    replaceStage = 'choose-file';
    replaceError.hidden = true;
    if (restoreFocus) document.getElementById('replaceBackup').focus();
  }

  function openReplaceFileConfirm() {
    pendingImportEntries = null;
    replaceStage = 'choose-file';
    document.getElementById('replaceConfirmTitle').textContent = 'Choose a replacement backup?';
    replaceConfirmMessage.textContent =
      'Warning: Importing will replace all current entries. After selecting a file, you get a preview of the exact number of entries to be removed and added before any changes happen.';
    document.getElementById('confirmReplace').textContent = 'Choose file…';
    replaceError.hidden = true;
    replaceConfirmDialog.hidden = false;
    document.getElementById('confirmReplace').focus();
  }

  function chooseReplacementFile() {
    replaceConfirmDialog.hidden = true;
    backupFileInput.value = '';
    backupFileInput.click();
  }

  function chooseBackupFile(mode) {
    pendingImportMode = mode;
    showBackupError('');
    if (mode === 'replace') {
      openReplaceFileConfirm();
      return;
    }
    backupFileInput.value = '';
    backupFileInput.click();
  }

  function createBackupData() {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      entries: entries.map(({ id, name, content, category, updatedAt }) => ({
        id,
        name,
        content: sanitizeHtml(content),
        category: Object.prototype.hasOwnProperty.call(CATEGORIES, category) ? category : '',
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
      }))
    };
  }

  function encodeBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function decodeBase64(value, expectedLength = null) {
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      throw new Error('The encrypted backup has invalid encoding.');
    }
    const binary = atob(value);
    if (expectedLength !== null && binary.length !== expectedLength) {
      throw new Error('The encrypted backup has invalid encryption parameters.');
    }
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function backupAdditionalData() {
    return new TextEncoder().encode(
      `${ENCRYPTED_BACKUP_FORMAT}:${ENCRYPTED_BACKUP_VERSION}:PBKDF2-SHA-256:${BACKUP_KDF_ITERATIONS}:AES-256-GCM`
    );
  }

  async function deriveBackupKey(password, salt, usages) {
    if (!globalThis.crypto?.subtle) throw new Error('Secure encryption is not available in this browser.');
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: BACKUP_KDF_ITERATIONS },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      usages
    );
  }

  async function encryptBackup(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt, ['encrypt']);
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: backupAdditionalData(), tagLength: 128 },
      key,
      plaintext
    );
    return {
      format: ENCRYPTED_BACKUP_FORMAT,
      version: ENCRYPTED_BACKUP_VERSION,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: BACKUP_KDF_ITERATIONS,
        salt: encodeBase64(salt)
      },
      cipher: {
        name: 'AES-256-GCM',
        iv: encodeBase64(iv)
      },
      ciphertext: encodeBase64(new Uint8Array(ciphertext))
    };
  }

  function validateEncryptedBackup(backup) {
    if (!backup || typeof backup !== 'object' || Array.isArray(backup) ||
      backup.format !== ENCRYPTED_BACKUP_FORMAT || backup.version !== ENCRYPTED_BACKUP_VERSION ||
      !backup.kdf || backup.kdf.name !== 'PBKDF2' || backup.kdf.hash !== 'SHA-256' ||
      backup.kdf.iterations !== BACKUP_KDF_ITERATIONS ||
      !backup.cipher || backup.cipher.name !== 'AES-256-GCM' ||
      typeof backup.ciphertext !== 'string' || backup.ciphertext.length > MAX_BACKUP_SIZE * 2) {
      throw new Error('This is not a supported encrypted Copy Pasta backup.');
    }
    const salt = decodeBase64(backup.kdf.salt, 16);
    const iv = decodeBase64(backup.cipher.iv, 12);
    const ciphertext = decodeBase64(backup.ciphertext);
    if (ciphertext.length < 16 || ciphertext.length > MAX_BACKUP_SIZE) {
      throw new Error('The encrypted backup has invalid or oversized data.');
    }
    return { salt, iv, ciphertext };
  }

  async function decryptBackup(backup, password) {
    const { salt, iv, ciphertext } = validateEncryptedBackup(backup);
    const key = await deriveBackupKey(password, salt, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: backupAdditionalData(), tagLength: 128 },
      key,
      ciphertext
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  }

  function downloadBackup(data, encrypted) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    if (blob.size > MAX_BACKUP_SIZE) {
      throw new Error('This backup exceeds the 10 MB import limit. Export fewer entries or use smaller snippets.');
    }
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url;
    download.download = `simple-browser-copy-pasta-${encrypted ? 'encrypted-' : ''}backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(download);
    download.click();
    download.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    closeBackupDialog();
    showStatus(`${encrypted ? 'Password-protected backup' : 'Backup'} exported (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}).`);
  }

  function exportBackup() {
    try {
      downloadBackup(createBackupData(), false);
    } catch (error) {
      showBackupError(`Could not export backup: ${error.message}`);
    }
  }

  function validateBackup(text) {
    let backup;
    try {
      backup = JSON.parse(text);
    } catch {
      throw new Error('This file is not valid JSON.');
    }

    if (!backup || typeof backup !== 'object' || Array.isArray(backup) ||
      backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION ||
      !Array.isArray(backup.entries)) {
      throw new Error('This is not a supported Copy Pasta backup file.');
    }

    const seenIds = new Set();
    return backup.entries.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128 ||
        typeof item.name !== 'string' || !item.name.trim() ||
        item.name.trim().length > MAX_ENTRY_NAME_LENGTH ||
        typeof item.content !== 'string') {
        throw new Error(`Entry ${index + 1} has invalid or unsupported data.`);
      }
      const id = item.id.trim();
      if (seenIds.has(id)) {
        throw new Error(`The backup contains duplicate entry IDs (entry ${index + 1}).`);
      }
      seenIds.add(id);
      const importedCategory = typeof item.category === 'string' ? item.category : '';
      return {
        id,
        name: item.name.trim(),
        content: sanitizeHtml(item.content),
        category: Object.prototype.hasOwnProperty.call(CATEGORIES, importedCategory) &&
          !REMOVED_CATEGORY_IDS.has(importedCategory) && categoryNames[importedCategory]
          ? importedCategory
          : '',
        updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now()
      };
    });
  }

  async function applyImportedEntries(importedEntries, mode) {
    try {
      if (mode === 'replace') {
        pendingImportEntries = importedEntries;
        replaceStage = 'confirm';
        document.getElementById('replaceConfirmTitle').textContent = 'Replace all entries?';
        replaceConfirmMessage.textContent =
          `This backup contains ${importedEntries.length} ${importedEntries.length === 1 ? 'entry' : 'entries'}. Replacing will remove all ${entries.length} current ${entries.length === 1 ? 'entry' : 'entries'}. This cannot be undone.`;
        document.getElementById('confirmReplace').textContent = 'Replace entries';
        replaceError.hidden = true;
        replaceConfirmDialog.hidden = false;
        document.getElementById('confirmReplace').focus();
        return;
      }
      const importedById = new Map(importedEntries.map((entry) => [entry.id, entry]));
      const existingById = new Map(entries.map((entry) => [entry.id, entry]));
      const mergedEntries = [
        ...importedEntries.map((entry) => {
          const existing = existingById.get(entry.id);
          return existing ? { ...entry, category: existing.category } : entry;
        }),
        ...entries.filter((entry) => !importedById.has(entry.id))
      ];
      await storageSet({ [ENTRIES_KEY]: mergedEntries });
      entries = mergedEntries;
      renderEntries();
      closeBackupDialog();
      showStatus(`Backup merged (${importedEntries.length} imported ${importedEntries.length === 1 ? 'entry' : 'entries'}).`);
    } catch (error) {
      if (mode === 'replace') backupDialog.hidden = false;
      showBackupError(`Could not import backup: ${error.message}`);
    }
  }

  async function importBackupFile(file, mode) {
    showBackupError('');
    if (file.size > MAX_BACKUP_SIZE) {
      showBackupError('The selected backup is too large to import (maximum 10 MB).');
      if (mode === 'replace') backupDialog.hidden = false;
      return;
    }

    try {
      const text = await file.text();
      let documentData;
      try {
        documentData = JSON.parse(text);
      } catch {
        throw new Error('This file is not valid JSON.');
      }
      if (documentData && typeof documentData === 'object' &&
        documentData.format === ENCRYPTED_BACKUP_FORMAT) {
        validateEncryptedBackup(documentData);
        openBackupPasswordDialog('import', { backup: documentData, mode });
        return;
      }
      await applyImportedEntries(validateBackup(text), mode);
    } catch (error) {
      if (mode === 'replace') backupDialog.hidden = false;
      showBackupError(`Could not import backup: ${error.message}`);
    }
  }

  async function submitBackupPasswordForm(event) {
    event.preventDefault();
    const password = backupPassword.value;
    if (password.length < BACKUP_PASSWORD_MIN_LENGTH) {
      backupPasswordError.textContent = `Use a password with at least ${BACKUP_PASSWORD_MIN_LENGTH} characters.`;
      backupPasswordError.hidden = false;
      backupPassword.focus();
      return;
    }

    if (backupPasswordMode === 'export' && password !== backupPasswordConfirm.value) {
      backupPasswordError.textContent = 'The passwords do not match.';
      backupPasswordError.hidden = false;
      backupPasswordConfirm.focus();
      return;
    }

    const mode = backupPasswordMode;
    const encryptedBackup = pendingEncryptedBackup;
    backupPassword.value = '';
    backupPasswordConfirm.value = '';
    submitBackupPassword.disabled = true;
    backupPasswordError.hidden = true;
    try {
      if (mode === 'export') {
        const envelope = await encryptBackup(createBackupData(), password);
        downloadBackup(envelope, true);
      } else if (mode === 'import' && encryptedBackup) {
        const text = await decryptBackup(encryptedBackup.backup, password);
        const importedEntries = validateBackup(text);
        closeBackupPasswordDialog();
        await applyImportedEntries(importedEntries, encryptedBackup.mode);
      }
    } catch (error) {
      backupPasswordError.textContent = mode === 'import'
        ? 'Could not unlock this backup. The password may be incorrect, or the file may be damaged.'
        : `Could not encrypt backup: ${error.message}`;
      backupPasswordError.hidden = false;
      backupPassword.focus();
    } finally {
      submitBackupPassword.disabled = false;
    }
  }

  async function confirmBackupReplacement() {
    if (replaceStage === 'choose-file') {
      chooseReplacementFile();
      return;
    }
    if (!pendingImportEntries) return;
    const replacementEntries = pendingImportEntries;
    const confirmButton = document.getElementById('confirmReplace');
    confirmButton.disabled = true;
    replaceError.hidden = true;
    try {
      await storageSet({ [ENTRIES_KEY]: replacementEntries });
      entries = replacementEntries;
      renderEntries();
      closeBackupDialog();
      showStatus(`Entries replaced from backup (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}).`);
    } catch (error) {
      replaceError.textContent = `Could not replace entries: ${error.message}`;
      replaceError.hidden = false;
      confirmButton.focus();
    } finally {
      confirmButton.disabled = false;
    }
  }

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  function sanitizeHtml(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const output = document.createDocumentFragment();

    function copyChildren(source, destination) {
      for (const node of source.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          destination.appendChild(document.createTextNode(node.textContent));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT') continue;
          if (!ALLOWED_TAGS.has(tag)) {
            copyChildren(node, destination);
            continue;
          }

          const safeElement = document.createElement(tag.toLowerCase());
          if (tag === 'A') {
            const rawHref = node.getAttribute('href') || '';
            try {
              const url = new URL(rawHref, document.baseURI);
              if (['https:', 'http:', 'mailto:'].includes(url.protocol)) {
                safeElement.setAttribute('href', url.href);
                safeElement.setAttribute('rel', 'noopener noreferrer');
              }
            } catch {
              // An invalid pasted link is retained as text without a link.
            }
          }
          copyChildren(node, safeElement);
          destination.appendChild(safeElement);
        }
      }
    }

    copyChildren(parsed.body, output);
    const wrapper = document.createElement('div');
    wrapper.appendChild(output);
    return wrapper.innerHTML;
  }

  function plainTextFromHtml(html) {
    const container = document.createElement('div');
    container.innerHTML = sanitizeHtml(html);

    function extractText(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.tagName === 'BR') return '\n';

      const content = Array.from(node.childNodes).map(extractText).join('');
      return BLOCK_TAGS.has(node.tagName) ? `\n${content}\n` : content;
    }

    return extractText(container)
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function previewText(text) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > MAX_PREVIEW_LENGTH
      ? `${normalized.slice(0, MAX_PREVIEW_LENGTH).trimEnd()}…`
      : normalized || '(Empty entry)';
  }

  function makeButton(label, className, onClick, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${className}`;
    button.textContent = label;
    if (title) button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }

  function getCategoryColor(categoryId) {
    return CATEGORIES[categoryId] ? CATEGORIES[categoryId].color : UNCATEGORIZED_COLOR;
  }

  function renderCategoryOptions() {
    entryCategory.replaceChildren();
    const uncategorized = document.createElement('option');
    uncategorized.value = '';
    uncategorized.textContent = 'None';
    entryCategory.appendChild(uncategorized);

    for (const [id, category] of Object.entries(CATEGORIES)) {
      if (!categoryNames[id]) continue;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = categoryNames[id];
      entryCategory.appendChild(option);
    }
  }

  function renderCategoryFilters() {
    categoryFilters.replaceChildren();
    const filters = [
      { id: 'all', label: 'All' },
      { id: '', label: 'None' },
      ...Object.keys(CATEGORIES)
        .filter((id) => categoryNames[id])
        .map((id) => ({ id, label: categoryNames[id] }))
    ];

    for (const filter of filters) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip';
      button.setAttribute('aria-pressed', String(activeFilter === filter.id));
      if (filter.id !== 'all') {
        const dot = document.createElement('span');
        dot.className = 'category-dot';
        dot.style.setProperty('--category-color', getCategoryColor(filter.id));
        button.appendChild(dot);
      }
      button.appendChild(document.createTextNode(filter.label));
      const count = document.createElement('span');
      count.className = 'filter-count';
      count.textContent = String(filter.id === 'all'
        ? entries.length
        : entries.filter((entry) => entry.category === filter.id).length);
      button.appendChild(count);
      button.addEventListener('click', () => {
        activeFilter = filter.id;
        renderEntries();
      });
      categoryFilters.appendChild(button);
    }

    const manageButton = document.createElement('button');
    manageButton.id = 'manageCategories';
    manageButton.type = 'button';
    manageButton.className = 'category-settings-button';
    manageButton.setAttribute('aria-label', 'Rename categories');
    manageButton.title = 'Rename categories';
    manageButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94a7.6 7.6 0 0 0 .05-.94 7.6 7.6 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.49.49 0 0 0 13.89 2h-3.78a.49.49 0 0 0-.49.42L9.26 4.96c-.59.23-1.14.55-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.6 7.6 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.12.21.37.29.61.22l2.39-.96c.49.39 1.04.71 1.63.94l.36 2.54c.04.24.24.42.49.42h3.78c.25 0 .45-.18.49-.42l.36-2.54c.59-.23 1.14-.55 1.63-.94l2.39.96c.23.08.49-.01.61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>';
    manageButton.addEventListener('click', openCategoryDialog);
    categoryFilters.appendChild(manageButton);
  }

  function renderEntries() {
    renderCategoryOptions();
    renderCategoryFilters();
    entryList.replaceChildren();
    const visibleEntries = activeFilter === 'all'
      ? entries
      : entries.filter((entry) => entry.category === activeFilter);
    emptyState.hidden = visibleEntries.length > 0;
    if (entries.length === 0) {
      emptyState.textContent = 'No snippets yet. Add one to get started.';
    } else if (activeFilter === '') {
      emptyState.textContent = 'No uncategorised snippets yet.';
    } else if (activeFilter === 'all') {
      emptyState.textContent = 'No snippets yet. Add one to get started.';
    } else {
      emptyState.textContent = `No ${categoryNames[activeFilter].toLowerCase()} snippets yet.`;
    }

    for (const entry of visibleEntries) {
      const card = document.createElement('article');
      card.className = 'entry-card';
      card.style.setProperty('--category-color', getCategoryColor(entry.category));

      const top = document.createElement('div');
      top.className = 'entry-card-top';
      const name = document.createElement('h3');
      name.className = 'entry-name';
      name.textContent = entry.name;
      name.title = entry.name;
      name.setAttribute('aria-label', entry.name);
      top.appendChild(name);

      if (entry.category) {
        const categoryLabel = document.createElement('span');
        categoryLabel.className = 'entry-category-label';
        categoryLabel.textContent = categoryNames[entry.category];
        top.appendChild(categoryLabel);
      }

      const preview = document.createElement('p');
      preview.className = 'entry-preview';
      preview.textContent = previewText(plainTextFromHtml(entry.content));

      const actions = document.createElement('div');
      actions.className = 'entry-actions';
      actions.append(
        makeButton('Copy', 'primary', () => copyEntry(entry), 'Copy this entry'),
        makeButton('Edit', '', () => openEditor(entry), 'Edit this entry'),
        makeButton('Delete', 'danger', (event) => openDeleteDialog(entry, event.currentTarget), 'Delete this entry')
      );

      card.append(top, preview, actions);
      entryList.appendChild(card);
    }
  }

  function openEditor(entry = null) {
    editingId = entry ? entry.id : null;
    editorHeading.textContent = entry ? 'Edit entry' : 'New entry';
    entryName.value = entry ? entry.name : '';
    entryCategory.value = entry && CATEGORIES[entry.category] ? entry.category : '';
    entryContent.innerHTML = entry ? sanitizeHtml(entry.content) : '';
    listView.hidden = true;
    editorView.hidden = false;
    showStatus('');
    entryName.focus();
  }

  function closeEditor() {
    editorView.hidden = true;
    listView.hidden = false;
    entryForm.reset();
    entryContent.innerHTML = '';
    editingId = null;
    showStatus('');
  }

  async function saveEntry(event) {
    event.preventDefault();
    const name = entryName.value.trim();
    if (!name) {
      showStatus('Please enter a name for this entry.', true);
      entryName.focus();
      return;
    }

    const content = sanitizeHtml(entryContent.innerHTML);
    const existing = editingId ? entries.find((item) => item.id === editingId) : null;
    const entry = {
      id: editingId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      content,
      category: CATEGORIES[entryCategory.value] ? entryCategory.value : '',
      updatedAt: Date.now()
    };
    const updatedEntries = existing
      ? entries.map((item) => item.id === editingId ? entry : item)
      : [entry, ...entries];

    try {
      await storageSet({ [ENTRIES_KEY]: updatedEntries });
      entries = updatedEntries;
      renderEntries();
      closeEditor();
      showStatus('Entry saved.');
    } catch (error) {
      showStatus(`Could not save entry: ${error.message}`, true);
    }
  }

  function closeDeleteDialog(restoreFocus = true) {
    deleteDialog.hidden = true;
    pendingDeleteEntry = null;
    if (restoreFocus && returnFocusTo && returnFocusTo.isConnected) returnFocusTo.focus();
    returnFocusTo = null;
  }

  async function deleteEntry(entry, confirmationOpen = true) {
    const updatedEntries = entries.filter((item) => item.id !== entry.id);
    try {
      await storageSet({ [ENTRIES_KEY]: updatedEntries });
      entries = updatedEntries;
      if (confirmationOpen) closeDeleteDialog(false);
      else returnFocusTo = null;
      renderEntries();
      document.getElementById('addEntry').focus();
      showStatus('Entry deleted.');
    } catch (error) {
      if (confirmationOpen) closeDeleteDialog();
      else returnFocusTo = null;
      showStatus(`Could not delete entry: ${error.message}`, true);
    }
  }

  function openDeleteDialog(entry, trigger) {
    if (!plainTextFromHtml(entry.content).trim()) {
      deleteEntry(entry, false);
      return;
    }

    pendingDeleteEntry = entry;
    returnFocusTo = trigger;
    deleteDialogMessage.textContent = `“${entry.name}” will be permanently deleted.`;
    deleteDialog.hidden = false;
    cancelDelete.focus();
  }

  function openCategoryDialog() {
    categoryDialogReturnFocus = document.getElementById('manageCategories');
    categoryError.hidden = true;
    categoryError.textContent = '';
    for (const [id, input] of Object.entries(categoryNameInputs)) {
      input.value = categoryNames[id];
    }
    categoryDialog.hidden = false;
    categoryNameInputs.work.focus();
  }

  function closeCategoryDialog(restoreFocus = true) {
    categoryDialog.hidden = true;
    if (restoreFocus) document.getElementById('manageCategories')?.focus();
    categoryDialogReturnFocus = null;
  }

  function readCategoryNames(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ...DEFAULT_CATEGORY_NAMES };
    }

    const names = {};
    const activeNames = new Set();
    const colorNames = {
      work: 'Blue',
      ideas: 'Gold/Yellow',
      social: 'Purple',
      followup: 'Orange',
      personal: 'Green'
    };
    const reservedNames = new Set(['all', 'none', 'uncategorized', 'uncategorised']);
    for (const id of Object.keys(CATEGORIES)) {
      const name = value[id];
      let normalizedName = typeof name === 'string' && name.trim().length <= MAX_CATEGORY_NAME_LENGTH
        ? name.trim()
        : DEFAULT_CATEGORY_NAMES[id];
      if (normalizedName.toLocaleLowerCase() === colorNames[id].toLocaleLowerCase()) {
        normalizedName = DEFAULT_CATEGORY_NAMES[id];
      }
      const lowerName = normalizedName.toLocaleLowerCase();
      if (lowerName && (reservedNames.has(lowerName) || activeNames.has(lowerName))) {
        normalizedName = DEFAULT_CATEGORY_NAMES[id];
      }
      const finalName = normalizedName.toLocaleLowerCase();
      if (finalName && (reservedNames.has(finalName) || activeNames.has(finalName))) {
        normalizedName = '';
      }
      names[id] = normalizedName;
      if (normalizedName) activeNames.add(normalizedName.toLocaleLowerCase());
    }
    return names;
  }

  async function commitCategoryNames(updatedNames, disabledCategories) {
    const disabledIds = new Set(disabledCategories.map((category) => category.id));
    const updatedEntries = disabledIds.size > 0
      ? entries.map((entry) => disabledIds.has(entry.category) ? { ...entry, category: '' } : entry)
      : entries;
    const storagePayload = { [CATEGORY_NAMES_KEY]: updatedNames };
    if (disabledIds.size > 0) storagePayload[ENTRIES_KEY] = updatedEntries;

    try {
      await storageSet(storagePayload);
      categoryNames = updatedNames;
      entries = updatedEntries;
      if (activeFilter !== 'all' && activeFilter !== '' && !categoryNames[activeFilter]) {
        activeFilter = 'all';
      }
      pendingCategoryNames = null;
      pendingDisabledCategories = [];
      disableCategoryDialog.hidden = true;
      renderEntries();
      closeCategoryDialog();
      showStatus('Category settings saved.');
    } catch (error) {
      disableCategoryDialog.hidden = true;
      categoryError.textContent = `Could not save category settings: ${error.message}`;
      categoryError.hidden = false;
      categoryNameInputs[disabledCategories[0]?.id || Object.keys(CATEGORIES)[0]].focus();
      pendingCategoryNames = null;
      pendingDisabledCategories = [];
    }
  }

  async function saveCategoryNames(event) {
    event.preventDefault();
    const updatedNames = {};
    for (const [id, input] of Object.entries(categoryNameInputs)) {
      const name = input.value.trim();
      if (name.length > MAX_CATEGORY_NAME_LENGTH) {
        categoryError.textContent = `Category names must be ${MAX_CATEGORY_NAME_LENGTH} characters or fewer.`;
        categoryError.hidden = false;
        input.focus();
        return;
      }
      updatedNames[id] = name;
    }

    const normalizedNames = Object.values(updatedNames).filter(Boolean).map((name) => name.toLocaleLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      categoryError.textContent = 'Each category needs a different name.';
      categoryError.hidden = false;
      return;
    }
    if (normalizedNames.some((name) => ['all', 'none', 'uncategorized', 'uncategorised'].includes(name))) {
      categoryError.textContent = 'Category names cannot use the reserved filter names All or None.';
      categoryError.hidden = false;
      return;
    }

    const disabledCategories = Object.keys(CATEGORIES)
      .filter((id) => categoryNames[id] && !updatedNames[id])
      .map((id) => ({
        id,
        name: categoryNames[id],
        count: entries.filter((entry) => entry.category === id).length
      }))
      .filter((category) => category.count > 0);

    if (disabledCategories.length > 0) {
      pendingCategoryNames = updatedNames;
      pendingDisabledCategories = disabledCategories;
      const summary = disabledCategories
        .map((category) => `${category.name} (${category.count} ${category.count === 1 ? 'entry' : 'entries'})`)
        .join(', ');
      disableCategoryMessage.textContent = `Disabling ${summary} will move those entries to None. Continue?`;
      disableCategoryDialog.hidden = false;
      confirmDisableCategory.focus();
      return;
    }

    await commitCategoryNames(updatedNames, []);
  }

  async function copyEntry(entry) {
    const html = sanitizeHtml(entry.content);
    const text = plainTextFromHtml(html);
    try {
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' })
          })
        ]);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand('copy');
        textArea.remove();
        if (!copied) throw new Error('The browser did not allow clipboard access.');
      }
      showStatus(`Copied "${entry.name}".`);
    } catch (error) {
      showStatus(`Could not copy entry: ${error.message}`, true);
    }
  }

  async function loadData() {
    try {
      const stored = await storageGet([ENTRIES_KEY, THEME_KEY, CATEGORY_NAMES_KEY]);
      categoryNames = readCategoryNames(stored[CATEGORY_NAMES_KEY]);
      const savedEntries = stored[ENTRIES_KEY];
      entries = Array.isArray(savedEntries)
        ? savedEntries.filter((item) => item && typeof item.id === 'string' &&
          typeof item.name === 'string' && typeof item.content === 'string')
          .map((item) => {
            const storedCategory = typeof item.category === 'string' ? item.category : item.tag;
            const removedCategory = REMOVED_CATEGORY_IDS.has(storedCategory);
            const category = removedCategory
              ? ''
              : Object.prototype.hasOwnProperty.call(CATEGORIES, item.category)
                ? item.category
                : Object.prototype.hasOwnProperty.call(CATEGORIES, item.tag) ? item.tag : '';
            return {
              id: item.id,
              name: item.name,
              content: sanitizeHtml(item.content),
              category: categoryNames[category] ? category : '',
              updatedAt: item.updatedAt
            };
          })
        : [];
      if (Array.isArray(savedEntries) && savedEntries.some((item) =>
        item && REMOVED_CATEGORY_IDS.has(item.category || item.tag))) {
        await storageSet({
          [ENTRIES_KEY]: entries.map(({ id, name, content, category, updatedAt }) => ({
            id, name, content, category, updatedAt
          }))
        });
      }

      const dark = stored[THEME_KEY] === 'dark';
      document.body.classList.toggle('dark', dark);
      themeToggle.checked = dark;
      renderEntries();
    } catch (error) {
      showStatus(`Could not load saved entries: ${error.message}`, true);
      emptyState.hidden = false;
    }
  }

  function showMascot() {
    if (!mascot || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const faces = document.body.classList.contains('dark')
      ? ['🦉']
      : ['🐈', '🐈‍⬛', '😺', '😸', '🐱'];
    mascot.replaceChildren();
    const face = document.createElement('button');
    face.type = 'button';
    face.className = 'mascot-face';
    const isOwl = document.body.classList.contains('dark');
    face.textContent = faces[Math.floor(Math.random() * faces.length)];
    face.setAttribute('aria-label', `Dismiss ${isOwl ? 'owl' : 'cat'}`);
    face.title = `Click to dismiss this ${isOwl ? 'owl' : 'cat'}`;
    face.style.setProperty('--mascot-x', `${8 + Math.random() * 84}%`);
    const duration = 2000 + Math.random() * 1000;
    face.style.setProperty('--mascot-duration', `${duration}ms`);
    face.addEventListener('click', dismissMascot);
    mascot.appendChild(face);
    mascot.classList.remove('mascot-pop');
    void mascot.offsetWidth;
    mascot.classList.add('mascot-pop');
    mascotTimer = window.setTimeout(dismissMascot, duration);
  }

  function dismissMascot() {
    if (mascotTimer) window.clearTimeout(mascotTimer);
    mascotTimer = null;
    mascot.classList.remove('mascot-pop');
    mascot.replaceChildren();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      mascotTimer = window.setTimeout(showMascot, 1200 + Math.random() * 3800);
    }
  }

  function scheduleMascot(delay = 800 + Math.random() * 2200) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (mascotTimer) window.clearTimeout(mascotTimer);
    mascotTimer = window.setTimeout(showMascot, delay);
  }

  function animateThemeTransition(isDark) {
    const transitionClass = isDark ? 'theme-transition-dark' : 'theme-transition-light';
    document.body.classList.remove('theme-transition-dark', 'theme-transition-light');
    if (themeAnimationTimeout) window.clearTimeout(themeAnimationTimeout);
    void document.body.offsetWidth;
    document.body.classList.add(transitionClass);
    themeAnimationTimeout = window.setTimeout(() => {
      document.body.classList.remove(transitionClass);
      themeAnimationTimeout = null;
    }, 750);
  }

  document.getElementById('addEntry').addEventListener('click', () => openEditor());
  document.getElementById('openBackup').addEventListener('click', openBackupDialog);
  document.getElementById('exportBackup').addEventListener('click', exportBackup);
  document.getElementById('exportEncryptedBackup').addEventListener('click', () => {
    openBackupPasswordDialog('export');
  });
  document.getElementById('importBackup').addEventListener('click', () => chooseBackupFile('merge'));
  document.getElementById('replaceBackup').addEventListener('click', () => chooseBackupFile('replace'));
  document.getElementById('closeBackup').addEventListener('click', () => closeBackupDialog());
  backupFileInput.addEventListener('change', () => {
    const file = backupFileInput.files?.[0];
    if (file) importBackupFile(file, pendingImportMode);
  });
  backupDialog.addEventListener('click', (event) => {
    if (event.target === backupDialog) closeBackupDialog();
  });
  backupDialog.addEventListener('keydown', (event) => {
    const controls = [
      document.getElementById('exportBackup'),
      document.getElementById('exportEncryptedBackup'),
      document.getElementById('importBackup'),
      document.getElementById('replaceBackup'),
      document.getElementById('closeBackup')
    ];
    if (event.key === 'Escape') {
      event.preventDefault();
      closeBackupDialog();
    } else if (event.key === 'Tab') {
      const index = controls.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (index <= 0 ? controls.length - 1 : index - 1)
        : (index < 0 || index === controls.length - 1 ? 0 : index + 1);
      event.preventDefault();
      controls[nextIndex].focus();
    }
  });
  document.getElementById('cancelBackupPassword').addEventListener('click', closeBackupPasswordDialog);
  backupPasswordForm.addEventListener('submit', submitBackupPasswordForm);
  backupPasswordDialog.addEventListener('click', (event) => {
    if (event.target === backupPasswordDialog) closeBackupPasswordDialog();
  });
  backupPasswordDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeBackupPasswordDialog();
    } else if (event.key === 'Tab') {
      const controls = backupPasswordConfirmGroup.hidden
        ? [backupPassword, document.getElementById('cancelBackupPassword'), submitBackupPassword]
        : [backupPassword, backupPasswordConfirm, document.getElementById('cancelBackupPassword'), submitBackupPassword];
      const index = controls.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (index <= 0 ? controls.length - 1 : index - 1)
        : (index < 0 || index === controls.length - 1 ? 0 : index + 1);
      event.preventDefault();
      controls[nextIndex].focus();
    }
  });
  document.getElementById('cancelReplace').addEventListener('click', () => closeReplaceConfirm());
  document.getElementById('confirmReplace').addEventListener('click', confirmBackupReplacement);
  replaceConfirmDialog.addEventListener('click', (event) => {
    if (event.target === replaceConfirmDialog) closeReplaceConfirm();
  });
  replaceConfirmDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeReplaceConfirm();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const cancel = document.getElementById('cancelReplace');
      const confirm = document.getElementById('confirmReplace');
      if (document.activeElement === cancel) confirm.focus();
      else cancel.focus();
    }
  });
  document.getElementById('cancelEdit').addEventListener('click', closeEditor);
  entryForm.addEventListener('submit', saveEntry);
  categoryForm.addEventListener('submit', saveCategoryNames);
  cancelCategories.addEventListener('click', () => closeCategoryDialog());
  cancelDisableCategory.addEventListener('click', () => {
    disableCategoryDialog.hidden = true;
    const categoryToEdit = pendingDisabledCategories[0]?.id ||
      Object.keys(CATEGORIES).find((id) => !categoryNameInputs[id].value.trim());
    pendingCategoryNames = null;
    pendingDisabledCategories = [];
    if (categoryToEdit) categoryNameInputs[categoryToEdit].focus();
    else categoryForm.querySelector('[type="submit"]').focus();
  });
  confirmDisableCategory.addEventListener('click', () => {
    if (pendingCategoryNames) commitCategoryNames(pendingCategoryNames, pendingDisabledCategories);
  });
  disableCategoryDialog.addEventListener('click', (event) => {
    if (event.target === disableCategoryDialog) cancelDisableCategory.click();
  });
  disableCategoryDialog.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelDisableCategory.click();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      if (document.activeElement === cancelDisableCategory) confirmDisableCategory.focus();
      else cancelDisableCategory.focus();
    }
  });
  cancelDelete.addEventListener('click', closeDeleteDialog);
  confirmDelete.addEventListener('click', () => {
    if (pendingDeleteEntry) deleteEntry(pendingDeleteEntry);
  });
  deleteDialog.addEventListener('click', (event) => {
    if (event.target === deleteDialog) closeDeleteDialog();
  });
  deleteDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDeleteDialog();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      if (document.activeElement === cancelDelete) confirmDelete.focus();
      else cancelDelete.focus();
    }
  });
  categoryDialog.addEventListener('click', (event) => {
    if (event.target === categoryDialog) closeCategoryDialog();
  });
  categoryDialog.addEventListener('keydown', (event) => {
    const inputs = [...Object.values(categoryNameInputs), cancelCategories, categoryForm.querySelector('[type="submit"]')];
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCategoryDialog();
    } else if (event.key === 'Tab') {
      const index = inputs.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (index <= 0 ? inputs.length - 1 : index - 1)
        : (index < 0 || index === inputs.length - 1 ? 0 : index + 1);
      event.preventDefault();
      inputs[nextIndex].focus();
    }
  });

  document.querySelectorAll('.toolbar button[data-command]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      entryContent.focus();
      document.execCommand(button.dataset.command, false);
    });
  });

  entryContent.addEventListener('paste', (event) => {
    event.preventDefault();
    const clipboard = event.clipboardData;
    const html = clipboard.getData('text/html');
    const pasteHtml = html ? sanitizeHtml(html) : '';
    if (pasteHtml) {
      document.execCommand('insertHTML', false, pasteHtml);
    } else {
      document.execCommand('insertText', false, clipboard.getData('text/plain'));
    }
  });

  themeToggle.addEventListener('change', async () => {
    const theme = themeToggle.checked ? 'dark' : 'light';
    document.body.classList.toggle('dark', theme === 'dark');
    animateThemeTransition(theme === 'dark');
    mascot.classList.remove('mascot-pop');
    mascot.replaceChildren();
    scheduleMascot();
    try {
      await storageSet({ [THEME_KEY]: theme });
    } catch (error) {
      showStatus(`Could not save theme preference: ${error.message}`, true);
    }
  });

  scheduleMascot();

  loadData();
})();
