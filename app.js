/* =====================================================
   PharmaRecipe Trainer — app.js
   Full SPA logic: Flashcards, Quiz, Matching, Write,
   Exam, Browse, Dashboard, Stats, Theme, PDF export
   ===================================================== */

'use strict';

// ─── STATE ───────────────────────────────────────────
const STATE = {
  known: new Set(),   // IDs marked as known
  repeat: new Set(),  // IDs marked for repeat
  theme: 'dark',

  // Flashcard state
  fc: {
    deck: [],
    index: 0,
    flipped: false,
    sessionKnown: 0,
    sessionRepeat: 0,
  },

  // Quiz state
  quiz: {
    questions: [],
    index: 0,
    correct: 0,
    wrong: 0,
    answers: [],  // { question, correct, chosen }
  },

  // Exam state
  exam: {
    questions: [],
    index: 0,
    correct: 0,
    wrong: 0,
    answers: [],
    timerInterval: null,
    secondsLeft: 0,
  },

  // Matching state
  match: {
    pairs: [],
    selectedLeft: null,
    selectedRight: null,
    matched: new Set(),
    errors: 0,
    timerInterval: null,
    elapsed: 0,
  },

  // Write state
  write: {
    recipe: null,
    hintShown: false,
  },

  // Modal
  modal: {
    recipeId: null,
  },
};

// ─── HELPERS ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function pct(a, b) { return b === 0 ? 0 : Math.round((a / b) * 100); }

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Populate category <select> with "Все категории" + sorted unique cats
function populateCategorySelect(el, includeAll = true) {
  el.innerHTML = '';
  if (includeAll) {
    const opt = document.createElement('option');
    opt.value = 'all';
    opt.textContent = 'Все категории';
    el.appendChild(opt);
  }
  CATEGORIES.forEach(cat => {
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;
    el.appendChild(o);
  });
}

function getFilteredRecipes(category) {
  if (category === 'all') return [...RECIPES];
  return RECIPES.filter(r => r.category === category);
}

// ─── PERSISTENCE ─────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem('pharma_known',  JSON.stringify([...STATE.known]));
    localStorage.setItem('pharma_repeat', JSON.stringify([...STATE.repeat]));
    localStorage.setItem('pharma_theme',  STATE.theme);
  } catch (e) { /* storage not available */ }
}

function loadState() {
  try {
    const k = localStorage.getItem('pharma_known');
    const r = localStorage.getItem('pharma_repeat');
    const t = localStorage.getItem('pharma_theme');
    if (k) STATE.known  = new Set(JSON.parse(k));
    if (r) STATE.repeat = new Set(JSON.parse(r));
    if (t) STATE.theme = t;
  } catch (e) { /* ignore */ }
}

// ─── THEME ───────────────────────────────────────────
function applyTheme(theme) {
  STATE.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const icon = theme === 'dark' ? '☀️' : '🌙';
  $('theme-icon').textContent  = icon;
  $('theme-icon-m').textContent = icon;
  saveState();
}

function toggleTheme() {
  applyTheme(STATE.theme === 'dark' ? 'light' : 'dark');
}

// ─── NAVIGATION ──────────────────────────────────────
function showView(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const v = $('view-' + name);
  if (v) v.classList.add('active');
  const btn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (btn) btn.classList.add('active');

  // Close sidebar on mobile
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('show');

  // Init view-specific logic
  if (name === 'flashcards')  initFlashcards();
  if (name === 'quiz')        initQuizSetup();
  if (name === 'matching')    initMatchingSetup();
  if (name === 'write')       initWrite();
  if (name === 'browse')      initBrowse();
  if (name === 'exam')        initExamSetup();
  if (name === 'dashboard')   updateDashboard();
}

// ─── DASHBOARD ───────────────────────────────────────
function updateDashboard() {
  const total = RECIPES.length;
  const known = STATE.known.size;
  const repeat = STATE.repeat.size;
  const unseen = total - known - repeat + [...STATE.repeat].filter(id => STATE.known.has(id)).length;
  const cleanUnseen = Math.max(0, total - known - STATE.repeat.size + (STATE.repeat.size > 0 ? 0 : 0));
  // Clean calculation
  const knownOnly = [...STATE.known].filter(id => !STATE.repeat.has(id)).length;
  const repeatOnly = STATE.repeat.size;
  const seenTotal = STATE.known.size + STATE.repeat.size - [...STATE.known].filter(id => STATE.repeat.has(id)).length;
  const unseenCount = total - seenTotal;

  $('stat-known').textContent   = STATE.known.size;
  $('stat-repeat').textContent  = STATE.repeat.size;
  $('stat-unseen').textContent  = Math.max(0, unseenCount);
  const p = pct(STATE.known.size, total);
  $('stat-pct').textContent     = p + '%';
  $('main-progress').style.width = p + '%';
  $('mini-known').textContent   = STATE.known.size;

  // Weak panel
  if (STATE.repeat.size > 0) {
    $('weak-panel').style.display = 'block';
    const chips = $('weak-list');
    chips.innerHTML = '';
    [...STATE.repeat].slice(0, 20).forEach(id => {
      const r = RECIPES.find(x => x.id === id);
      if (!r) return;
      const chip = document.createElement('div');
      chip.className = 'weak-chip';
      chip.textContent = r.drug.split(' ')[0];
      chip.title = r.drug;
      chip.onclick = () => openModal(id);
      chips.appendChild(chip);
    });
    if (STATE.repeat.size > 20) {
      const more = document.createElement('div');
      more.className = 'weak-chip';
      more.textContent = `+${STATE.repeat.size - 20} ещё`;
      chips.appendChild(more);
    }
  } else {
    $('weak-panel').style.display = 'none';
  }
}

