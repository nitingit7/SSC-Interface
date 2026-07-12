/**
 * exam.js — Core exam logic for Testbook style UI
 */

let state = null;
let timerInterval = null;
let isPaused = false;
let currentZoom = 1;

document.addEventListener('DOMContentLoaded', init);

function init() {
  state = State.get();
  if (!state || !state.testData) {
    window.location.href = 'index.html';
    return;
  }

  // Pre-fill default status for all questions if not present
  state.testData.sections.forEach(sec => {
    if (!state.visitedQuestions[sec.id]) state.visitedQuestions[sec.id] = [];
    if (!state.answers[sec.id]) state.answers[sec.id] = {};
    if (!state.markedForReview[sec.id]) state.markedForReview[sec.id] = [];
  });
  save();

  setupUI();
  enterSection(state.currentSectionIndex, false);
  setupPanels();
}

function save() { State.set(state); }
function curSection() { return state.testData.sections[state.currentSectionIndex]; }
function curQuestion() { return curSection().questions[state.currentQuestionIndex]; }

// ─── Setup UI Events ──────────────────────────────────────────────────────────
function setupUI() {
  document.getElementById('tb-exam-subtitle').textContent = state.testData.title;
  document.getElementById('exam-title-text').textContent = state.testData.title;

  document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(currentZoom + 0.1));
  document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(currentZoom - 0.1));
  
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  
  const btnQuit = document.getElementById('btn-quit');
  if (isAnalysisMode) {
    btnQuit.textContent = 'Back to Results';
    btnQuit.title = 'Back to Results';
    btnQuit.addEventListener('click', () => {
      window.location.href = 'result.html';
    });
  } else {
    btnQuit.addEventListener('click', () => {
      if (confirm('Are you sure you want to quit the test? All progress will be lost.')) {
        State.clear();
        window.location.href = 'index.html';
      }
    });
  }

  // Scroll lock warning
  document.body.style.overflow = 'hidden';
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('scroll-lock-msg');
    if (msgEl) {
      msgEl.style.display = 'block';
      clearTimeout(msgEl.hideTimeout);
      msgEl.hideTimeout = setTimeout(() => {
        msgEl.style.display = 'none';
      }, 3000);
    }
  }, { passive: false });

  const collapseBtn = document.getElementById('btn-collapse-sidebar');
  if (collapseBtn) collapseBtn.addEventListener('click', toggleSidebar);

  const btnPrev = document.getElementById('btn-prev');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      const sec = curSection();
      const sid = sec.id;
      const qid = curQuestion().id;

      if (isAnalysisMode) {
        const filterEl = document.getElementById('palette-filter');
        const filterVal = filterEl ? filterEl.value : 'all';
        let prevIdx = -1;
        for (let i = state.currentQuestionIndex - 1; i >= 0; i--) {
          if (filterVal === 'all') { prevIdx = i; break; }
          const checkQ = sec.questions[i];
          const answered = state.answers[sid][checkQ.id] !== null && state.answers[sid][checkQ.id] !== undefined;
          let statusForFilter = 'skipped';
          if (answered) {
            statusForFilter = (state.answers[sid][checkQ.id] === checkQ.answer) ? 'correct' : 'wrong';
          }
          if (statusForFilter === filterVal) { prevIdx = i; break; }
        }
        if (prevIdx !== -1) {
          state.currentQuestionIndex = prevIdx;
          save(); renderQuestion(); renderPalette();
        }
        return;
      }

      // Test Mode
      if (currentTempOption !== null) state.answers[sid][qid] = currentTempOption;
      else state.answers[sid][qid] = null;

      if (state.currentQuestionIndex > 0) {
        state.currentQuestionIndex--;
        save(); renderQuestion(); renderPalette(); updateAnalysis();
      }
    });
  }

  const btnNext = document.getElementById('btn-next');
  const btnMark = document.getElementById('btn-mark');
  const btnSubmitSec = document.getElementById('btn-submit-section');
  const btnSubmitTest = document.getElementById('btn-submit-test');

  btnNext.addEventListener('click', saveAndNext);
  btnMark.addEventListener('click', markAndNext);
  btnSubmitSec.addEventListener('click', () => openSubmitModal(false));
  btnSubmitTest.addEventListener('click', () => openSubmitModal(true));

  if (isAnalysisMode) {
    document.body.classList.add('analysis-mode');
    btnNext.textContent = 'Next';
    btnMark.style.display = 'none';
    btnSubmitSec.style.display = 'none';
    btnSubmitTest.style.display = 'none';

    // Add Toggle Highlights button
    const btnToggle = document.createElement('button');
    btnToggle.className = 'tb-action-btn';
    btnToggle.id = 'btn-toggle-highlights';
    
    // Read state from sessionStorage
    const isHidden = sessionStorage.getItem('qm_hide_highlights') === 'true';
    btnToggle.textContent = isHidden ? 'Show Highlights' : 'Hide Highlights';
    
    btnToggle.onclick = () => {
      const currentlyHidden = sessionStorage.getItem('qm_hide_highlights') === 'true';
      sessionStorage.setItem('qm_hide_highlights', currentlyHidden ? 'false' : 'true');
      btnToggle.textContent = currentlyHidden ? 'Hide Highlights' : 'Show Highlights';
      renderQuestion(); // Re-render to apply/remove highlights
    };
    
    // Insert before Next button
    btnNext.parentNode.insertBefore(btnToggle, btnNext);
    
    // Show palette filter
    const filterContainer = document.getElementById('palette-filter-container');
    if (filterContainer) {
      filterContainer.style.display = 'block';
      const filterEl = document.getElementById('palette-filter');
      filterEl.addEventListener('change', () => {
        renderPalette();
      });
    }
  }

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', confirmSubmit);
}

