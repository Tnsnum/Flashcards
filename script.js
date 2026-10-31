/* =========================================================
   ХРАНИЛИЩЕ
   ========================================================= */
const DECKS_KEY = 'flashcards_decks_v1';
const DRAFT_KEY = 'flashcards_editor_draft_v1';

function loadDecks() {
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveDecks(decks) {
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

/* =========================================================
   ПАРСЕР
   ========================================================= */
function parseCards(input) {
  if (!input || !input.trim()) return [];
  const normalized = input.replace(/\r\n?/g, '\n');
  const rawBlocks = [];
  let currentBlock = [];

  for (const line of normalized.split('\n')) {
    if (/^\s*===\s*$/.test(line)) {
      rawBlocks.push(currentBlock.join('\n'));
      currentBlock = [];
    } else {
      currentBlock.push(line);
    }
  }
  rawBlocks.push(currentBlock.join('\n'));

  const cards = [];
  for (const block of rawBlocks) {
    if (!block.trim()) continue;
    const blockLines = block.split('\n');
    const frontLines = [];
    const backLines = [];
    let inBack = false;

    for (const line of blockLines) {
      if (!inBack && /^\s*---\s*$/.test(line)) { inBack = true; continue; }
      if (inBack) backLines.push(line);
      else frontLines.push(line);
    }

    const trimEmpty = (arr) => {
      const a = arr.slice();
      while (a.length && a[0].trim() === '') a.shift();
      while (a.length && a[a.length - 1].trim() === '') a.pop();
      return a;
    };

    const front = trimEmpty(frontLines).join('\n');
    const back = trimEmpty(backLines).join('\n');
    if (!front && !back) continue;
    cards.push({ front, back, progress: { status: 'new', streak: 0 } });
  }
  return cards;
}

function cardsToText(cards) {
  return cards.map(c => `${c.front}\n---\n${c.back}`).join('\n===\n');
}

/* =========================================================
   НАВИГАЦИЯ
   ========================================================= */
const screens = {
  menu:   document.getElementById('screenMenu'),
  editor: document.getElementById('screenEditor'),
  deck:   document.getElementById('screenDeckMenu'),
  study:  document.getElementById('screenStudy'),
  test:   document.getElementById('screenTest')
};

const studyButtonArea = document.getElementById('studyButtonArea');
const testButtonArea = document.getElementById('testButtonArea');

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');

  // Панели кнопок — только для заучивания / теста
  studyButtonArea.classList.toggle('active', name === 'study');
  testButtonArea.classList.toggle('active', name === 'test');
}

/* =========================================================
   ОСНОВНОЕ МЕНЮ
   ========================================================= */
const menuBgText = document.getElementById('menuBgText');
const decksList = document.getElementById('decksList');
let currentDeckId = null;

function refreshMenu() {
  const decks = loadDecks();
  if (decks.length === 0) {
    menuBgText.classList.remove('hidden');
    menuBgText.textContent = 'Добавьте колоду';
    decksList.classList.add('hidden');
    decksList.innerHTML = '';
    return;
  }
  menuBgText.classList.add('hidden');
  decksList.classList.remove('hidden');
  decksList.innerHTML = '';

  for (const deck of decks) {
    const total = deck.cards.length;
    let learned = 0;
    for (const c of deck.cards) if (c.progress?.status === 'learned') learned++;
    const percent = total > 0 ? Math.round((learned / total) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'deck-card';
    card.innerHTML = `
      <div class="deck-name"></div>
      <div class="deck-progress">
        <span class="percent">${percent}%</span>
        <span class="count">${learned}/${total}</span>
      </div>`;
    card.querySelector('.deck-name').textContent = deck.name;
    card.addEventListener('click', () => openDeckMenu(deck.id));
    decksList.appendChild(card);
  }
}

/* =========================================================
   РЕДАКТОР
   ========================================================= */
const editorText = document.getElementById('editorText');
const editorStatus = document.getElementById('editorStatus');
const editorSaveBtn = document.getElementById('editorSaveBtn');

let editorMode = 'create';
let editorDeckId = null;

function openEditorCreate() {
  editorMode = 'create';
  editorDeckId = null;
  editorText.value = localStorage.getItem(DRAFT_KEY) || '';
  editorSaveBtn.textContent = 'Сохранить колоду';
  updateEditorStatus();
  showScreen('editor');
  setTimeout(() => editorText.focus(), 50);
}

function openEditorEdit(deckId) {
  editorMode = 'edit';
  editorDeckId = deckId;
  const deck = loadDecks().find(d => d.id === deckId);
  if (!deck) return;
  editorText.value = cardsToText(deck.cards);
  editorSaveBtn.textContent = 'Сохранить изменения';
  updateEditorStatus();
  showScreen('editor');
}

function updateEditorStatus() {
  if (editorMode === 'create') {
    localStorage.setItem(DRAFT_KEY, editorText.value);
  }
  const cards = parseCards(editorText.value);
  if (cards.length === 0) {
    editorStatus.innerHTML = '';
    editorSaveBtn.disabled = true;
    return;
  }
  editorStatus.innerHTML = `Распознано <span class="num">${cards.length}</span> ${pluralCards(cards.length)}`;
  editorSaveBtn.disabled = false;
}

function pluralCards(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'карточка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'карточки';
  return 'карточек';
}

editorText.addEventListener('input', updateEditorStatus);

editorSaveBtn.addEventListener('click', () => {
  const cards = parseCards(editorText.value);
  if (cards.length === 0) return;

  if (editorMode === 'create') {
    openDeckNameModal('create', null);
  } else {
    const decks = loadDecks();
    const deck = decks.find(d => d.id === editorDeckId);
    if (!deck) return;

    const oldByKey = new Map();
    for (const c of deck.cards) {
      const key = c.front + '\u0000' + c.back;
      oldByKey.set(key, c.progress || { status: 'new', streak: 0 });
    }
    deck.cards = cards.map(c => {
      const key = c.front + '\u0000' + c.back;
      const prog = oldByKey.get(key) || { status: 'new', streak: 0 };
      return { front: c.front, back: c.back, progress: prog };
    });

    saveDecks(decks);
    updateDeckMenuCounter(deck);
    showScreen('deck');
  }
});

document.getElementById('editorBackBtn').addEventListener('click', () => {
  if (editorMode === 'edit') showScreen('deck');
  else { refreshMenu(); showScreen('menu'); }
});

/* =========================================================
   МОДАЛКА ИМЕНИ
   ========================================================= */
const deckNameOverlay = document.getElementById('deckNameOverlay');
const deckNameInput = document.getElementById('deckNameInput');
const deckNameCancel = document.getElementById('deckNameCancel');
const deckNameSave = document.getElementById('deckNameSave');
const deckNameTitle = document.getElementById('deckNameTitle');

let deckNameMode = 'create';
let deckNameDeckId = null;

function openDeckNameModal(mode, deckId) {
  deckNameMode = mode;
  deckNameDeckId = deckId;
  if (mode === 'rename') {
    const deck = loadDecks().find(d => d.id === deckId);
    deckNameTitle.textContent = 'Переименовать колоду';
    deckNameInput.value = deck ? deck.name : '';
  } else {
    deckNameTitle.textContent = 'Название колоды';
    deckNameInput.value = '';
  }
  deckNameOverlay.classList.add('active');
  setTimeout(() => deckNameInput.focus(), 50);
}
function closeDeckNameModal() { deckNameOverlay.classList.remove('active'); }

deckNameCancel.addEventListener('click', closeDeckNameModal);
deckNameOverlay.addEventListener('click', (e) => {
  if (e.target === deckNameOverlay) closeDeckNameModal();
});
deckNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); deckNameSave.click(); }
  if (e.key === 'Escape') closeDeckNameModal();
});