// ─── FLASHCARDS ──────────────────────────────────────
function initFlashcards() {
  populateCategorySelect($('fc-category'));
  $('fc-done').style.display = 'none';
  $('fc-card').style.display = '';
  $('fc-actions').style.display = '';
  buildFCDeck();
}

function buildFCDeck() {
  const cat = $('fc-category').value;
  const randomOrder = $('fc-random').checked;
  const weakOnly = $('fc-weak-only').checked;

  let pool = getFilteredRecipes(cat);
  if (weakOnly && STATE.repeat.size > 0) {
    pool = pool.filter(r => STATE.repeat.has(r.id));
  }
  if (pool.length === 0) pool = getFilteredRecipes(cat);

  STATE.fc.deck = randomOrder ? shuffle(pool) : [...pool];
  STATE.fc.index = 0;
  STATE.fc.sessionKnown = 0;
  STATE.fc.sessionRepeat = 0;
  STATE.fc.flipped = false;

  renderFC();
}

function renderFC() {
  const deck = STATE.fc.deck;
  const i = STATE.fc.index;

  if (i >= deck.length) {
    showFCDone();
    return;
  }

  const r = deck[i];
  $('fc-front-text').textContent = r.indication;
  $('fc-category-badge').textContent = r.category;
  $('fc-drug-name').textContent = r.drug;
  $('fc-recipe').textContent = r.recipe.trim();
  $('fc-note').textContent = r.note;

  // Reset flip
  STATE.fc.flipped = false;
  $('fc-inner').classList.remove('flipped');
  $('fc-result-actions').style.display = 'none';
  $('fc-show-btn').style.display = '';

  // Counter
  $('fc-counter').textContent = `${i + 1} / ${deck.length}`;
  const fillPct = ((i) / deck.length) * 100;
  $('fc-mini-fill').style.width = fillPct + '%';
}

function flipFC() {
  if (STATE.fc.flipped) return;
  STATE.fc.flipped = true;
  $('fc-inner').classList.add('flipped');
  $('fc-show-btn').style.display = 'none';
  $('fc-result-actions').style.display = 'flex';
}

function fcMarkKnown() {
  const r = STATE.fc.deck[STATE.fc.index];
  STATE.known.add(r.id);
  STATE.repeat.delete(r.id);
  STATE.fc.sessionKnown++;
  saveState();
  updateDashboard();
  STATE.fc.index++;
  renderFC();
}

function fcMarkRepeat() {
  const r = STATE.fc.deck[STATE.fc.index];
  STATE.repeat.add(r.id);
  STATE.fc.sessionRepeat++;
  saveState();
  updateDashboard();
  STATE.fc.index++;
  renderFC();
}

function showFCDone() {
  $('fc-card').style.display = 'none';
  $('fc-actions').style.display = 'none';
  $('fc-result-actions').style.display = 'none';
  $('fc-nav-row').style.display = 'none';
  $('fc-done').style.display = 'block';
  const k = STATE.fc.sessionKnown;
  const rep = STATE.fc.sessionRepeat;
  const tot = STATE.fc.deck.length;
  $('fc-done-stats').textContent =
    `Знаю: ${k} · Повторить: ${rep} · Всего: ${tot}`;
}

// ─── QUIZ ─────────────────────────────────────────────
// Question types:
// 1. indication → correct drug (4 options)
// 2. drug → correct recipe (4 options)
// 3. drug → correct route/dose (4 options)
// 4. NOT: which drug is NOT for this indication (reverse)
// 5. indication → correct latin name
const QUIZ_TYPES = [
  'indication_to_drug',
  'drug_to_recipe',
  'drug_to_route',
  'not_for_indication',
  'indication_to_latin',
];