function setZoom(val) {
  currentZoom = Math.max(0.8, Math.min(val, 1.5));
  const qCard = document.getElementById('question-card');
  const optList = document.getElementById('options-list');
  const passageText = document.getElementById('passage-text');
  if (qCard) qCard.style.zoom = currentZoom;
  if (optList) optList.style.zoom = currentZoom;
  if (passageText) passageText.style.zoom = currentZoom;
}

function showScrollToast() {
  let toast = document.getElementById('scroll-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'scroll-toast';
    toast.textContent = 'Scroll is locked. Use the scrollbar inside the question or palette area.';
    toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:4px; z-index:9999; transition:opacity 0.3s; opacity:0; pointer-events:none; box-shadow:0 2px 10px rgba(0,0,0,0.2); font-weight:bold;';
    document.body.appendChild(toast);
  }
  
  toast.style.opacity = '1';
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2500);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn("Fullscreen error", err);
    });
  } else {
    document.exitFullscreen();
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('exam-sidebar');
  const btn = document.getElementById('btn-collapse-sidebar');
  sidebar.classList.toggle('collapsed');
  if (sidebar.classList.contains('collapsed')) {
    btn.textContent = '◀';
  } else {
    btn.textContent = '▶';
  }
}



// ─── Header Rendering ────────────────────────────────────────────────────────
function renderHeader() {
  const tabsEl = document.getElementById('section-tabs');
  if (!tabsEl) return;

  const isFullTest = state.testType === 'full';
  
  if (!isFullTest) {
    tabsEl.style.display = 'none';
  } else {
    tabsEl.style.display = 'flex';
    tabsEl.innerHTML = state.testData.sections.map((sec, i) => {
      const isActive = i === state.currentSectionIndex;
      const isLocked = isFullTest && i < state.currentSectionIndex;
      const isFuture = isFullTest && i > state.currentSectionIndex;
      const isDone   = state.sectionSubmitted[sec.id];
      
      let cls = 'tb-part-tab';
      if (isActive) cls += ' active';
      if (isLocked) cls += ' locked';
      if (isDone && !isActive) cls += ' done';
      
      const clickAttr = (!isLocked && !isFuture) ? `onclick="switchSection(${i})"` : 'disabled';
      const partName = state.testData.sections.length > 1 ? `PART-${String.fromCharCode(65 + i)}` : sec.name;

      return `<button class="${cls}" ${clickAttr}>${partName}</button>`;
    }).join('');
  }

  // Update Submit buttons
  if (isAnalysisMode) {
    document.getElementById('btn-submit-section').style.display = 'none';
    document.getElementById('btn-submit-test').style.display = 'none';
  } else {
    const isLastSec = state.currentSectionIndex === state.testData.sections.length - 1;
    if (isFullTest && !isLastSec) {
      document.getElementById('btn-submit-section').style.display = 'block';
      document.getElementById('btn-submit-test').style.display = 'none';
    } else {
      document.getElementById('btn-submit-section').style.display = 'none';
      document.getElementById('btn-submit-test').style.display = 'block';
    }
  }
}