deckNameSave.addEventListener('click', () => {
  const name = deckNameInput.value.trim();
  if (!name) { deckNameInput.focus(); return; }
  const decks = loadDecks();

  if (deckNameMode === 'create') {
    const cards = parseCards(editorText.value);
    if (cards.length === 0) return;
    decks.push({
      id: Date.now().toString(),
      name,
      cards,
      createdAt: new Date().toISOString()
    });
    saveDecks(decks);
    localStorage.removeItem(DRAFT_KEY);
    editorText.value = '';
    updateEditorStatus();
    closeDeckNameModal();
    refreshMenu();
    showScreen('menu');
  } else if (deckNameMode === 'rename') {
    const deck = decks.find(d => d.id === deckNameDeckId);
    if (deck) { deck.name = name; saveDecks(decks); }
    closeDeckNameModal();
    showScreen('deck');
  }
});

/* =========================================================
   МЕНЮ КОЛОДЫ
   ========================================================= */
const deckMenuCounter = document.getElementById('deckMenuCounter');

function getDeck() {
  return loadDecks().find(d => d.id === currentDeckId);
}
function updateDeck(deck) {
  const decks = loadDecks();
  const idx = decks.findIndex(d => d.id === deck.id);
  if (idx === -1) return;
  decks[idx] = deck;
  saveDecks(decks);
}
function updateDeckMenuCounter(deck) {
  const total = deck.cards.length;
  let learned = 0;
  for (const c of deck.cards) {
    if (c.progress && c.progress.status === 'learned') learned++;
  }
  const percent = total > 0 ? Math.round((learned / total) * 100) : 0;
  deckMenuCounter.textContent = `Выучено ${percent}% • ${learned}/${total}`;
}
function openDeckMenu(deckId) {
  currentDeckId = deckId;
  const deck = getDeck();
  if (deck) updateDeckMenuCounter(deck);
  showScreen('deck');
}
function isDeckFullyLearned(deck) {
  if (!deck || deck.cards.length === 0) return false;
  return deck.cards.every(c => c.progress && c.progress.status === 'learned');
}