function generateQuizQuestion(targetRecipe, allRecipes) {
  const type = QUIZ_TYPES[Math.floor(Math.random() * QUIZ_TYPES.length)];
  const distractors = shuffle(allRecipes.filter(r => r.id !== targetRecipe.id)).slice(0, 4);

  switch (type) {
    case 'indication_to_drug': {
      const opts = shuffle([targetRecipe, ...distractors.slice(0, 3)]);
      return {
        type,
        typeName: 'Показание → Препарат',
        question: `При следующем показании:\n«${targetRecipe.indication}»\nкакой препарат назначают?`,
        options: opts.map(r => r.drug),
        correctIndex: opts.findIndex(r => r.id === targetRecipe.id),
        explanation: `✓ Правильно: ${targetRecipe.drug}\n${targetRecipe.note}`,
        recipeId: targetRecipe.id,
      };
    }

    case 'drug_to_recipe': {
      // Pick 3 distractors with similar-looking recipes
      const sameCat = shuffle(allRecipes.filter(r => r.id !== targetRecipe.id && r.category === targetRecipe.category));
      const distFill = [...sameCat, ...distractors].slice(0, 3);
      const opts = shuffle([targetRecipe, ...distFill]);
      return {
        type,
        typeName: 'Препарат → Рецепт',
        question: `Какой из рецептов соответствует препарату:\n«${targetRecipe.drug}»?`,
        options: opts.map(r => r.recipe.trim().split('\n')[0]),  // Show first line
        correctIndex: opts.findIndex(r => r.id === targetRecipe.id),
        explanation: `✓ Полный рецепт:\n${targetRecipe.recipe.trim()}`,
        recipeId: targetRecipe.id,
      };
    }

    case 'drug_to_route': {
      // Confuse routes with same-category drugs
      const routePool = shuffle(allRecipes.filter(r => r.id !== targetRecipe.id));
      const wrongRoutes = [...new Set(routePool.map(r => r.route))]
        .filter(rt => rt !== targetRecipe.route)
        .slice(0, 3);
      if (wrongRoutes.length < 3) {
        // Fallback to indication_to_drug
        return generateQuizQuestionType('indication_to_drug', targetRecipe, allRecipes);
      }
      const opts = shuffle([targetRecipe.route, ...wrongRoutes]);
      return {
        type,
        typeName: 'Путь введения',
        question: `Укажите правильный путь введения препарата «${targetRecipe.drug}» при:\n«${targetRecipe.indication}»`,
        options: opts,
        correctIndex: opts.indexOf(targetRecipe.route),
        explanation: `✓ Путь введения: ${targetRecipe.route}\n${targetRecipe.note}`,
        recipeId: targetRecipe.id,
      };
    }

    case 'not_for_indication': {
      // Pick 3 drugs that ARE for same-ish purpose, 1 that is clearly different
      const sameCatDrugs = shuffle(allRecipes.filter(r => r.id !== targetRecipe.id && r.category === targetRecipe.category));
      if (sameCatDrugs.length < 2) {
        return generateQuizQuestion(targetRecipe, allRecipes); // retry
      }
      const rightDecoys = sameCatDrugs.slice(0, 2);
      const wrongOne = shuffle(allRecipes.filter(r => r.category !== targetRecipe.category))[0];
      if (!wrongOne) return generateQuizQuestion(targetRecipe, allRecipes);
      const opts = shuffle([targetRecipe, ...rightDecoys, wrongOne]);
      return {
        type,
        typeName: 'Не применяют',
        question: `Какой препарат НЕ применяют при:\n«${targetRecipe.indication.toLowerCase()}»?`,
        options: opts.map(r => r.drug),
        correctIndex: opts.findIndex(r => r.id === wrongOne.id),
        explanation: `✓ Не применяют: ${wrongOne.drug} (категория: ${wrongOne.category})\nПравильные: ${targetRecipe.drug}, ${rightDecoys.map(r=>r.drug).join(', ')}`,
        recipeId: targetRecipe.id,
      };
    }

    case 'indication_to_latin': {
      const opts = shuffle([targetRecipe, ...distractors.slice(0, 3)]);
      return {
        type,
        typeName: 'Латинское название',
        question: `При показании «${targetRecipe.indication}» назначают препарат «${targetRecipe.drug}». Выберите правильное латинское название:`,
        options: opts.map(r => r.latinName),
        correctIndex: opts.findIndex(r => r.id === targetRecipe.id),
        explanation: `✓ Латинское: ${targetRecipe.latinName}`,
        recipeId: targetRecipe.id,
      };
    }

    default:
      return generateQuizQuestion(targetRecipe, allRecipes);
  }
}

// Fallback if a type needs forcing
function generateQuizQuestionType(type, targetRecipe, allRecipes) {
  const distractors = shuffle(allRecipes.filter(r => r.id !== targetRecipe.id)).slice(0, 4);
  const opts = shuffle([targetRecipe, ...distractors.slice(0, 3)]);
  return {
    type,
    typeName: 'Показание → Препарат',
    question: `При следующем показании:\n«${targetRecipe.indication}»\nкакой препарат назначают?`,
    options: opts.map(r => r.drug),
    correctIndex: opts.findIndex(r => r.id === targetRecipe.id),
    explanation: `✓ Правильно: ${targetRecipe.drug}\n${targetRecipe.note}`,
    recipeId: targetRecipe.id,
  };
}

function generateQuestions(pool, count) {
  const selected = shuffle(pool).slice(0, count);
  return selected.map(r => generateQuizQuestion(r, pool.length > 10 ? pool : RECIPES));
}

// ─── QUIZ SETUP ───────────────────────────────────────
function initQuizSetup() {
  populateCategorySelect($('quiz-category'));
  $('quiz-area').style.display = 'none';
  $('quiz-result').style.display = 'none';
}

