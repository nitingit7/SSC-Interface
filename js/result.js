/**
 * result.js — Result screen logic
 * Handles: score calculation, section breakdown, question review,
 * solution toggles, re-attempt, and home navigation.
 */

// ─── State ──────────────────────────────────────────────────────────────────
let state = null;

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

function init() {
  state = State.get();
  if (!state || !state.testData) {
    window.location.href = 'index.html';
    return;
  }

  // Prevent back button from returning to the exam
  window.history.pushState(null, null, window.location.href);
  window.onpopstate = function () {
    window.location.href = 'index.html';
  };

  applyTheme();
  setupThemeToggle();

  const results = calculateResults();

  renderResultHero();
  renderScoreCard(results);
  renderBreakdownTable(results);
  renderQuestionReview(results);
}

// ─── Theme ──────────────────────────────────────────────────────────────────
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
    const cur = document.documentElement.getAttribute('data-theme');
    const nxt = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nxt);
    localStorage.setItem('qm_theme', nxt);
    btn.textContent = nxt === 'dark' ? '☀️' : '🌙';
  });
}

// ─── Score Calculation ───────────────────────────────────────────────────────
function calculateResults() {
  const { testData, answers, markedForReview } = state;
  const marking = testData.marking;

  let totalCorrect = 0, totalWrong = 0, totalUnattempted = 0, totalScore = 0;
  const sectionResults = [];

  testData.sections.forEach(section => {
    let secCorrect = 0, secWrong = 0, secUnattempted = 0, secScore = 0;

    section.questions.forEach(q => {
      const userAns = answers[section.id]?.[q.id];
      if (userAns === null || userAns === undefined) {
        secUnattempted++;
        secScore += (marking.unattempted || 0);
      } else if (userAns === q.answer) {
        secCorrect++;
        secScore += marking.correct;
      } else {
        secWrong++;
        secScore += marking.wrong;
      }
    });

    totalCorrect    += secCorrect;
    totalWrong      += secWrong;
    totalUnattempted += secUnattempted;
    totalScore      += secScore;

    sectionResults.push({
      id: section.id,
      name: section.name,
      questions: section.questions,
      correct: secCorrect,
      wrong: secWrong,
      unattempted: secUnattempted,
      score: secScore,
      totalQ: section.questions.length,
    });
  });

  const totalQ       = testData.sections.reduce((s, sec) => s + sec.questions.length, 0);
  const maxScore     = totalQ * marking.correct;
  const accuracy     = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const percentage   = maxScore > 0 ? Math.max(0, Math.round((totalScore / maxScore) * 100)) : 0;

  return {
    totalCorrect, totalWrong, totalUnattempted,
    totalScore, maxScore, totalQ, accuracy, percentage,
    sectionResults,
  };
}

// ─── Result Hero ─────────────────────────────────────────────────────────────
function renderResultHero() {
  const nameEl = document.getElementById('result-test-name');
  if (nameEl) nameEl.textContent = state.testData.title;

  const metaEl = document.getElementById('result-test-meta');
  if (metaEl) {
    const totalQ = state.testData.sections.reduce((s, sec) => s + sec.questions.length, 0);
    const totalTime = state.testData.sections.reduce((s, sec) => s + sec.time_minutes, 0);
    metaEl.textContent = `${state.testData.sections.length} Section${state.testData.sections.length > 1 ? 's' : ''} · ${totalQ} Questions · ${totalTime} Minutes`;
  }
}

// ─── Score Card ───────────────────────────────────────────────────────────────
function renderScoreCard(results) {
  const { totalScore, maxScore, totalCorrect, totalWrong, totalUnattempted, accuracy, percentage } = results;

  // Dial
  const dial = document.getElementById('score-dial');
  if (dial) {
    // Animate after a tick
    setTimeout(() => {
      dial.style.setProperty('--pct', Math.max(0, percentage));
    }, 100);
  }

  const el = id => document.getElementById(id);
  if (el('score-number-big')) el('score-number-big').textContent = totalScore % 1 === 0 ? totalScore : totalScore.toFixed(2);
  if (el('score-out-of'))     el('score-out-of').textContent     = `/ ${maxScore}`;
  if (el('stat-correct-val'))      el('stat-correct-val').textContent      = totalCorrect;
  if (el('stat-wrong-val'))        el('stat-wrong-val').textContent        = totalWrong;
  if (el('stat-unattempted-val'))  el('stat-unattempted-val').textContent  = totalUnattempted;
  if (el('stat-accuracy-val'))     el('stat-accuracy-val').textContent     = accuracy + '%';
}