document.getElementById('deckMenuBackBtn').addEventListener('click', () => {
  refreshMenu();
  showScreen('menu');
});
document.getElementById('renameDeckBtn').addEventListener('click', () => {
  if (currentDeckId) openDeckNameModal('rename', currentDeckId);
});
document.getElementById('editDeckBtn').addEventListener('click', () => {
  if (currentDeckId) openEditorEdit(currentDeckId);
});

/* ---------- Сброс прогресса ---------- */
const resetOverlay = document.getElementById('resetOverlay');
const resetCancel = document.getElementById('resetCancel');
const resetConfirm = document.getElementById('resetConfirm');

document.getElementById('resetProgressBtn').addEventListener('click', () => {
  resetOverlay.classList.add('active');
});
resetCancel.addEventListener('click', () => resetOverlay.classList.remove('active'));
resetOverlay.addEventListener('click', (e) => {
  if (e.target === resetOverlay) resetOverlay.classList.remove('active');
});
resetConfirm.addEventListener('click', () => {
  const deck = getDeck();
  if (deck) {
    for (const c of deck.cards) c.progress = { status: 'new', streak: 0 };
    updateDeck(deck);
    updateDeckMenuCounter(deck);
  }
  resetOverlay.classList.remove('active');
});

/* ---------- Удалить колоду ---------- */
const deleteOverlay = document.getElementById('deleteOverlay');
const deleteCancel = document.getElementById('deleteCancel');
const deleteConfirm = document.getElementById('deleteConfirm');

document.getElementById('deleteDeckBtn').addEventListener('click', () => {
  deleteOverlay.classList.add('active');
});
deleteCancel.addEventListener('click', () => deleteOverlay.classList.remove('active'));
deleteOverlay.addEventListener('click', (e) => {
  if (e.target === deleteOverlay) deleteOverlay.classList.remove('active');
});
deleteConfirm.addEventListener('click', () => {
  if (!currentDeckId) return;
  const decks = loadDecks().filter(d => d.id !== currentDeckId);
  saveDecks(decks);
  currentDeckId = null;
  deleteOverlay.classList.remove('active');
  refreshMenu();
  showScreen('menu');
});

/* =========================================================
   ОБЩИЕ ХЕЛПЕРЫ
   ========================================================= */
function setMathContent(el, text) {
  el.textContent = text;
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([el]).catch(() => {});
  }
}

function resetFeedbackIcon(icon) {
  icon.classList.remove('play', 'cross', 'check');
  icon.textContent = '';
  icon.style.opacity = '0';
  icon.style.animation = 'none';
}
function clearFeedbackIconStyles(icon) {
  icon.style.opacity = '';
  icon.style.animation = '';
}

function playFeedbackIcon(icon, type) {
  icon.classList.remove('play', 'cross', 'check');
  void icon.offsetWidth;
  icon.textContent = (type === 'wrong') ? '✕' : '✓';
  icon.classList.add(type === 'wrong' ? 'cross' : 'check');
  icon.classList.add('play');
}