function startQuiz() {
  const cat = $('quiz-category').value;
  const count = parseInt($('quiz-count').value);
  const pool = getFilteredRecipes(cat);
  const n = Math.min(count, pool.length);

  STATE.quiz.questions = generateQuestions(pool, n);
  STATE.quiz.index = 0;
  STATE.quiz.correct = 0;
  STATE.quiz.wrong = 0;
  STATE.quiz.answers = [];

  $('quiz-area').style.display = 'block';
  $('quiz-result').style.display = 'none';
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const q = STATE.quiz.questions[STATE.quiz.index];
  const total = STATE.quiz.questions.length;

  $('quiz-qnum').textContent = `Вопрос ${STATE.quiz.index + 1} / ${total}`;
  $('quiz-score-live').textContent = `✓ ${STATE.quiz.correct}  ✗ ${STATE.quiz.wrong}`;
  $('quiz-type-badge').textContent = q.typeName;
  $('quiz-question').textContent = q.question;
  $('quiz-feedback').style.display = 'none';
  $('quiz-next-btn').style.display = 'none';

  const optsEl = $('quiz-options');
  optsEl.innerHTML = '';
  const letters = ['А', 'Б', 'В', 'Г', 'Д'];

  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span>${escapeHtml(opt)}</span>`;
    btn.onclick = () => handleQuizAnswer(idx);
    optsEl.appendChild(btn);
  });
}

function handleQuizAnswer(chosen) {
  const q = STATE.quiz.questions[STATE.quiz.index];
  const isCorrect = chosen === q.correctIndex;

  // Disable all options
  $$('#quiz-options .quiz-option').forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === q.correctIndex) btn.classList.add('correct');
    else if (idx === chosen && !isCorrect) btn.classList.add('wrong');
  });

  if (isCorrect) {
    STATE.quiz.correct++;
    STATE.known.add(q.recipeId);
    STATE.repeat.delete(q.recipeId);
  } else {
    STATE.quiz.wrong++;
    STATE.repeat.add(q.recipeId);
  }
  saveState();

  STATE.quiz.answers.push({ q: q.question, correct: isCorrect, type: q.typeName });

  const fb = $('quiz-feedback');
  fb.style.display = 'block';
  fb.className = `quiz-feedback ${isCorrect ? 'correct-fb' : 'wrong-fb'}`;
  fb.textContent = (isCorrect ? '✓ Верно! ' : '✗ Ошибка! ') + q.explanation;

  $('quiz-next-btn').style.display = 'block';
}

function nextQuizQuestion() {
  STATE.quiz.index++;
  if (STATE.quiz.index >= STATE.quiz.questions.length) {
    showQuizResult();
  } else {
    renderQuizQuestion();
  }
}

function showQuizResult() {
  $('quiz-area').style.display = 'none';
  $('quiz-result').style.display = 'block';

  const correct = STATE.quiz.correct;
  const total = STATE.quiz.questions.length;
  const p = pct(correct, total);

  $('result-pct-text').textContent = p + '%';
  $('result-circle').style.borderColor = p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--warn)' : 'var(--danger)';

  const verdicts = [
    [90, '🏆 Отлично! Вы готовы к экзамену!'],
    [70, '✅ Хорошо! Повторите слабые рецепты.'],
    [50, '⚠️ Удовлетворительно. Нужно больше практики.'],
    [0,  '❌ Требуется серьёзная подготовка.'],
  ];
  const verdict = verdicts.find(([min]) => p >= min);
  $('result-verdict').textContent = verdict[1];
  $('result-details').textContent = `Правильных: ${correct} из ${total}`;

  // Breakdown
  const bd = $('result-breakdown');
  bd.innerHTML = '<div style="font-weight:600;margin-bottom:12px;font-size:13px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;">Разбор ответов</div>';
  STATE.quiz.answers.forEach((a, i) => {
    const item = document.createElement('div');
    item.className = 'breakdown-item';
    item.innerHTML = `
      <span class="bi-icon">${a.correct ? '✅' : '❌'}</span>
      <span class="bi-q">${i+1}. ${a.q.split('\n')[0].slice(0,80)}...</span>
    `;
    bd.appendChild(item);
  });

  updateDashboard();
}

// ─── EXAM ─────────────────────────────────────────────
function initExamSetup() {
  populateCategorySelect($('exam-category'));
  $('exam-area').style.display = 'none';
  $('exam-result').style.display = 'none';
  $('exam-setup').style.display = 'block';
}

function startExam() {
  const cat = $('exam-category').value;
  const count = parseInt($('exam-count').value);
  const minutes = parseInt($('exam-time').value);
  const pool = getFilteredRecipes(cat);
  const n = Math.min(count, pool.length);

  STATE.exam.questions = generateQuestions(pool, n);
  STATE.exam.index = 0;
  STATE.exam.correct = 0;
  STATE.exam.wrong = 0;
  STATE.exam.answers = [];
  STATE.exam.secondsLeft = minutes * 60;

  clearInterval(STATE.exam.timerInterval);
  STATE.exam.timerInterval = setInterval(examTick, 1000);

  $('exam-setup').style.display = 'none';
  $('exam-area').style.display = 'block';
  $('exam-result').style.display = 'none';
  renderExamQuestion();
}

function examTick() {
  STATE.exam.secondsLeft--;
  updateExamTimer();
  if (STATE.exam.secondsLeft <= 0) {
    clearInterval(STATE.exam.timerInterval);
    showExamResult();
  }
}

function updateExamTimer() {
  const s = STATE.exam.secondsLeft;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const timerEl = $('exam-timer');
  timerEl.textContent = `${m}:${String(sec).padStart(2, '0')}`;
  if (s <= 60) {
    timerEl.classList.add('danger');
  }
}

function renderExamQuestion() {
  const q = STATE.exam.questions[STATE.exam.index];
  const total = STATE.exam.questions.length;

  $('exam-qnum').textContent = `${STATE.exam.index + 1} / ${total}`;
  $('exam-score-live').textContent = `✓ ${STATE.exam.correct}  ✗ ${STATE.exam.wrong}`;
  $('exam-question').textContent = q.question;
  $('exam-feedback').style.display = 'none';
  $('exam-next-btn').style.display = 'none';

  const optsEl = $('exam-options');
  optsEl.innerHTML = '';
  const letters = ['А', 'Б', 'В', 'Г', 'Д'];

  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span>${escapeHtml(opt)}</span>`;
    btn.onclick = () => handleExamAnswer(idx);
    optsEl.appendChild(btn);
  });

  updateExamTimer();
}

