"use strict";

const telegram = window.Telegram?.WebApp;
const content = document.querySelector("#content");
const pageTitle = document.querySelector("#pageTitle");
const pageSubtitle = document.querySelector("#pageSubtitle");
const eyebrow = document.querySelector("#eyebrow");
const backButton = document.querySelector("#backButton");
const topbar = document.querySelector(".topbar");
const MINI_APP_DARK_COLOR = "#0b0d0f";
const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "purple"];
let pendingHighlightSelection = null;

const COURSE_LANDING_CONFIG = {
  brandTitle: "Протокол 0.",
  brandSubtitle: "закрытый курс",
  heroImageUrl: "",
  heroKicker: "ПРОТОКОЛ",
  heroTitle: "Следуй протоколу",
  heroDescription: "Закрытая система уроков, фокуса и движения вперёд.",
  productImageUrl: "",
  productTitle: "Протокол 0.",
  productDescription: "Ты уже здесь. Обратного пути нет.",
  productPrice: "Бесплатно",
  continueButtonText: "Продолжить",
  searchPlaceholder: "Поиск по названию",
  authorName: "Protocol",
};

const LAST_LESSON_STORAGE_KEYS = {
  lessonId: "protocol_last_lesson_id",
  moduleId: "protocol_last_module_id",
  lessonTitle: "protocol_last_lesson_title",
  openedAt: "protocol_last_opened_at",
};

const stepLabels = [
  "Первая ступень",
  "Вторая ступень",
  "Третья ступень",
  "Четвёртая ступень",
  "Пятая ступень",
  "Шестая ступень",
  "Седьмая ступень",
  "Восьмая ступень",
  "Девятая ступень",
  "Десятая ступень",
];

const state = {
  modules: [],
  lessonsByModule: new Map(),
  expandedModuleIds: new Set(),
  currentModuleId: null,
  currentLessonId: null,
  currentBlocks: [],
  activeHighlight: null,
  selectionToolbar: null,
  copyNotice: null,
  copyNoticeTimer: null,
};

function setHeader(label, title, subtitle) {
  setCourseHeaderVisible(true);
  eyebrow.textContent = label;
  pageTitle.textContent = title;
  pageSubtitle.textContent = subtitle;
}

function setCourseHeaderVisible(isVisible) {
  topbar.hidden = !isVisible;
  pageSubtitle.hidden = !isVisible;
}

function syncBackButtons() {
  const canGoBack = state.currentLessonId !== null;
  backButton.hidden = !canGoBack;

  if (!telegram?.BackButton) {
    return;
  }
  if (canGoBack) {
    telegram.BackButton.show();
  } else {
    telegram.BackButton.hide();
  }
}

function configureTelegramWebApp() {
  if (!telegram) {
    return;
  }

  try {
    telegram.ready();
    telegram.expand();
    telegram.setHeaderColor?.(MINI_APP_DARK_COLOR);
    telegram.setBackgroundColor?.(MINI_APP_DARK_COLOR);
    telegram.setBottomBarColor?.(MINI_APP_DARK_COLOR);
    telegram.disableVerticalSwipes?.();

    if (telegram.isVersionAtLeast?.("8.0")) {
      const fullscreenResult = telegram.requestFullscreen?.();
      if (fullscreenResult && typeof fullscreenResult.catch === "function") {
        fullscreenResult.catch(() => {});
      }
    }
  } catch (error) {
    console.debug("Telegram WebApp viewport setup skipped:", error);
  }
}

function getLastLessonProgress() {
  const lessonId = Number(localStorage.getItem(LAST_LESSON_STORAGE_KEYS.lessonId));
  const moduleId = Number(localStorage.getItem(LAST_LESSON_STORAGE_KEYS.moduleId));
  const lessonTitle = localStorage.getItem(LAST_LESSON_STORAGE_KEYS.lessonTitle) || "";
  const openedAt = localStorage.getItem(LAST_LESSON_STORAGE_KEYS.openedAt) || "";

  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return null;
  }

  return {
    lessonId,
    moduleId: Number.isInteger(moduleId) && moduleId > 0 ? moduleId : null,
    lessonTitle,
    openedAt,
  };
}

function saveLastLessonProgress(moduleId, lesson) {
  if (!lesson?.id) {
    return;
  }

  localStorage.setItem(LAST_LESSON_STORAGE_KEYS.lessonId, String(lesson.id));
  if (moduleId) {
    localStorage.setItem(LAST_LESSON_STORAGE_KEYS.moduleId, String(moduleId));
  }
  localStorage.setItem(LAST_LESSON_STORAGE_KEYS.lessonTitle, lesson.title || "Урок");
  localStorage.setItem(LAST_LESSON_STORAGE_KEYS.openedAt, new Date().toISOString());
}