/* =========================================================
   ВЫБОР КАРТОЧКИ (20/50/30, без повтора подряд)
   ========================================================= */
function pickCard(deck, excludeIdx) {
  const groups = { new: [], learning: [], learned: [] };
  deck.cards.forEach((c, i) => {
    if (i === excludeIdx) return;
    const st = (c.progress && c.progress.status) || 'new';
    groups[st].push(i);
  });

  if (groups.new.length + groups.learning.length + groups.learned.length === 0) {
    return excludeIdx;
  }

  const weights = { new: 0.20, learning: 0.50, learned: 0.30 };
  const available = [];
  let totalWeight = 0;
  for (const key of ['new', 'learning', 'learned']) {
    if (groups[key].length > 0) {
      available.push(key);
      totalWeight += weights[key];
    }
  }

  let r = Math.random() * totalWeight;
  let chosenGroup = available[available.length - 1];
  let acc = 0;
  for (const key of available) {
    acc += weights[key];
    if (r < acc) { chosenGroup = key; break; }
  }

  const pool = groups[chosenGroup];
  return pool[Math.floor(Math.random() * pool.length)];
}

/* =========================================================
   УВЕДОМЛЕНИЕ «ВСЁ ВЫУЧЕНО» → АВТО-ПЕРЕХОД НА ГЛАВНУЮ
   ========================================================= */
const allLearnedOverlay = document.getElementById('allLearnedOverlay');
let allLearnedTimer = null;

function goHome() {
  currentDeckId = null;
  refreshMenu();
  showScreen('menu');
}

function showAllLearnedNotice() {
  allLearnedOverlay.classList.add('active');
  clearTimeout(allLearnedTimer);
  allLearnedTimer = setTimeout(() => {
    allLearnedOverlay.classList.remove('active');
    goHome();
  }, 1800);
}

/* =========================================================
   ЗАУЧИВАНИЕ
   ========================================================= */
const studyCounter = document.getElementById('studyCounter');
const studyFace    = document.getElementById('studyFace');
const studyHidden  = document.getElementById('studyHidden');
const studyBack    = document.getElementById('studyBack');
const showAnswerBtn = document.getElementById('showAnswerBtn');
const answerButtons = document.getElementById('answer-buttons');
const wrongBtn = document.getElementById('wrongBtn');
const rightBtn = document.getElementById('rightBtn');
const feedbackIcon = document.getElementById('feedbackIcon');

let currentCardIndex = null;
let answerShown = false;
let animating = false;

function updateStudyCounter(deck) {
  const total = deck.cards.length;
  let learned = 0;
  for (const c of deck.cards) {
    if (c.progress && c.progress.status === 'learned') learned++;
  }
  const percent = total > 0 ? Math.round((learned / total) * 100) : 0;
  studyCounter.textContent = `Выучено ${percent}% • ${learned}/${total}`;
}

function renderStudyCard() {
  const deck = getDeck();
  if (!deck) return;

  const idx = pickCard(deck, currentCardIndex);
  if (idx === null || idx === undefined) return;
  currentCardIndex = idx;
  const card = deck.cards[idx];

  answerShown = false;
  showAnswerBtn.style.display = 'inline-flex';
  answerButtons.classList.remove('visible');

  studyHidden.classList.remove('show');
  studyHidden.classList.add('instant-hide');
  studyBack.innerHTML = '';

  studyFace.innerHTML = '';
  setMathContent(studyFace, card.front);

  updateStudyCounter(deck);

  void studyHidden.offsetWidth;
  studyHidden.classList.remove('instant-hide');
}

function showBack() {
  if (answerShown || animating) return;
  const deck = getDeck();
  if (!deck || currentCardIndex === null) return;
  const card = deck.cards[currentCardIndex];
  answerShown = true;

  studyBack.innerHTML = '';
  setMathContent(studyBack, card.back);

  studyHidden.classList.remove('instant-hide');
  void studyHidden.offsetWidth;
  studyHidden.classList.add('show');

  showAnswerBtn.style.display = 'none';
  answerButtons.classList.add('visible');
}