function handleExamAnswer(chosen) {
  const q = STATE.exam.questions[STATE.exam.index];
  const isCorrect = chosen === q.correctIndex;

  $$('#exam-options .quiz-option').forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === q.correctIndex) btn.classList.add('correct');
    else if (idx === chosen && !isCorrect) btn.classList.add('wrong');
  });

  if (isCorrect) {
    STATE.exam.correct++;
    STATE.known.add(q.recipeId);
    STATE.repeat.delete(q.recipeId);
  } else {
    STATE.exam.wrong++;
    STATE.repeat.add(q.recipeId);
  }
  saveState();
  STATE.exam.answers.push({ q: q.question, correct: isCorrect });

  const fb = $('exam-feedback');
  fb.style.display = 'block';
  fb.className = `quiz-feedback ${isCorrect ? 'correct-fb' : 'wrong-fb'}`;
  fb.textContent = (isCorrect ? '✓ Верно! ' : '✗ Ошибка! ') + q.explanation;
  $('exam-next-btn').style.display = 'block';
}

function nextExamQuestion() {
  STATE.exam.index++;
  if (STATE.exam.index >= STATE.exam.questions.length) {
    clearInterval(STATE.exam.timerInterval);
    showExamResult();
  } else {
    renderExamQuestion();
  }
}

function showExamResult() {
  $('exam-area').style.display = 'none';
  $('exam-result').style.display = 'block';

  const correct = STATE.exam.correct;
  const total = STATE.exam.questions.length;
  const p = pct(correct, total);

  $('exam-result-pct').textContent = p + '%';
  $('exam-result-circle').style.borderColor = p >= 70 ? 'var(--success)' : p >= 50 ? 'var(--warn)' : 'var(--danger)';

  const verdicts = [
    [90, '🏆 Отлично! Экзамен сдан на отлично.'],
    [70, '✅ Хорошо. Экзамен засчитан.'],
    [50, '⚠️ Удовлетворительно. Возможна пересдача.'],
    [0,  '❌ Неудовлетворительно. Требуется дополнительная подготовка.'],
  ];
  const verdict = verdicts.find(([min]) => p >= min);
  $('exam-verdict').textContent = verdict[1];
  $('exam-details').textContent = `Правильных: ${correct} из ${total} · Оценка: ${p >= 90 ? 5 : p >= 70 ? 4 : p >= 50 ? 3 : 2}`;

  const bd = $('exam-breakdown');
  bd.innerHTML = '<div style="font-weight:600;margin-bottom:12px;font-size:13px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;">Разбор ответов</div>';
  STATE.exam.answers.forEach((a, i) => {
    const item = document.createElement('div');
    item.className = 'breakdown-item';
    item.innerHTML = `
      <span class="bi-icon">${a.correct ? '✅' : '❌'}</span>
      <span class="bi-q">${i+1}. ${a.q.split('\n')[0].slice(0,80)}...</span>
    `;
    bd.appendChild(item);
  });

  updateDashboard();
}

// ─── MATCHING ─────────────────────────────────────────
function initMatchingSetup() {
  populateCategorySelect($('match-category'));
  $('match-area').style.display = 'none';
  $('match-result').style.display = 'none';
}

function startMatching() {
  const cat = $('match-category').value;
  const pool = getFilteredRecipes(cat);
  const selected = shuffle(pool).slice(0, 8);

  STATE.match.pairs = selected;
  STATE.match.selectedLeft = null;
  STATE.match.selectedRight = null;
  STATE.match.matched = new Set();
  STATE.match.errors = 0;
  STATE.match.elapsed = 0;

  clearInterval(STATE.match.timerInterval);
  STATE.match.timerInterval = setInterval(() => {
    STATE.match.elapsed++;
    const m = Math.floor(STATE.match.elapsed / 60);
    const s = STATE.match.elapsed % 60;
    $('match-timer-display').textContent = `${m}:${String(s).padStart(2,'0')}`;
  }, 1000);

  $('match-area').style.display = 'block';
  $('match-result').style.display = 'none';
  renderMatching();
}

