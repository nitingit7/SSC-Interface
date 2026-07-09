/**
 * home.js — Home screen logic
 * Handles JSON upload, paste, validation, test preview, and starting the exam.
 */

// ─── Tab Switching ──────────────────────────────────────────────────────────

function switchInputTab(tab) {
  const uploadPanel = document.getElementById('panel-upload');
  const pastePanel  = document.getElementById('panel-paste');
  const tabUpload   = document.getElementById('tab-upload');
  const tabPaste    = document.getElementById('tab-paste');
  const preview     = document.getElementById('test-preview');

  if (tab === 'upload') {
    uploadPanel.style.display = '';
    pastePanel.style.display  = 'none';
    tabUpload.classList.add('active');
    tabPaste.classList.remove('active');
  } else {
    uploadPanel.style.display = 'none';
    pastePanel.style.display  = '';
    tabUpload.classList.remove('active');
    tabPaste.classList.add('active');
  }

  // Hide preview when switching tabs
  if (preview) preview.classList.remove('visible');
  const startBtn = document.getElementById('btn-start-test');
  if (startBtn) startBtn.disabled = true;
  window._pendingTestData = null;
}

// ─── Paste JSON Parsing ──────────────────────────────────────────────────────

function parseFromPaste() {
  const textarea = document.getElementById('json-paste-area');
  const raw = textarea ? textarea.value.trim() : '';

  if (!raw) {
    shakePasteArea('Please paste your JSON before clicking Parse.');
    return;
  }

  textarea.classList.remove('error');

  try {
    const data = JSON.parse(raw);
    validateAndPreview(data);
  } catch (err) {
    shakePasteArea('Invalid JSON — check for missing commas, brackets, or quotes.');
  }
}

function clearPaste() {
  const textarea = document.getElementById('json-paste-area');
  if (textarea) { textarea.value = ''; textarea.classList.remove('error'); textarea.focus(); }
  const preview = document.getElementById('test-preview');
  if (preview) preview.classList.remove('visible');
  const startBtn = document.getElementById('btn-start-test');
  if (startBtn) startBtn.disabled = true;
  window._pendingTestData = null;
}

function shakePasteArea(msg) {
  const textarea = document.getElementById('json-paste-area');
  if (textarea) {
    textarea.classList.remove('error');
    // Force reflow so animation restarts
    void textarea.offsetWidth;
    textarea.classList.add('error');
    setTimeout(() => textarea.classList.remove('error'), 600);
  }
  showError(msg);
}

// ─── Reset (Clear button on preview) ────────────────────────────────────────

function resetInput() {
  window._pendingTestData = null;
  const preview = document.getElementById('test-preview');
  if (preview) preview.classList.remove('visible');
  const startBtn = document.getElementById('btn-start-test');
  if (startBtn) startBtn.disabled = true;

  // Also clear file input and textarea
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';
  const textarea = document.getElementById('json-paste-area');
  if (textarea) { textarea.value = ''; textarea.classList.remove('error'); }
}

// ─── Initialization ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setupUploadArea();
  setupThemeToggle();
  State.clear(); // Fresh start whenever home is loaded
});

// ─── Theme ─────────────────────────────────────────────────────────────────

function applyTheme() {
  const theme = localStorage.getItem('qm_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('qm_theme', next);
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

// ─── File Upload ───────────────────────────────────────────────────────────

function setupUploadArea() {
  const area = document.getElementById('upload-area');
  const input = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('upload-btn');

  if (uploadBtn) uploadBtn.addEventListener('click', () => input.click());
  if (area) area.addEventListener('click', () => input.click());

  if (input) {
    input.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) handleFile(file);
      input.value = ''; // Reset so same file can be re-selected
    });
  }

  // Drag & Drop
  if (area) {
    area.addEventListener('dragover', e => {
      e.preventDefault();
      area.classList.add('drag-over');
    });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => {
      e.preventDefault();
      area.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }
}

// ─── File Handling ─────────────────────────────────────────────────────────

function handleFile(file) {
  if (!file.name.endsWith('.json')) {
    showError('Please upload a valid JSON file (.json)');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      validateAndPreview(data);
    } catch (err) {
      showError('Invalid JSON file. Please check the format and try again.');
    }
  };
  reader.onerror = () => showError('Could not read the file. Please try again.');
  reader.readAsText(file);
}