function handleAnswer(isRight) {
  if (!answerShown || animating) return;
  const deck = getDeck();
  if (!deck || currentCardIndex === null) return;
  animating = true;

  const card = deck.cards[currentCardIndex];
  if (!card.progress) card.progress = { status: 'new', streak: 0 };

  if (!isRight) {
    card.progress.status = 'learning';
    card.progress.streak = 0;
  } else {
    card.progress.streak = (card.progress.streak || 0) + 1;
    if (card.progress.streak >= 3) card.progress.status = 'learned';
    else card.progress.status = 'learning';
  }
  updateDeck(deck);
  updateStudyCounter(deck);

  playFeedbackIcon(feedbackIcon, isRight ? 'right' : 'wrong');

  setTimeout(() => {
    const d = getDeck();
    if (!d) { animating = false; return; }

    answerButtons.classList.remove('visible');
    showAnswerBtn.style.display = 'inline-flex';

    studyHidden.classList.remove('show');
    studyHidden.classList.add('instant-hide');
    studyBack.innerHTML = '';

    if (isDeckFullyLearned(d)) {
      animating = false;
      showAllLearnedNotice();
    } else {
      renderStudyCard();
      animating = false;
    }
  }, 700);
}

showAnswerBtn.addEventListener('click', showBack);
wrongBtn.addEventListener('click', () => handleAnswer(false));
rightBtn.addEventListener('click', () => handleAnswer(true));

/* Модалка «заучивание заблокировано» */
const studyLockedOverlay = document.getElementById('studyLockedOverlay');
const studyLockedCancel = document.getElementById('studyLockedCancel');
const studyLockedReset = document.getElementById('studyLockedReset');

studyLockedCancel.addEventListener('click', () => {
  studyLockedOverlay.classList.remove('active');
});
studyLockedOverlay.addEventListener('click', (e) => {
  if (e.target === studyLockedOverlay) studyLockedOverlay.classList.remove('active');
});
studyLockedReset.addEventListener('click', () => {
  const deck = getDeck();
  if (deck) {
    for (const c of deck.cards) c.progress = { status: 'new', streak: 0 };
    updateDeck(deck);
    updateDeckMenuCounter(deck);
  }
  studyLockedOverlay.classList.remove('active');
});

function startStudy() {
  const deck = getDeck();
  if (!deck) return;

  if (isDeckFullyLearned(deck)) {
    studyLockedOverlay.classList.add('active');
    return;
  }

  animating = false;
  answerShown = false;
  currentCardIndex = null;

  resetFeedbackIcon(feedbackIcon);

  showScreen('study');
  renderStudyCard();

  requestAnimationFrame(() => clearFeedbackIconStyles(feedbackIcon));
}

document.getElementById('studyBackBtn').addEventListener('click', () => {
  const deck = getDeck();
  if (deck) updateDeckMenuCounter(deck);
  showScreen('deck');
});

document.getElementById('studyBtn').addEventListener('click', () => {
  if (currentDeckId) startStudy();
});

/* =========================================================
   КОНТРОЛЬНЫЙ ТЕСТ
   ========================================================= */
const testCounter = document.getElementById('testCounter');
const testFace = document.getElementById('testFace');
const testHidden = document.getElementById('testHidden');
const testBack = document.getElementById('testBack');
const testRoundLabel = document.getElementById('testRoundLabel');
const testShowAnswerBtn = document.getElementById('testShowAnswerBtn');
const testAnswerButtons = document.getElementById('test-answer-buttons');
const testWrongBtn = document.getElementById('testWrongBtn');
const testRightBtn = document.getElementById('testRightBtn');
const testFeedbackIcon = document.getElementById('testFeedbackIcon');

let testQueue = [];
let testWrongQueue = [];
let testCurrentIdx = null;
let testAnswered = 0;
let testTotal = 0;
let testAnimating = false;
let testAnswerShown = false;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function updateTestCounter() {
  testCounter.textContent = `Отвечено ${testAnswered}/${testTotal}`;
}

function startTest() {
  const deck = getDeck();
  if (!deck || deck.cards.length === 0) return;

  testQueue = shuffle(deck.cards.map((_, i) => i));
  testWrongQueue = [];
  testAnswered = 0;
  testTotal = testQueue.length;
  testAnimating = false;
  testAnswerShown = false;

  testRoundLabel.classList.add('hidden');
  resetFeedbackIcon(testFeedbackIcon);

  showScreen('test');
  updateTestCounter();
  showNextTestCard();

  requestAnimationFrame(() => clearFeedbackIconStyles(testFeedbackIcon));
}

