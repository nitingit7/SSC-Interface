/**
 * state.js — Shared state management via sessionStorage
 * All exam state is read/written here to persist across page navigations.
 */

const STATE_KEY = 'quickmock_state';

const State = {
  /** Read current state object from sessionStorage */
  get() {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('State.get error:', e);
      return null;
    }
  },

  /** Write (overwrite) full state to sessionStorage */
  set(state) {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('State.set error:', e);
    }
  },

  /** Clear state (used on home/re-attempt reset) */
  clear() {
    sessionStorage.removeItem(STATE_KEY);
  },

  /**
   * Initialize a fresh state object from a loaded testData JSON.
   * Creates empty answer maps, review lists, and timer maps for every section.
   */
  initFromTest(testData) {
    const answers = {};
    const markedForReview = {};
    const visitedQuestions = {};
    const sectionSubmitted = {};
    const sectionStartTime = {};

    testData.sections.forEach(section => {
      answers[section.id] = {};
      markedForReview[section.id] = [];
      visitedQuestions[section.id] = [];
      sectionSubmitted[section.id] = false;
      sectionStartTime[section.id] = null; // Set when section is first entered

      section.questions.forEach(q => {
        answers[section.id][q.id] = null; // null = unattempted
      });
    });

    const state = {
      testData,
      testType: testData.test_type,          // 'full' | 'sectional'
      currentSectionIndex: 0,
      currentQuestionIndex: 0,
      answers,                               // { sectionId: { questionId: optionIndex | null } }
      markedForReview,                       // { sectionId: [questionId, ...] }
      visitedQuestions,                      // { sectionId: [questionId, ...] }
      sectionSubmitted,                      // { sectionId: boolean }
      sectionStartTime,                      // { sectionId: timestamp | null }
      testCompleted: false,
    };

    this.set(state);
    return state;
  },
};