function switchSection(index) {
  if (state.testType === 'full' && index !== state.currentSectionIndex) return;
  enterSection(index, true);
}

function enterSection(index, resetQuestion = true) {
  state.currentSectionIndex = index;
  if (resetQuestion) state.currentQuestionIndex = 0;

  const sec = curSection();
  if (!state.sectionStartTime[sec.id]) {
    state.sectionStartTime[sec.id] = Date.now();
  }

  save();
  renderHeader();
  renderQuestion();
  renderPalette();
  startTimer();
}

const isAnalysisMode = sessionStorage.getItem('qm_analysis_mode') === 'true';

// ─── Timer ───────────────────────────────────────────────────────────────────
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  if (isAnalysisMode) {
    const timerTxt = document.getElementById('timer-text');
    if (timerTxt) {
      timerTxt.textContent = 'Analysis Mode';
      timerTxt.className = 'tb-timer-val';
    }
    return;
  }

  const sec = curSection();
  const totalMs = sec.time_minutes * 60 * 1000;
  const timerTxt = document.getElementById('timer-text');
  
  function tick() {
    if (isPaused) {
      // Shift the start time forward so elapsed time doesn't grow while paused
      state.sectionStartTime[sec.id] += 1000; 
      save();
      return;
    }

    const startTs = state.sectionStartTime[sec.id];
    const elapsed = startTs ? (Date.now() - startTs) : 0;
    const remMs   = Math.max(0, totalMs - elapsed);
    const remSec  = Math.floor(remMs / 1000);
    const mins    = Math.floor(remSec / 60);
    const secs    = remSec % 60;

    if (timerTxt) timerTxt.textContent = `${String(mins).padStart(2, '0')} : ${String(secs).padStart(2, '0')}`;

    timerTxt.className = 'tb-timer-val';
    if (remSec <= 60)       timerTxt.classList.add('alert');
    else if (remSec <= 300) timerTxt.classList.add('warn');

    // Track time for current question
    const q = curQuestion();
    if (state.questionTimeTaken[sec.id] && state.questionTimeTaken[sec.id][q.id] !== undefined) {
      state.questionTimeTaken[sec.id][q.id] += 1;
      save();
    }

    if (remMs === 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      autoSubmitSection();
    }
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function autoSubmitSection() {
  doSubmitSection();
}

// ─── Questions & Options ─────────────────────────────────────────────────────
function renderQuestion() {
  const sec = curSection();
  const q   = curQuestion();
  const sid = sec.id;
  const qid = q.id;

  if (!state.visitedQuestions[sid].includes(qid)) {
    state.visitedQuestions[sid].push(qid);
    save();
  }

  // Initialize temporary option
  const selectedIdx = state.answers[sid][qid];
  currentTempOption = (selectedIdx !== undefined && selectedIdx !== null) ? selectedIdx : null;

  let badgeText = `Question No. ${state.currentQuestionIndex + 1}`;
  if (isAnalysisMode) {
    if (state.questionTimeTaken[sid] && state.questionTimeTaken[sid][qid] !== undefined) {
      badgeText += ` (Time Taken: ${state.questionTimeTaken[sid][qid]}s)`;
    }
    
    // Status text
    let statusText = 'Skipped';
    if (selectedIdx !== null && selectedIdx !== undefined) {
      statusText = (selectedIdx === q.answer) ? 'Correct' : 'Wrong';
    }
    
    // Add color logic for status badge based on status
    const statusBadge = document.getElementById('q-status-badge');
    if (statusBadge) {
      statusBadge.textContent = statusText;
      if (statusText === 'Correct') {
        statusBadge.style.color = '#4caf50';
      } else if (statusText === 'Wrong') {
        statusBadge.style.color = '#f44336';
      } else {
        statusBadge.style.color = '#757575';
      }
    }
  }
  document.getElementById('q-num-badge').textContent = badgeText;
  document.getElementById('question-text').textContent = q.text;

  const passageContainer = document.getElementById('passage-container');
  const passageText = document.getElementById('passage-text');
  if (q.passage) {
    if (passageText.textContent !== q.passage) {
      passageText.textContent = q.passage;
      passageContainer.scrollTop = 0; // Reset scroll only on new passage
    }
    passageContainer.style.display = 'block';
  } else {
    passageContainer.style.display = 'none';
    passageText.textContent = '';
  }

  const imgEl = document.getElementById('question-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  // Render LaTeX if available
  if (window.renderMathInElement) {
    renderMathInElement(document.getElementById('question-text'), {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '\\[', right: '\\]', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\(', right: '\\)', display: false}
      ],
      throwOnError: false
    });
  }

  const btnMark = document.getElementById('btn-mark');
  if (state.markedForReview[sid].includes(qid)) {
    btnMark.textContent = 'Unmark Review';
    btnMark.classList.add('btn-pressed');
  } else {
    btnMark.textContent = 'Mark for Review';
    btnMark.classList.remove('btn-pressed');
  }
  
  const btnPrev = document.getElementById('btn-prev');
  if (btnPrev) {
    if (state.currentQuestionIndex === 0) {
      btnPrev.style.display = 'none';
    } else {
      btnPrev.style.display = 'inline-block';
    }
  }

  renderOptions(q, sid);
  renderPalette();
  updateAnalysis();
}

function renderOptions(q, sid) {
  const list = document.getElementById('options-list');
  const savedIdx = state.answers[sid][q.id];
  const selectedIdx = isAnalysisMode ? savedIdx : currentTempOption;

  // Temporary selected answer logic for the current view (Testbook usually saves when you click Save & Next)
  // We will auto-save on select for simplicity, but visually distinct.
  
  list.innerHTML = q.options.map((opt, i) => {
    const isSelected = selectedIdx === i;
    const isCorrectAnswer = q.answer === i;
    
    let extraClass = isSelected ? 'tb-selected' : '';
    let clickAttr = `onclick="selectAnswer(${i})" style="cursor:pointer"`;
    let labelHtml = '';
    
    if (isAnalysisMode) {
      clickAttr = ''; // Disable clicking
      const isHidden = sessionStorage.getItem('qm_hide_highlights') === 'true';

      if (isHidden) {
        extraClass = ''; // Remove selected class so it looks fresh
      } else {
        if (isCorrectAnswer) {
          extraClass += ' opt-correct';
          // If skipped, put the dot on the correct answer
          if (selectedIdx === null || selectedIdx === undefined) {
            extraClass += ' tb-selected';
          }
        }
        if (isSelected && !isCorrectAnswer) {
          extraClass += ' opt-wrong';
        }
        
        if (isSelected) {
          const lblClass = isCorrectAnswer ? 'correct-lbl' : 'wrong-lbl';
          labelHtml = `<span class="your-ans-lbl ${lblClass}">Your Answer</span>`;
        }
      }
    }

    return `
      <div class="tb-opt ${extraClass}">
        <div class="tb-opt-radio-col" ${clickAttr} style="cursor:pointer;">
          <div class="tb-opt-radio"></div>
        </div>
        <div class="tb-opt-text" id="opt-txt-${i}">${opt}</div>
        ${labelHtml ? `<div style="padding: 12px 16px; display:flex; align-items:center;">${labelHtml}</div>` : ''}
      </div>
    `;
  }).join('');

  if (window.renderMathInElement) {
    q.options.forEach((_, i) => {
      renderMathInElement(document.getElementById(`opt-txt-${i}`), {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\(', right: '\\)', display: false}
        ],
        throwOnError: false
      });
    });
  }
}