function showNextTestCard() {
  if (testQueue.length === 0) {
    if (testWrongQueue.length === 0) {
      testFace.innerHTML = '';
      testHidden.classList.remove('show');
      testHidden.classList.add('instant-hide');
      testBack.innerHTML = '';
      testShowAnswerBtn.style.display = 'none';
      testAnswerButtons.classList.remove('visible');
      testWrongBtn.disabled = true;
      testRightBtn.disabled = true;
      testRoundLabel.classList.add('hidden');
      showAllLearnedNotice();
      return;
    }
    testQueue = shuffle(testWrongQueue);
    testWrongQueue = [];
    testAnswered = 0;
    testTotal = testQueue.length;
    testRoundLabel.classList.remove('hidden');
    testRoundLabel.textContent = 'Прогон неправильных';
    updateTestCounter();
  }

  testCurrentIdx = testQueue.shift();
  const card = getDeck().cards[testCurrentIdx];

  testAnswerShown = false;
  testShowAnswerBtn.style.display = 'inline-flex';
  testAnswerButtons.classList.remove('visible');

  testHidden.classList.remove('show');
  testHidden.classList.add('instant-hide');
  testBack.innerHTML = '';

  testFace.innerHTML = '';
  setMathContent(testFace, card.front);

  void testHidden.offsetWidth;
  testHidden.classList.remove('instant-hide');
}

function testShowBack() {
  if (testAnswerShown || testAnimating) return;
  if (testCurrentIdx === null) return;
  const deck = getDeck();
  if (!deck) return;
  const card = deck.cards[testCurrentIdx];
  testAnswerShown = true;

  testBack.innerHTML = '';
  setMathContent(testBack, card.back);

  testHidden.classList.remove('instant-hide');
  void testHidden.offsetWidth;
  testHidden.classList.add('show');

  testShowAnswerBtn.style.display = 'none';
  testAnswerButtons.classList.add('visible');
}

function handleTestAnswer(isRight) {
  if (!testAnswerShown || testAnimating) return;
  if (testCurrentIdx === null) return;
  testAnimating = true;

  testAnswered++;
  updateTestCounter();
  if (!isRight) testWrongQueue.push(testCurrentIdx);

  playFeedbackIcon(testFeedbackIcon, isRight ? 'right' : 'wrong');

  setTimeout(() => {
    testAnimating = false;
    showNextTestCard();
  }, 700);
}

testShowAnswerBtn.addEventListener('click', testShowBack);
testWrongBtn.addEventListener('click', () => handleTestAnswer(false));
testRightBtn.addEventListener('click', () => handleTestAnswer(true));

document.getElementById('testBackBtn').addEventListener('click', () => {
  const deck = getDeck();
  if (deck) updateDeckMenuCounter(deck);
  showScreen('deck');
});

document.getElementById('testBtn').addEventListener('click', () => {
  if (currentDeckId) startTest();
});

/* =========================================================
   ГОРЯЧИЕ КЛАВИШИ
   ========================================================= */
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();

  if (screens.study.classList.contains('active')) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!answerShown && !animating) showBack();
      return;
    }
    if (key === 'c' || e.code === 'KeyC') {
      e.preventDefault();
      if (answerShown && !animating) handleAnswer(false);
    } else if (key === 'v' || e.code === 'KeyV') {
      e.preventDefault();
      if (answerShown && !animating) handleAnswer(true);
    }
    return;
  }

  if (screens.test.classList.contains('active')) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!testAnswerShown && !testAnimating) testShowBack();
      return;
    }
    if (key === 'c' || e.code === 'KeyC') {
      e.preventDefault();
      if (testAnswerShown && !testAnimating) handleTestAnswer(false);
    } else if (key === 'v' || e.code === 'KeyV') {
      e.preventDefault();
      if (testAnswerShown && !testAnimating) handleTestAnswer(true);
    }
  }
});

/* =========================================================
   СТАРТ
   ========================================================= */
document.getElementById('addBtn').addEventListener('click', () => {
  openEditorCreate();
});

refreshMenu();