function renderMatching() {
  const leftItems = STATE.match.pairs;
  const rightItems = shuffle([...STATE.match.pairs]);

  $('match-score').textContent = `Совпадений: 0`;
  $('match-errors').textContent = `Ошибок: 0`;
  $('match-timer-display').textContent = '0:00';

  const leftEl = $('match-left');
  const rightEl = $('match-right');
  leftEl.innerHTML = '';
  rightEl.innerHTML = '';

  leftItems.forEach(r => {
    const div = document.createElement('div');
    div.className = 'match-item';
    div.dataset.id = r.id;
    div.dataset.side = 'left';
    div.textContent = r.indication;
    div.onclick = () => handleMatchClick(div, 'left');
    leftEl.appendChild(div);
  });

  rightItems.forEach(r => {
    const div = document.createElement('div');
    div.className = 'match-item';
    div.dataset.id = r.id;
    div.dataset.side = 'right';
    div.textContent = r.drug;
    div.onclick = () => handleMatchClick(div, 'right');
    rightEl.appendChild(div);
  });
}

function handleMatchClick(el, side) {
  if (el.classList.contains('matched')) return;
  if (el.classList.contains('wrong-flash')) return;

  const id = parseInt(el.dataset.id);

  if (side === 'left') {
    // Deselect previous left
    $$('#match-left .match-item.selected').forEach(x => x.classList.remove('selected'));
    STATE.match.selectedLeft = id;
    el.classList.add('selected');
  } else {
    // Deselect previous right
    $$('#match-right .match-item.selected').forEach(x => x.classList.remove('selected'));
    STATE.match.selectedRight = id;
    el.classList.add('selected');
  }

  // Check if both sides selected
  if (STATE.match.selectedLeft !== null && STATE.match.selectedRight !== null) {
    checkMatchPair();
  }
}

function checkMatchPair() {
  const leftId = STATE.match.selectedLeft;
  const rightId = STATE.match.selectedRight;

  const leftEl = document.querySelector(`#match-left .match-item[data-id="${leftId}"]`);
  const rightEl = document.querySelector(`#match-right .match-item[data-id="${rightId}"]`);

  if (leftId === rightId) {
    // Correct match!
    leftEl.classList.remove('selected');
    leftEl.classList.add('matched');
    rightEl.classList.remove('selected');
    rightEl.classList.add('matched');
    STATE.match.matched.add(leftId);
    $('match-score').textContent = `Совпадений: ${STATE.match.matched.size}`;

    if (STATE.match.matched.size === STATE.match.pairs.length) {
      clearInterval(STATE.match.timerInterval);
      setTimeout(showMatchResult, 500);
    }
  } else {
    // Wrong!
    STATE.match.errors++;
    $('match-errors').textContent = `Ошибок: ${STATE.match.errors}`;
    leftEl.classList.remove('selected');
    leftEl.classList.add('wrong-flash');
    rightEl.classList.remove('selected');
    rightEl.classList.add('wrong-flash');
    setTimeout(() => {
      leftEl.classList.remove('wrong-flash');
      rightEl.classList.remove('wrong-flash');
    }, 500);
  }

  STATE.match.selectedLeft = null;
  STATE.match.selectedRight = null;
}

function showMatchResult() {
  $('match-area').style.display = 'none';
  $('match-result').style.display = 'block';
  const m = Math.floor(STATE.match.elapsed / 60);
  const s = STATE.match.elapsed % 60;
  $('match-result-text').textContent =
    `Время: ${m}:${String(s).padStart(2,'0')} · Ошибок: ${STATE.match.errors} · Пар: ${STATE.match.pairs.length}`;
}

// ─── WRITE RECIPE ─────────────────────────────────────
function initWrite() {
  populateCategorySelect($('write-category'));
  loadNextWriteRecipe();
}

function loadNextWriteRecipe() {
  const cat = $('write-category').value;
  const pool = getFilteredRecipes(cat);
  STATE.write.recipe = pool[Math.floor(Math.random() * pool.length)];
  STATE.write.hintShown = false;
  renderWriteRecipe();
}

function renderWriteRecipe() {
  const r = STATE.write.recipe;
  $('write-ind-text').textContent = r.indication;
  $('write-drug-hint').textContent = '???';
  $('write-drug-hint').classList.add('hint-hidden');
  $('write-textarea').value = '';
  $('write-feedback').style.display = 'none';
}

function showWriteHint() {
  if (!STATE.write.hintShown) {
    STATE.write.hintShown = true;
    const r = STATE.write.recipe;
    $('write-drug-hint').textContent = r.drug;
    $('write-drug-hint').classList.remove('hint-hidden');
  }
}