// ─── Section Breakdown Table ──────────────────────────────────────────────────
function renderBreakdownTable(results) {
  const tbody = document.getElementById('breakdown-tbody');
  if (!tbody) return;

  tbody.innerHTML = results.sectionResults.map(sec => {
    const clr = sec.score >= 0 ? 'var(--success)' : 'var(--danger)';
    return `
      <tr>
        <td><strong>${sec.name}</strong></td>
        <td style="text-align:center">${sec.totalQ}</td>
        <td style="text-align:center; color:var(--success); font-weight:700">${sec.correct}</td>
        <td style="text-align:center; color:var(--danger);  font-weight:700">${sec.wrong}</td>
        <td style="text-align:center; color:var(--text-3)">${sec.unattempted}</td>
        <td style="text-align:center; font-weight:800; color:${clr}">${sec.score % 1 === 0 ? sec.score : sec.score.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

// ─── Question Review ──────────────────────────────────────────────────────────
function renderQuestionReview(results) {
  const container = document.getElementById('question-review-container');
  if (!container) return;

  const labels = ['A', 'B', 'C', 'D', 'E'];

  let html = '';

  results.sectionResults.forEach(sec => {
    html += `
      <div class="review-section-group">
        <div class="review-section-header">
          <span>${sec.name}</span>
          <span>${sec.questions.length} Questions</span>
        </div>
    `;

    sec.questions.forEach((q, qi) => {
      const userAns   = state.answers[sec.id]?.[q.id];
      const isAttempted = userAns !== null && userAns !== undefined;
      const isCorrect   = isAttempted && userAns === q.answer;
      const isWrong     = isAttempted && !isCorrect;
      const isMarked    = (state.markedForReview[sec.id] || []).includes(q.id);

      let badgeClass, badgeIcon, badgeText;
      if (!isAttempted) {
        badgeClass = 'unattempted'; badgeIcon = '—'; badgeText = 'Unattempted';
      } else if (isCorrect) {
        badgeClass = 'correct'; badgeIcon = '✓'; badgeText = 'Correct';
      } else {
        badgeClass = 'wrong'; badgeIcon = '✗'; badgeText = 'Wrong';
      }

      // Options HTML
      const optionsHtml = q.options.map((opt, oi) => {
        const isCorrectOpt = oi === q.answer;
        const isUserWrong  = oi === userAns && !isCorrect;
        let cls = 'option-item review-default';
        if (isCorrectOpt)  cls = 'option-item review-correct';
        if (isUserWrong)   cls = 'option-item review-wrong';

        const tag = isCorrectOpt
          ? `<span class="opt-answer-tag correct">✓ Correct Answer</span>`
          : isUserWrong
            ? `<span class="opt-answer-tag wrong">✗ Your Answer</span>`
            : '';

        return `
          <div class="${cls}">
            <span class="opt-label">${labels[oi]}</span>
            <span class="opt-text">${opt}</span>
            ${tag}
          </div>
        `;
      }).join('');

      html += `
        <div class="review-q-card">
          <div class="review-q-header">
            <span class="review-q-num">Q${qi + 1}</span>
            <span class="status-badge ${badgeClass}">${badgeIcon} ${badgeText}</span>
            ${isMarked ? `<span style="font-size:0.73rem; color:var(--q-marked)">🔖 Marked</span>` : ''}
          </div>

          <p class="review-q-text">${q.text}</p>

          <div class="options-list">${optionsHtml}</div>
        </div>
      `;
    });

    html += `</div>`;
  });

  container.innerHTML = html;

  if (window.renderMathInElement) {
    renderMathInElement(container, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '\\[', right: '\\]', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\(', right: '\\)', display: false}
      ],
      throwOnError: false
    });
  }
}

// ─── Analyse Solution ─────────────────────────────────────────────────────────
function analyseSolution() {
  state.currentSectionIndex = 0;
  state.currentQuestionIndex = 0;
  State.set(state);
  
  sessionStorage.setItem('qm_analysis_mode', 'true');
  window.location.href = 'exam.html';
}

// ─── Re-Attempt ───────────────────────────────────────────────────────────────
function reAttempt() {
  const confirmed = confirm(
    'Start a fresh re-attempt?\n\nAll your answers will be cleared and the timer will reset.'
  );
  if (!confirmed) return;

  sessionStorage.removeItem('qm_analysis_mode');
  // Re-init from same testData
  State.initFromTest(state.testData);
  window.location.href = 'exam.html';
}

// ─── Go Home ──────────────────────────────────────────────────────────────────
function goHome() {
  sessionStorage.removeItem('qm_analysis_mode');
  State.clear();
  window.location.href = 'index.html';
}