function getElementFromNode(node) {
  if (!node) {
    return null;
  }
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

function getLessonElementFromTarget(target) {
  return getElementFromNode(target)?.closest?.(".lesson") || null;
}

function isSelectionInsideLesson() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }
  const range = selection.getRangeAt(0);
  return Boolean(getLessonElementFromTarget(range.commonAncestorContainer));
}

function showCopyNotice(message = "Копирование отключено") {
  if (!state.copyNotice) {
    state.copyNotice = document.createElement("div");
    state.copyNotice.className = "copy-notice";
    state.copyNotice.setAttribute("role", "status");
    state.copyNotice.setAttribute("aria-live", "polite");
    document.body.append(state.copyNotice);
  }

  state.copyNotice.textContent = message;
  state.copyNotice.hidden = false;
  state.copyNotice.classList.add("is-visible");

  window.clearTimeout(state.copyNoticeTimer);
  state.copyNoticeTimer = window.setTimeout(() => {
    state.copyNotice?.classList.remove("is-visible");
    state.copyNoticeTimer = window.setTimeout(() => {
      if (state.copyNotice) {
        state.copyNotice.hidden = true;
      }
    }, 180);
  }, 1600);
}

function blockProtectedLessonEvent(event) {
  if (getLessonElementFromTarget(event.target) || isSelectionInsideLesson()) {
    event.preventDefault();
    showCopyNotice();
    return true;
  }
  return false;
}

function handleProtectedDragStart(event) {
  const targetElement = getElementFromNode(event.target);
  if (targetElement?.closest?.(".lesson-text-block")) {
    return false;
  }
  return blockProtectedLessonEvent(event);
}

function handleProtectedKeydown(event) {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && (key === "c" || key === "x")) {
    blockProtectedLessonEvent(event);
  }
}

function getHighlightStorageKey(lessonId) {
  return `lesson_highlights_${lessonId}`;
}

