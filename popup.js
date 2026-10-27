/* globals chrome */

(() => {
  'use strict';

  const ENTRIES_KEY = 'simple_copy_pasta_entries_v1';
  const THEME_KEY = 'simple_copy_pasta_theme';
  const CATEGORY_NAMES_KEY = 'simple_copy_pasta_category_names_v1';
  const MAX_PREVIEW_LENGTH = 180;
  const MAX_CATEGORY_NAME_LENGTH = 24;
  const UNCATEGORIZED_COLOR = '#94a3b8';
  const CATEGORIES = {
    work: { defaultName: 'Work', color: '#3b82f6', inputId: 'categoryNameWork' },
    personal: { defaultName: 'Personal', color: '#22a06b', inputId: 'categoryNamePersonal' },
    social: { defaultName: 'Social', color: '#a855f7', inputId: 'categoryNameSocial' },
    ideas: { defaultName: 'Ideas', color: '#c49a2a', inputId: 'categoryNameIdeas' },
    followup: { defaultName: 'Follow-up', color: '#f97316', inputId: 'categoryNameFollowup' }
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
  const categoryForm = document.getElementById('categoryForm');
  const categoryError = document.getElementById('categoryError');
  const cancelCategories = document.getElementById('cancelCategories');
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
    uncategorized.textContent = 'No category';
    entryCategory.appendChild(uncategorized);

    for (const [id, category] of Object.entries(CATEGORIES)) {
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
      { id: '', label: 'Uncategorized' },
      ...Object.keys(CATEGORIES).map((id) => ({ id, label: categoryNames[id] }))
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
      emptyState.textContent = 'No uncategorized snippets yet.';
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
    if (restoreFocus && categoryDialogReturnFocus && categoryDialogReturnFocus.isConnected) {
      categoryDialogReturnFocus.focus();
    }
    categoryDialogReturnFocus = null;
  }

  function readCategoryNames(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ...DEFAULT_CATEGORY_NAMES };
    }

    const names = {};
    for (const id of Object.keys(CATEGORIES)) {
      const name = value[id];
      if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_CATEGORY_NAME_LENGTH) {
        return { ...DEFAULT_CATEGORY_NAMES };
      }
      names[id] = name.trim();
    }

    if (new Set(Object.values(names).map((name) => name.toLocaleLowerCase())).size !== Object.keys(CATEGORIES).length) {
      return { ...DEFAULT_CATEGORY_NAMES };
    }
    if (Object.values(names).some((name) => ['all', 'uncategorized'].includes(name.toLocaleLowerCase()))) {
      return { ...DEFAULT_CATEGORY_NAMES };
    }
    return names;
  }

  async function saveCategoryNames(event) {
    event.preventDefault();
    const updatedNames = {};
    for (const [id, input] of Object.entries(categoryNameInputs)) {
      const name = input.value.trim();
      if (!name) {
        categoryError.textContent = 'Category names cannot be blank. Use “No category” when an entry should stay uncategorized.';
        categoryError.hidden = false;
        input.focus();
        return;
      }
      if (name.length > MAX_CATEGORY_NAME_LENGTH) {
        categoryError.textContent = `Category names must be ${MAX_CATEGORY_NAME_LENGTH} characters or fewer.`;
        categoryError.hidden = false;
        input.focus();
        return;
      }
      updatedNames[id] = name;
    }

    const normalizedNames = Object.values(updatedNames).map((name) => name.toLocaleLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      categoryError.textContent = 'Each category needs a different name.';
      categoryError.hidden = false;
      return;
    }
    if (normalizedNames.some((name) => name === 'all' || name === 'uncategorized')) {
      categoryError.textContent = 'Category names cannot use the reserved names “All” or “Uncategorized”.';
      categoryError.hidden = false;
      return;
    }

    try {
      await storageSet({ [CATEGORY_NAMES_KEY]: updatedNames });
      categoryNames = updatedNames;
      closeCategoryDialog();
      renderEntries();
      showStatus('Category names saved.');
    } catch (error) {
      categoryError.textContent = `Could not save category names: ${error.message}`;
      categoryError.hidden = false;
    }
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
            const category = CATEGORIES[item.category]
              ? item.category
              : CATEGORIES[item.tag] ? item.tag : '';
            return {
              id: item.id,
              name: item.name,
              content: sanitizeHtml(item.content),
              category,
              updatedAt: item.updatedAt
            };
          })
        : [];

      const dark = stored[THEME_KEY] === 'dark';
      document.body.classList.toggle('dark', dark);
      themeToggle.checked = dark;
      renderEntries();
    } catch (error) {
      showStatus(`Could not load saved entries: ${error.message}`, true);
      emptyState.hidden = false;
    }
  }

  document.getElementById('addEntry').addEventListener('click', () => openEditor());
  document.getElementById('manageCategories').addEventListener('click', openCategoryDialog);
  document.getElementById('cancelEdit').addEventListener('click', closeEditor);
  entryForm.addEventListener('submit', saveEntry);
  categoryForm.addEventListener('submit', saveCategoryNames);
  cancelCategories.addEventListener('click', () => closeCategoryDialog());
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
    try {
      await storageSet({ [THEME_KEY]: theme });
    } catch (error) {
      showStatus(`Could not save theme preference: ${error.message}`, true);
    }
  });

  loadData();
})();