function selectAnswer(optionIndex) {
  if (currentTempOption === optionIndex) {
    currentTempOption = null; // Deselect if already selected
  } else {
    currentTempOption = optionIndex;
  }
  
  const sec = curSection();
  const q   = curQuestion();
  renderOptions(q, sec.id);
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function saveAndNext() {
  const sec = curSection();
  const q   = curQuestion();
  const sid = sec.id;
  const qid = q.id;
  
  if (isAnalysisMode) {
    const filterEl = document.getElementById('palette-filter');
    const filterVal = filterEl ? filterEl.value : 'all';
    
    let nextIdx = -1;
    for (let i = state.currentQuestionIndex + 1; i < sec.questions.length; i++) {
      if (filterVal === 'all') {
        nextIdx = i;
        break;
      }
      
      const checkQ = sec.questions[i];
      const answered = state.answers[sid][checkQ.id] !== null && state.answers[sid][checkQ.id] !== undefined;
      let statusForFilter = 'skipped';
      if (answered) {
        statusForFilter = (state.answers[sid][checkQ.id] === checkQ.answer) ? 'correct' : 'wrong';
      }
      if (statusForFilter === filterVal) {
        nextIdx = i;
        break;
      }
    }
    
    if (nextIdx !== -1) {
      state.currentQuestionIndex = nextIdx;
      save();
      renderQuestion();
      renderPalette();
    }
    return;
  }
  
  // Save temporary selection for test mode
  if (currentTempOption !== null) {
    state.answers[sid][qid] = currentTempOption;
  } else {
    state.answers[sid][qid] = null;
  }
  
  if (state.currentQuestionIndex < sec.questions.length - 1) {
    state.currentQuestionIndex++;
    save();
    renderQuestion();
  } else {
    save(); // End of section
    const isLastSec = state.currentSectionIndex === state.testData.sections.length - 1;
    openSubmitModal(isLastSec);
  }
}

function markAndNext() {
  const sec = curSection();
  const q   = curQuestion();
  const sid = sec.id;
  const qid = q.id;

  // Save temporary selection
  if (currentTempOption !== null) {
    state.answers[sid][qid] = currentTempOption;
  } else {
    state.answers[sid][qid] = null;
  }

  if (state.markedForReview[sid].includes(qid)) {
    // Unmark and stay
    state.markedForReview[sid] = state.markedForReview[sid].filter(id => id !== qid);
  } else {
    // Mark and stay
    state.markedForReview[sid].push(qid);
  }
  save();
  renderQuestion();
  renderPalette();
  updateAnalysis();
}

function jumpToQuestion(index) {
  if (index < 0 || index >= curSection().questions.length) return;
  
  // NOTE: We DO NOT save currentTempOption here. 
  // Navigating away without clicking Save & Next discards the temporary selection.
  
  state.currentQuestionIndex = index;
  save();
  renderQuestion();
  renderPalette();
  updateAnalysis();
}

// ─── Palette & Analysis ───────────────────────────────────────────────────────
function renderPalette() {
  const sec = curSection();
  const sid = sec.id;
  const grid = document.getElementById('palette-grid');
  
  const secName = sec.name || state.testData.title || 'Test';
  document.getElementById('sidebar-section-label').textContent = secName;

  const filterEl = document.getElementById('palette-filter');
  const filterVal = filterEl ? filterEl.value : 'all';
  let totalAns = 0;
  
  grid.innerHTML = sec.questions.map((q, i) => {
    const qid = q.id;
    const answered = state.answers[sid][qid] !== null && state.answers[sid][qid] !== undefined;
    const marked   = state.markedForReview[sid].includes(qid);
    const visited  = state.visitedQuestions[sid].includes(qid);
    const isActive = i === state.currentQuestionIndex;

    if (answered) totalAns++;

    let cls = 'st-not-visited';
    let statusForFilter = 'all';

    if (isAnalysisMode) {
      if (!answered) {
        cls = 'pal-skipped';
        statusForFilter = 'skipped';
      } else if (state.answers[sid][qid] === q.answer) {
        cls = 'pal-correct';
        statusForFilter = 'correct';
      } else {
        cls = 'pal-wrong';
        statusForFilter = 'wrong';
      }
    } else {
      if (visited && !answered && !marked) cls = 'st-not-answered';
      if (answered && !marked)             cls = 'st-answered';
      if (!answered && marked)             cls = 'st-marked';
      if (answered && marked)              cls = 'st-answered-marked';
      if (!visited)                        cls = 'st-not-visited';
    }

    if (isAnalysisMode && filterVal !== 'all' && statusForFilter !== filterVal) {
      return `<button class="tb-pal-num ${cls}" style="display:none" onclick="jumpToQuestion(${i})">${i + 1}</button>`;
    }

    return `<button class="tb-pal-num ${cls}" onclick="jumpToQuestion(${i})">${i + 1}</button>`;
  }).join('');
}

function updateAnalysis() {
  const sec = curSection();
  const sid = sec.id;
  let ans = 0, notAns = 0, mark = 0, notVis = 0;
  let totalTestAns = 0;

  // Global total
  state.testData.sections.forEach(s => {
    Object.values(state.answers[s.id]).forEach(val => {
      if (val !== null && val !== undefined) totalTestAns++;
    });
  });
  document.getElementById('tb-total-ans-val').textContent = totalTestAns;

  // Section analysis
  sec.questions.forEach(q => {
    const qid = q.id;
    const answered = state.answers[sid][qid] !== null && state.answers[sid][qid] !== undefined;
    const marked   = state.markedForReview[sid].includes(qid);
    const visited  = state.visitedQuestions[sid].includes(qid);

    if (answered) ans++;
    else if (visited) notAns++;
    else notVis++;
    
    if (marked) mark++;
  });

  const partName = state.testData.sections.length > 1 
    ? `PART-${String.fromCharCode(65 + state.currentSectionIndex)} Analysis` 
    : `Test Analysis`;
  
  document.getElementById('analysis-hdr-title').textContent = partName;
  document.getElementById('an-ans').textContent = ans;
  // Testbook groups 'Not Answered' as Visited but not answered. 
  // Let's include not visited into not answered for simplicity or separate them?
  // Actually Testbook shows 'Not Answered' as total remaining unanswered visited? 
  // Let's just show total unattempted as Not Answered.
  document.getElementById('an-notans').textContent = (sec.questions.length - ans);
  document.getElementById('an-mark').textContent = mark;
}

// ─── Side Panels ─────────────────────────────────────────────────────────────
function setupPanels() {
  const overlay = document.getElementById('panel-overlay');
  const panel = document.getElementById('side-panel');
  const title = document.getElementById('panel-title');
  const content = document.getElementById('panel-content');

  function open(t, c) {
    title.textContent = t;
    content.innerHTML = c;
    overlay.classList.add('open');
    panel.classList.add('open');
  }

  function close() {
    overlay.classList.remove('open');
    panel.classList.remove('open');
  }

  document.getElementById('btn-symbols').addEventListener('click', () => {
    open('Symbols', `
      <div class="sym-grid">
        <div class="sym-cell st-not-visited" style="color:white; font-size:0.7rem; font-weight:bold;">1</div>
        <div style="grid-column: 2/6; display:flex; align-items:center;">Not Visited</div>
        
        <div class="sym-cell st-not-answered" style="color:white; font-size:0.7rem; font-weight:bold;">2</div>
        <div style="grid-column: 2/6; display:flex; align-items:center;">Not Answered</div>
        
        <div class="sym-cell st-answered" style="color:white; font-size:0.7rem; font-weight:bold;">3</div>
        <div style="grid-column: 2/6; display:flex; align-items:center;">Answered</div>
        
        <div class="sym-cell st-marked" style="color:white; font-size:0.7rem; font-weight:bold;">4</div>
        <div style="grid-column: 2/6; display:flex; align-items:center;">Marked for Review</div>
        
        <div class="sym-cell st-answered-marked" style="color:white; font-size:0.7rem; font-weight:bold;">5</div>
        <div style="grid-column: 2/6; display:flex; align-items:center;">Answered & Marked for Review</div>
      </div>
    `);
  });

  document.getElementById('btn-instructions').addEventListener('click', () => {
    open('Instructions', '<p>General instructions for the exam...</p><ul><li>Do not refresh the page.</li><li>Use Save & Next to save your answer.</li><li>Click Submit Test when finished.</li></ul>');
  });

  document.getElementById('btn-summary').addEventListener('click', () => {
    let rows = state.testData.sections.map(s => {
      let ans=0, notAns=0, mark=0;
      s.questions.forEach(q => {
        if(state.answers[s.id][q.id] !== null && state.answers[s.id][q.id] !== undefined) ans++;
        else notAns++;
        if(state.markedForReview[s.id].includes(q.id)) mark++;
      });
      return `<tr><td>${s.name}</td><td>${ans}</td><td>${notAns}</td><td>${mark}</td></tr>`;
    }).join('');

    open('Overall Test Summary', `
      <table class="tb-summary-tbl">
        <tr><th>Section Name</th><th>Answered</th><th>Not Answered</th><th>Marked</th></tr>
        ${rows}
      </table>
    `);
  });

  document.getElementById('btn-close-panel').addEventListener('click', close);
  overlay.addEventListener('click', close);
}

// ─── Submit ──────────────────────────────────────────────────────────────────
let submitIsFullTest = false;
function openSubmitModal(isFull) {
  submitIsFullTest = isFull;
  
  const tbody = document.querySelector('#submit-summary-table tbody');
  let html = '';
  
  // Show either current section or all sections based on isFull/test type? 
  // Let's show all sections to be safe and informative.
  state.testData.sections.forEach(s => {
    let ans = 0, notAns = 0, mark = 0, notVis = 0;
    const sid = s.id;
    
    s.questions.forEach(q => {
      const qid = q.id;
      const answered = state.answers[sid][qid] !== null && state.answers[sid][qid] !== undefined;
      const marked = state.markedForReview[sid].includes(qid);
      const visited = state.visitedQuestions[sid].includes(qid);
      
      if (marked) {
        mark++;
      } else if (answered) {
        ans++;
      } else if (visited) {
        notAns++;
      } else {
        notVis++;
      }
    });
    
    html += `
      <tr style="border-bottom: 1px solid #e0e0e0;">
        <td style="padding: 12px; border: 1px solid #e0e0e0;">${s.name}</td>
        <td style="padding: 12px; border: 1px solid #e0e0e0;">${s.questions.length}</td>
        <td style="padding: 12px; border: 1px solid #e0e0e0;">${ans}</td>
        <td style="padding: 12px; border: 1px solid #e0e0e0;">${notAns}</td>
        <td style="padding: 12px; border: 1px solid #e0e0e0;">${mark}</td>
        <td style="padding: 12px; border: 1px solid #e0e0e0;">${notVis}</td>
      </tr>
    `;
  });
  
  if (tbody) tbody.innerHTML = html;
  
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}
function confirmSubmit() {
  closeModal();
  if (submitIsFullTest) {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    state.testData.sections.forEach(s => state.sectionSubmitted[s.id] = true);
    state.testCompleted = true;
    save();
    window.location.href = 'result.html';
  } else {
    const sec = curSection();
    state.sectionSubmitted[sec.id] = true;
    const nextIndex = state.currentSectionIndex + 1;
    if (nextIndex < state.testData.sections.length) {
      enterSection(nextIndex, true);
    }
  }
}

function doSubmitSection() {
  if (state.testType === 'full') {
    // Auto-submit all
    confirmSubmit(true);
  } else {
    state.sectionSubmitted[curSection().id] = true;
    state.testCompleted = true;
    save();
    window.location.href = 'result.html';
  }
}