function makeHighlightId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `highlight_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readLessonHighlights(lessonId = state.currentLessonId) {
  if (lessonId === null || lessonId === undefined) {
    return [];
  }

  try {
    const raw = localStorage.getItem(getHighlightStorageKey(lessonId));
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && HIGHLIGHT_COLORS.includes(item.color))
      .map((item) => ({
        id: String(item.id || makeHighlightId()),
        blockId: String(item.blockId),
        startOffset: Number(item.startOffset),
        endOffset: Number(item.endOffset),
        color: item.color,
      }))
      .filter(
        (item) =>
          Number.isInteger(item.startOffset) &&
          Number.isInteger(item.endOffset) &&
          item.startOffset >= 0 &&
          item.endOffset > item.startOffset
      );
  } catch {
    return [];
  }
}

function writeLessonHighlights(highlights, lessonId = state.currentLessonId) {
  if (lessonId === null || lessonId === undefined) {
    return;
  }
  try {
    localStorage.setItem(getHighlightStorageKey(lessonId), JSON.stringify(highlights));
  } catch {
    showCopyNotice("Не удалось сохранить выделение");
  }
}

function getBlockHighlights(blockId, textLength) {
  const blockHighlights = readLessonHighlights()
    .filter((highlight) => highlight.blockId === String(blockId))
    .filter((highlight) => highlight.endOffset <= textLength)
    .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);

  const cleanHighlights = [];
  let lastEnd = 0;
  blockHighlights.forEach((highlight) => {
    if (highlight.startOffset >= lastEnd) {
      cleanHighlights.push(highlight);
      lastEnd = highlight.endOffset;
    }
  });
  return cleanHighlights;
}

function getBlockStorageId(block, index = 0) {
  if (block.id !== null && block.id !== undefined) {
    return String(block.id);
  }
  return `legacy-${index}`;
}

function getTextNodeOffset(root, targetNode, targetOffset) {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += node.textContent.length;
    node = walker.nextNode();
  }
  return null;
}

function renderTextBlockWithHighlights(blockElement, rawText, highlights) {
  blockElement.replaceChildren();
  const safeHighlights = [...highlights]
    .filter(
      (highlight) =>
        HIGHLIGHT_COLORS.includes(highlight.color) &&
        highlight.startOffset >= 0 &&
        highlight.endOffset > highlight.startOffset &&
        highlight.endOffset <= rawText.length
    )
    .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);

  const paragraph = document.createElement("p");
  paragraph.className = "lesson-text-content";
  let cursor = 0;
  let lastEnd = 0;

  safeHighlights.forEach((highlight) => {
    if (highlight.startOffset < lastEnd) {
      return;
    }
    if (cursor < highlight.startOffset) {
      paragraph.append(document.createTextNode(rawText.slice(cursor, highlight.startOffset)));
    }

    const mark = document.createElement("mark");
    mark.className = `highlight highlight-${highlight.color}`;
    mark.dataset.highlightId = highlight.id;
    mark.dataset.blockId = highlight.blockId;
    mark.dataset.startOffset = String(highlight.startOffset);
    mark.dataset.endOffset = String(highlight.endOffset);
    mark.dataset.color = highlight.color;
    mark.textContent = rawText.slice(highlight.startOffset, highlight.endOffset);
    paragraph.append(mark);

    cursor = highlight.endOffset;
    lastEnd = highlight.endOffset;
  });

  if (cursor < rawText.length) {
    paragraph.append(document.createTextNode(rawText.slice(cursor)));
  }

  blockElement.append(paragraph);
}

function renderTextBlockContent(blockElement, block) {
  const rawText = block.rawText ?? String(block.content || "");
  const highlights = getBlockHighlights(block.highlightBlockId || getBlockStorageId(block), rawText.length);
  renderTextBlockWithHighlights(blockElement, rawText, highlights);
}

function rerenderLessonTextBlocks() {
  document.querySelectorAll(".lesson-text-block").forEach((blockElement) => {
    const block = state.currentBlocks.find((item) => item.highlightBlockId === blockElement.dataset.blockId);
    if (block) {
      renderTextBlockContent(blockElement, block);
    }
  });
}

function selectionTouchesBlockedElement(selection) {
  if (!selection || selection.rangeCount === 0) {
    return true;
  }
  const range = selection.getRangeAt(0);
  const element = getElementFromNode(range.commonAncestorContainer);
  return Boolean(element?.closest?.("button, a, iframe, img, .lesson-navigation, .selection-toolbar"));
}

function getSelectionOffsetsWithinBlock(blockElement, range) {
  const startBlock = getElementFromNode(range.startContainer)?.closest?.(".lesson-text-block");
  const endBlock = getElementFromNode(range.endContainer)?.closest?.(".lesson-text-block");
  if (!startBlock || !endBlock || startBlock !== endBlock || startBlock !== blockElement) {
    return null;
  }

  const selectedText = range.toString();
  if (!selectedText.trim()) {
    return null;
  }

  const preRange = document.createRange();
  preRange.selectNodeContents(blockElement);
  preRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = preRange.toString().length;
  const endOffset = startOffset + selectedText.length;

  if (startOffset === endOffset) {
    return null;
  }

  return { startOffset, endOffset, selectedText };
}

function getPendingHighlightSelectionFromCurrentSelection() {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    !selection.toString().trim() ||
    selectionTouchesBlockedElement(selection)
  ) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const startBlock = getElementFromNode(range.startContainer)?.closest?.(".lesson-text-block");
  const endBlock = getElementFromNode(range.endContainer)?.closest?.(".lesson-text-block");
  if (!startBlock || !endBlock) {
    return null;
  }
  if (startBlock !== endBlock) {
    showCopyNotice("Выделяйте текст внутри одного блока");
    return null;
  }

  const offsets = getSelectionOffsetsWithinBlock(startBlock, range);
  if (!offsets) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return null;
  }

  const rawText = startBlock.dataset.rawText || "";
  return {
    lessonId: state.currentLessonId,
    blockId: startBlock.dataset.blockId,
    startOffset: offsets.startOffset,
    endOffset: offsets.endOffset,
    selectedText: offsets.selectedText,
    rect,
    rawText,
  };
}

function hideSelectionToolbar() {
  state.activeHighlight = null;
  pendingHighlightSelection = null;
  if (state.selectionToolbar) {
    state.selectionToolbar.hidden = true;
  }
}

function protectToolbarPointer(event) {
  event.preventDefault();
  event.stopPropagation();
}

function positionToolbar(rect) {
  const toolbar = ensureSelectionToolbar();
  toolbar.hidden = false;
  const margin = 10;
  const toolbarRect = toolbar.getBoundingClientRect();
  const left = Math.min(
    Math.max(margin, rect.left + rect.width / 2 - toolbarRect.width / 2),
    window.innerWidth - toolbarRect.width - margin
  );
  const top = rect.top > toolbarRect.height + margin * 2
    ? rect.top - toolbarRect.height - margin
    : rect.bottom + margin;

  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${Math.min(Math.max(margin, top), window.innerHeight - toolbarRect.height - margin)}px`;
}

function setToolbarMode(mode) {
  const toolbar = ensureSelectionToolbar();
  toolbar.dataset.mode = mode;
  toolbar.querySelector(".selection-toolbar-remove").hidden = mode !== "highlight";
}