function checkWriteRecipe() {
  const r = STATE.write.recipe;
  const typed = $('write-textarea').value.trim();
  const correct = r.recipe.trim();

  const fb = $('write-feedback');
  fb.style.display = 'block';

  if (typed.length === 0) {
    $('write-fb-label').textContent = '⚠️ Ничего не введено';
    $('write-fb-label').style.color = 'var(--warn)';
    $('write-correct-recipe').textContent = correct;
    $('write-note').textContent = r.note;
    return;
  }

  // Simple similarity: count matching words
  const typedWords = new Set(typed.toLowerCase().split(/\s+/));
  const correctWords = correct.toLowerCase().split(/\s+/);
  const matches = correctWords.filter(w => typedWords.has(w)).length;
  const similarity = pct(matches, correctWords.length);

  if (similarity >= 70) {
    $('write-fb-label').textContent = '✓ Отлично! Рецепт верный';
    $('write-fb-label').style.color = 'var(--success)';
    STATE.known.add(r.id);
    STATE.repeat.delete(r.id);
  } else if (similarity >= 40) {
    $('write-fb-label').textContent = `⚠️ Частично верно (${similarity}% совпадений). Сравните с эталоном:`;
    $('write-fb-label').style.color = 'var(--warn)';
    STATE.repeat.add(r.id);
  } else {
    $('write-fb-label').textContent = `✗ Ошибки в рецепте (${similarity}% совпадений). Эталон:`;
    $('write-fb-label').style.color = 'var(--danger)';
    STATE.repeat.add(r.id);
  }

  $('write-correct-recipe').textContent = correct;
  $('write-note').textContent = r.note;
  saveState();
  updateDashboard();
}

function showWriteAnswer() {
  const r = STATE.write.recipe;
  $('write-feedback').style.display = 'block';
  $('write-fb-label').textContent = 'Эталонный рецепт:';
  $('write-fb-label').style.color = 'var(--text3)';
  $('write-correct-recipe').textContent = r.recipe.trim();
  $('write-note').textContent = r.note;
  $('write-drug-hint').textContent = r.drug;
  $('write-drug-hint').classList.remove('hint-hidden');
}

// ─── BROWSE ───────────────────────────────────────────
function initBrowse() {
  populateCategorySelect($('browse-category'));
  renderBrowse();
}

function renderBrowse() {
  const search = $('browse-search').value.trim().toLowerCase();
  const cat = $('browse-category').value;
  const results = searchRecipes(search, cat);

  const grid = $('browse-grid');
  grid.innerHTML = '';
  $('browse-count').textContent = `Найдено: ${results.length} рецептов`;

  if (results.length === 0) {
    grid.innerHTML = `<div class="no-results"><div class="no-results-icon">🔍</div>Ничего не найдено</div>`;
    return;
  }

  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'browse-card';
    if (STATE.known.has(r.id)) card.classList.add('known');
    else if (STATE.repeat.has(r.id)) card.classList.add('repeat');

    const statusIcon = STATE.known.has(r.id) ? '✅' :
                       STATE.repeat.has(r.id) ? '🔄' : '';

    card.innerHTML = `
      <div class="bc-status">${statusIcon}</div>
      <div class="bc-drug">${escapeHtml(r.drug)}</div>
      <div class="bc-indication">${escapeHtml(r.indication)}</div>
      <div class="bc-meta">
        <span class="bc-tag">${escapeHtml(r.category)}</span>
        <span class="bc-tag">${escapeHtml(r.route)}</span>
        <span class="bc-tag">${escapeHtml(r.form)}</span>
      </div>
    `;
    card.onclick = () => openModal(r.id);
    grid.appendChild(card);
  });
}

// ─── MODAL ────────────────────────────────────────────
function openModal(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r) return;

  STATE.modal.recipeId = id;
  $('modal-drug').textContent = r.drug;
  $('modal-latin').textContent = r.latinName;
  $('modal-cat').textContent = r.category;
  $('modal-indication').textContent = r.indication;
  $('modal-recipe').textContent = r.recipe.trim();
  $('modal-note').textContent = r.note;
  $('recipe-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('recipe-modal').style.display = 'none';
  document.body.style.overflow = '';
  STATE.modal.recipeId = null;
}

