"use strict";

const courseModules = [
  {
    id: "focus-basics",
    title: "Осознанный фокус",
    description: "Как выбирать главное и не распыляться в течение дня.",
    lessons: [
      {
        id: "one-priority",
        title: "Одна главная задача",
        summary: "Почему один ясный приоритет сильнее длинного списка дел.",
        content:
          "Фокус начинается не с таймера, а с выбора. Когда все задачи объявлены одинаково важными, внимание постоянно переключается и устает.\n\nВыберите один результат, после которого день уже можно считать полезным. Сформулируйте его как конкретное действие: не «заняться проектом», а «подготовить и отправить первую версию». Остальные дела остаются в списке, но не конкурируют за первое место.",
      },
      {
        id: "small-steps",
        title: "Три маленьких шага",
        summary: "Как превратить большую задачу в понятное начало.",
        content:
          "Большая задача пугает, пока у нее нет первого физического действия. Разделите ее на три шага, каждый из которых можно начать без дополнительного планирования.\n\nХороший шаг отвечает на вопрос «что именно я сделаю?». Например: открыть документ, составить пять тезисов, написать первый абзац. Если шаг все еще хочется отложить, сделайте его еще меньше.",
      },
    ],
  },
  {
    id: "deep-work",
    title: "Спокойная работа",
    description: "Простые условия для концентрации без героических усилий.",
    lessons: [
      {
        id: "remove-noise",
        title: "Убрать лишний шум",
        summary: "Подготовьте окружение до начала фокус-сессии.",
        content:
          "Сила воли быстро заканчивается, а окружение работает постоянно. Перед началом закройте лишние вкладки, выключите уведомления и оставьте рядом только то, что нужно для текущего шага.\n\nТакое приготовление занимает пару минут, но уменьшает число решений во время работы. Чем меньше поводов отвлечься видно перед глазами, тем легче вернуться к задаче после случайной мысли.",
      },
      {
        id: "focus-session",
        title: "Короткая фокус-сессия",
        summary: "Работайте ограниченный отрезок времени с ясным результатом.",
        content:
          "Назначьте короткий отрезок — например, 25 минут — и заранее определите, что должно быть готово к его концу. Таймер нужен не для давления, а для понятной границы.\n\nВо время сессии записывайте посторонние мысли на отдельный лист вместо того, чтобы сразу на них реагировать. После сигнала сделайте паузу и решите, нужна ли еще одна сессия.",
      },
    ],
  },
  {
    id: "daily-review",
    title: "Завершение дня",
    description: "Как подвести итог без чувства вины и сохранить ясность.",
    lessons: [
      {
        id: "honest-check",
        title: "Честная проверка",
        summary: "Отделяйте результат от самооценки.",
        content:
          "Вечерняя проверка отвечает на простой вопрос: получен ли выбранный результат? Ответ «нет» не делает день провальным и не требует оправданий. Он дает данные для следующего решения.\n\nЕсли задача выполнена, зафиксируйте, что помогло. Если нет — определите препятствие: задача была слишком большой, день изменился или внимание ушло в другое место. Это полезнее общей критики себя.",
      },
      {
        id: "close-loop",
        title: "Закрыть незавершенное",
        summary: "Осознанно завершите, упростите или перенесите задачу.",
        content:
          "Незавершенная задача продолжает занимать внимание, если у нее нет следующего решения. В конце дня выберите один вариант: завершить маленький остаток, удалить потерявшую смысл задачу или назначить конкретный следующий шаг на завтра.\n\nЗапишите решение там, где увидите его утром. После этого работу можно отпустить: вам не нужно удерживать ее в памяти весь вечер.",
      },
    ],
  },
];

const telegram = window.Telegram?.WebApp;
const content = document.querySelector("#content");
const pageTitle = document.querySelector("#pageTitle");
const pageSubtitle = document.querySelector("#pageSubtitle");
const eyebrow = document.querySelector("#eyebrow");
const backButton = document.querySelector("#backButton");

const state = {
  moduleId: null,
  lessonId: null,
};

function setHeader(label, title, subtitle) {
  eyebrow.textContent = label;
  pageTitle.textContent = title;
  pageSubtitle.textContent = subtitle;
}

function syncBackButtons() {
  const canGoBack = state.moduleId !== null;
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

function createCard(title, description, meta, onClick) {
  const button = document.createElement("button");
  button.className = "card";
  button.type = "button";
  button.addEventListener("click", onClick);

  const titleElement = document.createElement("span");
  titleElement.className = "card-title";
  titleElement.textContent = title;

  const descriptionElement = document.createElement("span");
  descriptionElement.className = "card-description";
  descriptionElement.textContent = description;

  const metaElement = document.createElement("span");
  metaElement.className = "card-meta";
  metaElement.textContent = meta;

  const arrow = document.createElement("span");
  arrow.className = "card-arrow";
  arrow.textContent = "›";
  arrow.setAttribute("aria-hidden", "true");

  button.append(titleElement, descriptionElement, metaElement, arrow);
  return button;
}

function renderModules() {
  state.moduleId = null;
  state.lessonId = null;
  content.className = "content cards-grid";
  content.replaceChildren();
  setHeader("Мини-курс", "Модули курса", "Выберите модуль, чтобы увидеть уроки.");

  courseModules.forEach((module) => {
    const lessonsLabel = `${module.lessons.length} урока`;
    content.append(
      createCard(module.title, module.description, lessonsLabel, () => renderLessons(module))
    );
  });
  syncBackButtons();
}

function renderLessons(module) {
  state.moduleId = module.id;
  state.lessonId = null;
  content.className = "content";
  content.replaceChildren();
  setHeader("Модуль", module.title, module.description);

  module.lessons.forEach((lesson, index) => {
    content.append(
      createCard(lesson.title, lesson.summary, `Урок ${index + 1}`, () => {
        renderLesson(module, lesson);
      })
    );
  });
  syncBackButtons();
}

function renderLesson(module, lesson) {
  state.moduleId = module.id;
  state.lessonId = lesson.id;
  content.className = "content";
  content.replaceChildren();
  setHeader(module.title, lesson.title, lesson.summary);

  const article = document.createElement("article");
  article.className = "lesson";
  lesson.content.split("\n\n").forEach((paragraph) => {
    const paragraphElement = document.createElement("p");
    paragraphElement.textContent = paragraph;
    article.append(paragraphElement);
  });
  content.append(article);
  syncBackButtons();
}

function goBack() {
  const module = courseModules.find((item) => item.id === state.moduleId);
  if (state.lessonId !== null && module) {
    renderLessons(module);
    return;
  }
  renderModules();
}

backButton.addEventListener("click", goBack);
telegram?.BackButton?.onClick(goBack);
telegram?.ready();
telegram?.expand();

renderModules();