function ensureSelectionToolbar() {
  if (state.selectionToolbar) {
    return state.selectionToolbar;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "selection-toolbar";
  toolbar.hidden = true;

  HIGHLIGHT_COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.className = `selection-color selection-color-${color}`;
    button.type = "button";
    button.dataset.color = color;
    button.setAttribute("aria-label", `Выделить цветом: ${color}`);
    button.addEventListener("pointerdown", protectToolbarPointer);
    button.addEventListener("mousedown", protectToolbarPointer);
    button.addEventListener("touchstart", protectToolbarPointer, { passive: false });
    button.addEventListener("pointerup", (event) => {
      protectToolbarPointer(event);
      applyHighlightColor(color);
    });
    button.addEventListener("touchend", (event) => {
      protectToolbarPointer(event);
      applyHighlightColor(color);
    }, { passive: false });
    button.addEventListener("click", () => applyHighlightColor(color));
    toolbar.append(button);
  });

  const removeButton = document.createElement("button");
  removeButton.className = "selection-toolbar-remove";
  removeButton.type = "button";
  removeButton.textContent = "×";
  removeButton.title = "Убрать выделение";
  removeButton.setAttribute("aria-label", "Убрать выделение");
  removeButton.hidden = true;
  removeButton.addEventListener("pointerdown", protectToolbarPointer);
  removeButton.addEventListener("mousedown", protectToolbarPointer);
  removeButton.addEventListener("touchstart", protectToolbarPointer, { passive: false });
  removeButton.addEventListener("pointerup", (event) => {
    protectToolbarPointer(event);
    removeActiveHighlight();
  });
  removeButton.addEventListener("touchend", (event) => {
    protectToolbarPointer(event);
    removeActiveHighlight();
  }, { passive: false });
  removeButton.addEventListener("click", removeActiveHighlight);
  toolbar.append(removeButton);

  document.body.append(toolbar);
  state.selectionToolbar = toolbar;
  return toolbar;
}

function showToolbarForCurrentSelection() {
  const selectedRange = getPendingHighlightSelectionFromCurrentSelection();
  if (!selectedRange) {
    if (!state.activeHighlight) {
      hideSelectionToolbar();
    }
    return;
  }

  pendingHighlightSelection = selectedRange;
  state.activeHighlight = null;
  setToolbarMode("selection");
  positionToolbar(selectedRange.rect);
}

function applyHighlightColor(color) {
  if (!HIGHLIGHT_COLORS.includes(color)) {
    return;
  }

  const highlights = readLessonHighlights();
  if (state.activeHighlight) {
    const updated = highlights.map((highlight) =>
      highlight.id === state.activeHighlight.id ? { ...highlight, color } : highlight
    );
    writeLessonHighlights(updated);
  } else if (pendingHighlightSelection) {
    const selection = pendingHighlightSelection;
    if (
      !selection.blockId ||
      selection.startOffset === selection.endOffset ||
      !selection.selectedText.trim()
    ) {
      hideSelectionToolbar();
      return;
    }
    const nextHighlight = {
      id: makeHighlightId(),
      blockId: String(selection.blockId),
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      color,
    };
    const withoutOverlaps = highlights.filter(
      (highlight) =>
        highlight.blockId !== nextHighlight.blockId ||
        highlight.endOffset <= nextHighlight.startOffset ||
        highlight.startOffset >= nextHighlight.endOffset
    );
    writeLessonHighlights([...withoutOverlaps, nextHighlight]);
  }

  window.getSelection()?.removeAllRanges();
  hideSelectionToolbar();
  rerenderLessonTextBlocks();
}

function showToolbarForHighlight(highlightElement) {
  const highlights = readLessonHighlights();
  const highlight = highlights.find(
    (item) =>
      item.id === highlightElement.dataset.highlightId ||
      (
        item.blockId === highlightElement.dataset.blockId &&
        item.startOffset === Number(highlightElement.dataset.startOffset) &&
        item.endOffset === Number(highlightElement.dataset.endOffset) &&
        item.color === highlightElement.dataset.color
      )
  );
  if (!highlight) {
    return;
  }

  pendingHighlightSelection = null;
  state.activeHighlight = highlight;
  window.getSelection()?.removeAllRanges();
  setToolbarMode("highlight");
  positionToolbar(highlightElement.getBoundingClientRect());
}

function removeActiveHighlight() {
  if (!state.activeHighlight) {
    return;
  }
  const updated = readLessonHighlights().filter((highlight) => highlight.id !== state.activeHighlight.id);
  writeLessonHighlights(updated);
  hideSelectionToolbar();
  rerenderLessonTextBlocks();
}