// ─── PDF EXPORT ───────────────────────────────────────
function exportWeakToPDF() {
  if (STATE.repeat.size === 0) {
    showToast('Нет рецептов для повторения!');
    return;
  }

  const weakRecipes = RECIPES.filter(r => STATE.repeat.has(r.id));
  const win = window.open('', '_blank');
  if (!win) { showToast('Разрешите всплывающие окна'); return; }

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8"/>
  <title>Слабые рецепты — PharmaRecipe Trainer</title>
  <style>
    body { font-family: Georgia, serif; margin: 40px; color: #111; }
    h1 { font-size: 22px; margin-bottom: 24px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .recipe-entry { margin-bottom: 32px; page-break-inside: avoid; }
    .drug { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
    .latin { font-style: italic; color: #555; font-size: 13px; margin-bottom: 6px; }
    .indication { font-size: 13px; color: #333; margin-bottom: 10px; }
    .recipe-text { font-family: 'Courier New', monospace; font-size: 13px;
      border: 1px solid #ccc; border-left: 4px solid #006633;
      padding: 12px 14px; background: #f8f8f8; white-space: pre-wrap; }
    .note { font-size: 12px; color: #666; margin-top: 8px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
<h1>📋 Слабые рецепты (${weakRecipes.length} шт.) — PharmaRecipe Trainer</h1>
${weakRecipes.map(r => `
<div class="recipe-entry">
  <div class="drug">${r.drug}</div>
  <div class="latin">${r.latinName}</div>
  <div class="indication"><b>Показание:</b> ${r.indication}</div>
  <div class="recipe-text">${r.recipe.trim()}</div>
  <div class="note">${r.note}</div>
</div>
`).join('')}
<script>window.onload = () => window.print();<\/script>
</body></html>`;

  win.document.write(html);
  win.document.close();
}

// ─── EVENT LISTENERS ──────────────────────────────────
function bindEvents() {
  // Navigation
  $$('.nav-btn, .mode-card').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Theme
  $('theme-toggle').addEventListener('click', toggleTheme);
  $('theme-toggle-m').addEventListener('click', toggleTheme);

  // Mobile menu
  $('menu-toggle').addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
    $('sidebar-overlay').classList.toggle('show');
  });

  $('sidebar-overlay').addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.remove('show');
  });

  // ── Flashcards ──
  $('fc-show-btn').addEventListener('click', flipFC);
  $('fc-card').addEventListener('click', () => { if (!STATE.fc.flipped) flipFC(); });
  $('fc-yes-btn').addEventListener('click', fcMarkKnown);
  $('fc-no-btn').addEventListener('click', fcMarkRepeat);
  $('fc-prev').addEventListener('click', () => {
    if (STATE.fc.index > 0) { STATE.fc.index--; renderFC(); }
  });
  $('fc-next').addEventListener('click', () => {
    STATE.fc.index++;
    renderFC();
  });
  $('fc-restart').addEventListener('click', () => {
    $('fc-done').style.display = 'none';
    $('fc-card').style.display = '';
    $('fc-actions').style.display = '';
    $('fc-nav-row').style.display = '';
    buildFCDeck();
  });
  $('fc-category').addEventListener('change', buildFCDeck);
  $('fc-random').addEventListener('change', buildFCDeck);
  $('fc-weak-only').addEventListener('change', buildFCDeck);

  // ── Quiz ──
  $('quiz-start-btn').addEventListener('click', startQuiz);
  $('quiz-next-btn').addEventListener('click', nextQuizQuestion);
  $('quiz-restart-btn').addEventListener('click', () => {
    $('quiz-result').style.display = 'none';
    startQuiz();
  });

  // ── Exam ──
  $('exam-start-btn').addEventListener('click', startExam);
  $('exam-next-btn').addEventListener('click', nextExamQuestion);
  $('exam-restart-btn').addEventListener('click', initExamSetup);

  // ── Matching ──
  $('match-start-btn').addEventListener('click', startMatching);
  $('match-restart-btn').addEventListener('click', startMatching);

  // ── Write ──
  $('write-random-btn').addEventListener('click', loadNextWriteRecipe);
  $('write-category').addEventListener('change', loadNextWriteRecipe);
  $('write-hint-btn').addEventListener('click', showWriteHint);
  $('write-check-btn').addEventListener('click', checkWriteRecipe);
  $('write-show-btn').addEventListener('click', showWriteAnswer);
  $('write-next-btn').addEventListener('click', loadNextWriteRecipe);

  // ── Browse ──
  $('browse-search').addEventListener('input', renderBrowse);
  $('browse-category').addEventListener('change', renderBrowse);
  $('browse-export-btn').addEventListener('click', exportWeakToPDF);

  // ── Dashboard ──
  $('export-weak-btn').addEventListener('click', exportWeakToPDF);

  // ── Modal ──
  $('modal-close').addEventListener('click', closeModal);
  $('recipe-modal').addEventListener('click', e => {
    if (e.target === $('recipe-modal')) closeModal();
  });
  $('modal-know-btn').addEventListener('click', () => {
    const id = STATE.modal.recipeId;
    if (!id) return;
    STATE.known.add(id);
    STATE.repeat.delete(id);
    saveState();
    updateDashboard();
    renderBrowse();
    showToast('✓ Отмечено как «Знаю»');
    closeModal();
  });
  $('modal-repeat-btn').addEventListener('click', () => {
    const id = STATE.modal.recipeId;
    if (!id) return;
    STATE.repeat.add(id);
    saveState();
    updateDashboard();
    renderBrowse();
    showToast('🔄 Добавлено в список повторения');
    closeModal();
  });

  // Keyboard: Escape to close modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    // Space to flip card in flashcard view
    if (e.key === ' ' && document.querySelector('#view-flashcards.active')) {
      e.preventDefault();
      if (!STATE.fc.flipped) flipFC();
    }
    // Arrow keys for flashcard nav
    if (document.querySelector('#view-flashcards.active')) {
      if (e.key === 'ArrowRight') {
        if (STATE.fc.flipped) {
          // If answer shown, space goes next
        } else {
          STATE.fc.index++;
          renderFC();
        }
      }
      if (e.key === 'ArrowLeft') {
        if (STATE.fc.index > 0) { STATE.fc.index--; renderFC(); }
      }
    }
  });
}

// ─── SIDEBAR OVERLAY element ──────────────────────────
function createSidebarOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'sidebar-overlay';
  document.body.appendChild(overlay);
}

// ─── INIT ─────────────────────────────────────────────
function init() {
  loadState();
  createSidebarOverlay();
  applyTheme(STATE.theme);
  bindEvents();
  updateDashboard();
  showView('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