function validateAndPreview(data) {
  // Basic validation
  if (!data.test_type || !['full', 'sectional'].includes(data.test_type)) {
    showError('JSON must have "test_type" set to "full" or "sectional".');
    return;
  }
  if (!data.title || typeof data.title !== 'string') {
    showError('JSON must have a "title" string field.');
    return;
  }
  if (!Array.isArray(data.sections) || data.sections.length === 0) {
    showError('JSON must have a non-empty "sections" array.');
    return;
  }
  if (!data.marking || typeof data.marking.correct !== 'number') {
    showError('JSON must have a valid "marking" object with "correct", "wrong", "unattempted" fields.');
    return;
  }

  // Validate each section
  for (const sec of data.sections) {
    if (!sec.id || !sec.name || !sec.time_minutes) {
      showError(`Section "${sec.name || sec.id}" is missing required fields: id, name, time_minutes.`);
      return;
    }
    if (!Array.isArray(sec.questions) || sec.questions.length === 0) {
      showError(`Section "${sec.name}" has no questions.`);
      return;
    }
    for (const q of sec.questions) {
      if (!q.id || !q.text || !Array.isArray(q.options) || q.options.length < 2) {
        showError(`Question "${q.id}" in section "${sec.name}" is missing required fields or has fewer than 2 options.`);
        return;
      }
      if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) {
        showError(`Question "${q.id}" has an invalid "answer" index. It must be 0 to ${q.options.length - 1}.`);
        return;
      }
    }
  }

  // All good — render preview
  renderPreview(data);

  // Store testData for the Start button
  window._pendingTestData = data;
}

// ─── Preview Rendering ─────────────────────────────────────────────────────

function renderPreview(data) {
  const preview = document.getElementById('test-preview');
  if (!preview) return;

  // Badge
  const badge = document.getElementById('preview-badge');
  if (badge) {
    badge.className = 'preview-badge ' + (data.test_type === 'full' ? 'badge-full' : 'badge-sectional');
    badge.textContent = data.test_type === 'full' ? '📋 Full Test' : '📌 Sectional';
  }

  // Title
  const title = document.getElementById('preview-title');
  if (title) title.textContent = data.title;

  // Stats
  const totalQ   = data.sections.reduce((s, sec) => s + sec.questions.length, 0);
  const totalTime = data.sections.reduce((s, sec) => s + sec.time_minutes, 0);
  const maxMarks  = totalQ * data.marking.correct;

  const el = id => document.getElementById(id);
  if (el('stat-total-q'))   el('stat-total-q').textContent   = totalQ;
  if (el('stat-sections'))  el('stat-sections').textContent  = data.sections.length;
  if (el('stat-time'))      el('stat-time').textContent      = `${totalTime} min`;
  if (el('stat-max-marks')) el('stat-max-marks').textContent = maxMarks;

  // Section List
  const list = document.getElementById('section-list-items');
  if (list) {
    list.innerHTML = data.sections.map(sec => `
      <div class="section-chip">
        <span class="section-chip-name">${sec.name}</span>
        <span class="section-chip-meta">
          <span>🗂 ${sec.questions.length} Qs</span>
          <span>⏱ ${sec.time_minutes} min</span>
        </span>
      </div>
    `).join('');
  }

  // Marking Info
  const mInfo = document.getElementById('marking-info');
  if (mInfo) {
    const m = data.marking;
    mInfo.innerHTML = `
      ✅ Correct: <strong>+${m.correct}</strong> &nbsp;|&nbsp;
      ❌ Wrong: <strong>${m.wrong}</strong> &nbsp;|&nbsp;
      ⬜ Unattempted: <strong>${m.unattempted}</strong>
      ${data.test_type === 'full' ? ' &nbsp;|&nbsp; 🔒 Section-lock enabled' : ''}
    `;
  }

  preview.classList.add('visible');

  // Enable start button
  const startBtn = document.getElementById('btn-start-test');
  if (startBtn) startBtn.disabled = false;
}

// ─── Start Test ────────────────────────────────────────────────────────────

function startTest() {
  if (!window._pendingTestData) return;
  State.initFromTest(window._pendingTestData);
  window.location.href = 'exam.html';
}

// ─── Error Display ─────────────────────────────────────────────────────────

function showError(msg) {
  const toast = document.getElementById('toast');
  if (!toast) { alert(msg); return; }
  toast.textContent = '⚠️ ' + msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4500);
}