function showMessage(title, message, actionLabel = "", action = null) {
  content.className = "content";
  content.replaceChildren();

  const block = document.createElement("section");
  block.className = "empty-state";

  const heading = document.createElement("strong");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = message;

  block.append(heading, text);

  if (actionLabel && action) {
    const button = document.createElement("button");
    button.className = "secondary-button";
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", action);
    block.append(button);
  }

  content.append(block);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Ошибка запроса: ${response.status}`);
  }
  return response.json();
}

async function loadModules() {
  state.modules = await fetchJson("/api/modules");
}

async function loadLessons(moduleId) {
  if (!state.lessonsByModule.has(moduleId)) {
    const lessons = await fetchJson(`/api/modules/${moduleId}/lessons`);
    state.lessonsByModule.set(moduleId, lessons);
  }
  return state.lessonsByModule.get(moduleId);
}

function getLessons(moduleId) {
  return state.lessonsByModule.get(moduleId) || [];
}

function getStepLabel(index) {
  return stepLabels[index] || `${index + 1}-я ступень`;
}

function getLessonPosition(moduleId, lessonId) {
  const moduleIndex = state.modules.findIndex((module) => module.id === moduleId);
  const lessons = getLessons(moduleId);
  const lessonIndex = lessons.findIndex((lesson) => lesson.id === lessonId);
  return { moduleIndex, lessonIndex };
}

async function findAdjacentLesson(direction) {
  const { moduleIndex, lessonIndex } = getLessonPosition(
    state.currentModuleId,
    state.currentLessonId
  );
  if (moduleIndex === -1 || lessonIndex === -1) {
    return null;
  }

  const currentLessons = getLessons(state.currentModuleId);
  const nextLessonIndex = lessonIndex + direction;
  if (currentLessons[nextLessonIndex]) {
    return { module: state.modules[moduleIndex], lesson: currentLessons[nextLessonIndex] };
  }

  let nextModuleIndex = moduleIndex + direction;
  while (state.modules[nextModuleIndex]) {
    const nextModule = state.modules[nextModuleIndex];
    const lessons = await loadLessons(nextModule.id);
    if (lessons.length > 0) {
      const lesson = direction > 0 ? lessons[0] : lessons[lessons.length - 1];
      return { module: nextModule, lesson };
    }
    nextModuleIndex += direction;
  }
  return null;
}

function createLessonRow(moduleId, lesson, index) {
  const button = document.createElement("button");
  button.className = "step-lesson";
  button.type = "button";
  button.addEventListener("click", () => renderLesson(moduleId, lesson.id));

  const number = document.createElement("span");
  number.className = "step-lesson-number";
  number.textContent = String(index + 1).padStart(2, "0");

  const title = document.createElement("span");
  title.className = "step-lesson-title";
  title.textContent = lesson.title;

  button.append(number, title);
  return button;
}

async function fillStepLessons(moduleElement, module) {
  const lessonList = moduleElement.querySelector(".step-lessons");
  lessonList.replaceChildren();

  try {
    const lessons = await loadLessons(module.id);
    if (lessons.length === 0) {
      const empty = document.createElement("p");
      empty.className = "step-empty";
      empty.textContent = "Уроков пока нет";
      lessonList.append(empty);
      return;
    }

    lessons.forEach((lesson, index) => {
      lessonList.append(createLessonRow(module.id, lesson, index));
    });
  } catch (error) {
    const message = document.createElement("p");
    message.className = "step-empty";
    message.textContent = error.message;
    lessonList.append(message);
  }
}

function createModuleStep(module, index) {
  const isExpanded = state.expandedModuleIds.has(module.id);
  const section = document.createElement("section");
  section.className = "course-step";
  section.dataset.moduleId = String(module.id);

  const toggle = document.createElement("button");
  toggle.className = "course-step-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", String(isExpanded));

  const titleGroup = document.createElement("span");
  titleGroup.className = "course-step-title-group";

  const label = document.createElement("span");
  label.className = "course-step-label";
  label.textContent = getStepLabel(index);

  const title = document.createElement("span");
  title.className = "course-step-title";
  title.textContent = module.title;

  const arrow = document.createElement("span");
  arrow.className = "course-step-arrow";
  arrow.textContent = isExpanded ? "↑" : "↓";
  arrow.setAttribute("aria-hidden", "true");

  titleGroup.append(label, title);
  toggle.append(titleGroup, arrow);

  const lessons = document.createElement("div");
  lessons.className = "step-lessons";
  lessons.hidden = !isExpanded;

  toggle.addEventListener("click", async () => {
    if (state.expandedModuleIds.has(module.id)) {
      state.expandedModuleIds.delete(module.id);
    } else {
      state.expandedModuleIds.add(module.id);
    }
    renderModuleSteps(false);
  });

  section.append(toggle, lessons);
  if (isExpanded) {
    fillStepLessons(section, module);
  }
  return section;
}

function createLandingImage(url, className, label) {
  const wrapper = document.createElement("div");
  wrapper.className = className;

  if (url) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = label;
    image.loading = "lazy";
    image.draggable = false;
    image.addEventListener("error", () => {
      wrapper.classList.add("is-placeholder");
      wrapper.replaceChildren(createLandingPlaceholder(label));
    });
    wrapper.append(image);
    return wrapper;
  }

  wrapper.classList.add("is-placeholder");
  wrapper.append(createLandingPlaceholder(label));
  return wrapper;
}

function createLandingPlaceholder(label) {
  const placeholder = document.createElement("div");
  placeholder.className = "landing-image-placeholder";

  const mark = document.createElement("span");
  mark.textContent = "PROTOCOL";

  const text = document.createElement("strong");
  text.textContent = label;

  placeholder.append(mark, text);
  return placeholder;
}

async function showModulesScreen() {
  await loadModules();
  renderModuleSteps();
}

async function continueCourseFromLanding() {
  const lastLesson = getLastLessonProgress();
  if (!lastLesson?.lessonId || !lastLesson.moduleId) {
    await showModulesScreen();
    return;
  }

  if (state.modules.length === 0) {
    await loadModules();
  }

  const moduleExists = state.modules.some((module) => module.id === lastLesson.moduleId);
  if (!moduleExists) {
    await showModulesScreen();
    return;
  }

  const lessons = await loadLessons(lastLesson.moduleId);
  const lessonExists = lessons.some((lesson) => lesson.id === lastLesson.lessonId);
  if (!lessonExists) {
    await showModulesScreen();
    return;
  }

  await renderLesson(lastLesson.moduleId, lastLesson.lessonId);
}

function renderLandingScreen() {
  hideSelectionToolbar();
  state.currentModuleId = null;
  state.currentLessonId = null;
  state.currentBlocks = [];
  setCourseHeaderVisible(false);
  syncBackButtons();

  const lastLesson = getLastLessonProgress();
  content.className = "content landing-screen";
  content.replaceChildren();

  const shell = document.createElement("section");
  shell.className = "landing-shell";

  const header = document.createElement("header");
  header.className = "landing-header";

  const brand = document.createElement("div");
  brand.className = "landing-brand";

  const logo = document.createElement("div");
  logo.className = "landing-logo";
  logo.textContent = "P0";

  const brandText = document.createElement("div");
  const brandTitle = document.createElement("strong");
  brandTitle.textContent = COURSE_LANDING_CONFIG.brandTitle;
  const brandSubtitle = document.createElement("span");
  brandSubtitle.textContent = COURSE_LANDING_CONFIG.brandSubtitle;
  brandText.append(brandTitle, brandSubtitle);
  brand.append(logo, brandText);

  const headerBadge = document.createElement("span");
  headerBadge.className = "landing-header-badge";
  headerBadge.textContent = "mini app";
  header.append(brand, headerBadge);

  const hero = document.createElement("section");
  hero.className = "landing-hero";
  const heroImage = createLandingImage(
    COURSE_LANDING_CONFIG.heroImageUrl,
    "landing-hero-image",
    COURSE_LANDING_CONFIG.heroKicker
  );

  const heroCopy = document.createElement("div");
  heroCopy.className = "landing-hero-copy";
  const heroKicker = document.createElement("span");
  heroKicker.textContent = COURSE_LANDING_CONFIG.heroKicker;
  const heroTitle = document.createElement("h2");
  heroTitle.textContent = COURSE_LANDING_CONFIG.heroTitle;
  const heroDescription = document.createElement("p");
  heroDescription.textContent = COURSE_LANDING_CONFIG.heroDescription;
  heroCopy.append(heroKicker, heroTitle, heroDescription);
  hero.append(heroImage, heroCopy);

  const products = document.createElement("section");
  products.className = "landing-products";

  const productsTitle = document.createElement("h2");
  productsTitle.textContent = "Продукты";

  const tabs = document.createElement("div");
  tabs.className = "landing-tabs";
  const ownTab = document.createElement("button");
  ownTab.type = "button";
  ownTab.className = "landing-tab is-active";
  ownTab.textContent = "Ваши продукты";
  const allTab = document.createElement("button");
  allTab.type = "button";
  allTab.className = "landing-tab";
  allTab.textContent = "Все продукты";
  tabs.append(ownTab, allTab);

  const productCard = document.createElement("article");
  productCard.className = "landing-product-card";

  const productImage = createLandingImage(
    COURSE_LANDING_CONFIG.productImageUrl,
    "landing-product-image",
    COURSE_LANDING_CONFIG.productTitle
  );

  const productBody = document.createElement("div");
  productBody.className = "landing-product-body";

  const productTitle = document.createElement("h3");
  productTitle.textContent = COURSE_LANDING_CONFIG.productTitle;

  const productDescription = document.createElement("p");
  productDescription.textContent = COURSE_LANDING_CONFIG.productDescription;

  const progress = document.createElement("p");
  progress.className = "landing-product-progress";
  progress.textContent = lastLesson?.lessonTitle
    ? `Продолжить: ${lastLesson.lessonTitle}`
    : "Начать курс";

  const productMeta = document.createElement("div");
  productMeta.className = "landing-product-meta";
  const price = document.createElement("span");
  price.textContent = COURSE_LANDING_CONFIG.productPrice;

  const continueButton = document.createElement("button");
  continueButton.className = "landing-continue-button";
  continueButton.type = "button";
  continueButton.textContent = COURSE_LANDING_CONFIG.continueButtonText;
  continueButton.addEventListener("click", () => {
    continueCourseFromLanding().catch((error) => {
      showMessage("Не удалось продолжить", error.message, "Все ступени", showModulesScreen);
    });
  });

  productMeta.append(price, continueButton);
  productBody.append(productTitle, productDescription, progress, productMeta);
  productCard.append(productImage, productBody);

  const search = document.createElement("label");
  search.className = "landing-search";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = COURSE_LANDING_CONFIG.searchPlaceholder;
  search.append(searchInput);

  const allStepsButton = document.createElement("button");
  allStepsButton.className = "landing-all-steps";
  allStepsButton.type = "button";
  allStepsButton.textContent = "Все ступени";
  allStepsButton.addEventListener("click", () => {
    showModulesScreen().catch((error) => {
      showMessage("Не удалось загрузить ступени", error.message, "Повторить", showModulesScreen);
    });
  });

  products.append(productsTitle, tabs, productCard, search, allStepsButton);

  const footer = document.createElement("footer");
  footer.className = "landing-footer";
  footer.append(
    document.createTextNode(COURSE_LANDING_CONFIG.authorName),
    document.createElement("span"),
    document.createTextNode("Политика конфиденциальности"),
    document.createElement("span"),
    document.createTextNode("Договор оферты")
  );

  shell.append(header, hero, products, footer);
  content.append(shell);
}

function renderModuleSteps(resetLessonState = true) {
  if (resetLessonState) {
    state.currentModuleId = null;
    state.currentLessonId = null;
    state.currentBlocks = [];
  }
  hideSelectionToolbar();
  content.className = "content course-steps";
  content.replaceChildren();
  setHeader("protocol", "Ступени курса", "Раскройте модуль и выберите урок.");

  if (state.modules.length === 0) {
    showMessage(
      "Курс пока пуст",
      "Добавьте первый модуль и урок через админ-панель, затем обновите эту страницу."
    );
    syncBackButtons();
    return;
  }

  state.modules.forEach((module, index) => {
    content.append(createModuleStep(module, index));
  });
  syncBackButtons();
}

async function renderModules() {
  try {
    await loadModules();
    renderModuleSteps();
  } catch (error) {
    showMessage("Не удалось загрузить курс", error.message, "Повторить", renderModules);
    syncBackButtons();
  }
}

function renderParagraphs(container, text) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  paragraphs.forEach((paragraph) => {
    const paragraphElement = document.createElement("p");
    paragraphElement.textContent = paragraph;
    container.append(paragraphElement);
  });
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v") || parsed.pathname.split("/").pop();
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
    if (parsed.hostname === "youtu.be") {
      const videoId = parsed.pathname.replace("/", "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
  } catch {
    return "";
  }
  return "";
}

function appendTextBlock(article, block) {
  const blockElement = document.createElement("section");
  blockElement.className = "lesson-block lesson-block-text lesson-text-block";
  blockElement.dataset.blockId = block.highlightBlockId || getBlockStorageId(block);
  blockElement.dataset.lessonId = String(state.currentLessonId);
  blockElement.dataset.rawText = block.rawText ?? String(block.content || "");
  renderTextBlockContent(blockElement, block);
  article.append(blockElement);
}

function appendImageBlock(article, block) {
  const image = document.createElement("img");
  image.className = "lesson-image";
  image.src = block.content;
  image.alt = "";
  image.loading = "lazy";
  image.draggable = false;
  article.append(image);
}

function appendVideoBlock(article, block) {
  const embedUrl = getYouTubeEmbedUrl(block.content);
  if (embedUrl) {
    const frameWrap = document.createElement("div");
    frameWrap.className = "lesson-video-frame";
    const iframe = document.createElement("iframe");
    iframe.src = embedUrl;
    iframe.title = "Видео урока";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    frameWrap.append(iframe);
    article.append(frameWrap);
    return;
  }

  const link = document.createElement("a");
  link.className = "primary-button lesson-video-link";
  link.href = block.content;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Открыть видео";
  article.append(link);
}

function appendLessonBlock(article, block) {
  if (block.type === "image") {
    appendImageBlock(article, block);
    return;
  }
  if (block.type === "video") {
    appendVideoBlock(article, block);
    return;
  }
  appendTextBlock(article, block);
}

async function renderLesson(moduleId, lessonId) {
  const module = state.modules.find((item) => item.id === moduleId);
  state.currentModuleId = moduleId;
  state.currentLessonId = lessonId;
  state.currentBlocks = [];
  hideSelectionToolbar();
  content.className = "content";
  content.replaceChildren();
  setHeader(module?.title || "Урок", "Загрузка урока…", "Подождите несколько секунд.");

  try {
    await loadLessons(moduleId);
    const [lesson, blocks] = await Promise.all([
      fetchJson(`/api/lessons/${lessonId}`),
      fetchJson(`/api/lessons/${lessonId}/blocks`),
    ]);
    state.currentBlocks = blocks.map((block, index) => ({
      ...block,
      rawText: String(block.content || ""),
      highlightBlockId: getBlockStorageId(block, index),
    }));
    saveLastLessonProgress(moduleId, lesson);
    setHeader(lesson.module_title || module?.title || "Урок", lesson.title, "Читайте в удобном темпе.");

    const article = document.createElement("article");
    article.className = "lesson";
    if (blocks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "В уроке пока нет содержимого.";
      article.append(empty);
    } else {
      state.currentBlocks.forEach((block) => appendLessonBlock(article, block));
    }

    const navigation = document.createElement("div");
    navigation.className = "lesson-navigation";

    const previous = await findAdjacentLesson(-1);
    const next = await findAdjacentLesson(1);

    if (previous) {
      const previousButton = document.createElement("button");
      previousButton.className = "secondary-button";
      previousButton.type = "button";
      previousButton.textContent = "← Предыдущий урок";
      previousButton.addEventListener("click", () =>
        renderLesson(previous.module.id, previous.lesson.id)
      );
      navigation.append(previousButton);
    }

    if (next) {
      const nextButton = document.createElement("button");
      nextButton.className = "primary-button";
      nextButton.type = "button";
      nextButton.textContent = "Следующий урок →";
      nextButton.addEventListener("click", () => renderLesson(next.module.id, next.lesson.id));
      navigation.append(nextButton);
    }

    content.append(article);
    if (navigation.children.length > 0) {
      content.append(navigation);
    }
  } catch (error) {
    showMessage("Не удалось открыть урок", error.message, "Вернуться к ступеням", renderModules);
  }
  syncBackButtons();
}

function goBack() {
  state.currentModuleId = null;
  state.currentLessonId = null;
  state.currentBlocks = [];
  renderModuleSteps();
}

backButton.addEventListener("click", goBack);
telegram?.BackButton?.onClick(goBack);
configureTelegramWebApp();

document.addEventListener("copy", blockProtectedLessonEvent);
document.addEventListener("cut", blockProtectedLessonEvent);
document.addEventListener("dragstart", handleProtectedDragStart);
document.addEventListener("keydown", handleProtectedKeydown);

document.addEventListener("selectionchange", () => {
  window.setTimeout(showToolbarForCurrentSelection, 0);
});
document.addEventListener("mouseup", showToolbarForCurrentSelection);
document.addEventListener("keyup", showToolbarForCurrentSelection);
document.addEventListener("touchend", () => {
  window.setTimeout(showToolbarForCurrentSelection, 100);
});
document.addEventListener("scroll", hideSelectionToolbar, true);
document.addEventListener("click", (event) => {
  if (event.target.closest?.(".selection-toolbar")) {
    return;
  }

  const highlight = event.target.closest?.(".highlight");
  if (highlight?.closest?.(".lesson-text-block")) {
    event.preventDefault();
    showToolbarForHighlight(highlight);
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    hideSelectionToolbar();
  }
});

async function renderApp() {
  try {
    await loadModules();
    renderLandingScreen();
  } catch (error) {
    showMessage("Не удалось загрузить курс", error.message, "Повторить", renderApp);
    syncBackButtons();
  }
}

renderApp();
