const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'subjects', label: 'Subjects', icon: 'book' },
  { id: 'sessions', label: 'Sessions', icon: 'clock' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

const PAGE_META = {
  dashboard: {
    eyebrow: 'StudySync workspace',
    title: 'Dashboard'
  },
  subjects: {
    eyebrow: 'Subjects and planner',
    title: 'Subjects'
  },
  sessions: {
    eyebrow: 'Deep work tracking',
    title: 'Sessions'
  },
  progress: {
    eyebrow: 'Momentum and analytics',
    title: 'Progress'
  },
  settings: {
    eyebrow: 'Personalize your system',
    title: 'Settings'
  }
};

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const state = {
  data: null,
  view: localStorage.getItem('studysync:view') || 'dashboard',
  modal: null,
  mobileNavOpen: false,
  timerIntervalId: null,
  focusSyncInFlight: false
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  renderLoading();
  bindGlobalEvents();
  startTimerLoop();

  try {
    await refreshData();
  } catch (error) {
    renderError(error.message);
  }
}

function bindGlobalEvents() {
  document.body.addEventListener('click', handleClick);
  document.body.addEventListener('submit', handleSubmit);
  document.body.addEventListener('change', handleChange);

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && state.data) {
      try {
        await refreshData({ preserveModal: true, silent: true });
      } catch (error) {
        showToast(error.message, 'error');
      }
    }
  });
}

function startTimerLoop() {
  if (state.timerIntervalId) {
    clearInterval(state.timerIntervalId);
  }

  state.timerIntervalId = window.setInterval(async () => {
    if (!state.data) {
      return;
    }

    updateLiveFocusWidgets();

    const timer = getLiveFocusTimer();
    if (
      timer.status === 'running' &&
      timer.remainingSec <= 0 &&
      !state.focusSyncInFlight
    ) {
      state.focusSyncInFlight = true;
      try {
        await refreshData({ silent: true });
        showToast('Focus session saved automatically.', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        state.focusSyncInFlight = false;
      }
    }
  }, 1000);
}

async function refreshData(options = {}) {
  const modal = options.preserveModal ? state.modal : null;
  const data = await api('/api/bootstrap');
  state.data = data;
  state.modal = modal;
  renderApp();
  updateLiveFocusWidgets();

  if (!options.silent && options.toastMessage) {
    showToast(options.toastMessage, 'success');
  }
}

async function api(url, options = {}) {
  const config = {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json'
    }
  };

  if (options.body !== undefined) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }

  const fetchUrl = url.startsWith('/') ? url.slice(1) : url;

  try {
    const response = await fetch(fetchUrl, config);
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await response.json() : {};

    if (!response.ok) {
      return staticApi(url, options);
    }

    return payload;
  } catch (error) {
    return staticApi(url, options);
  }
}

function staticApi(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const pathname = new URL(url, 'https://example.com').pathname;

  if (method === 'GET' && pathname === '/api/bootstrap') {
    return Promise.resolve(buildStaticBootstrap());
  }

  if (method === 'GET' && pathname === '/api/subjects') {
    return Promise.resolve([]);
  }

  if (method === 'POST' && pathname === '/api/subjects') {
    return Promise.resolve({ id: 1 });
  }

  if (method === 'PUT' && pathname.startsWith('/api/subjects/')) {
    return Promise.resolve({ ok: true });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/subjects/')) {
    return Promise.resolve({ ok: true });
  }

  if (method === 'GET' && pathname === '/api/tasks') {
    return Promise.resolve([]);
  }

  if (method === 'POST' && pathname === '/api/tasks') {
    return Promise.resolve({ id: 1 });
  }

  if ((method === 'PUT' || method === 'DELETE') && pathname.startsWith('/api/tasks/')) {
    return Promise.resolve({ ok: true });
  }

  if (method === 'PATCH' && pathname.match(/^\/api\/tasks\/\d+\/toggle$/)) {
    return Promise.resolve({ ok: true });
  }

  if (method === 'GET' && pathname === '/api/sessions') {
    return Promise.resolve([]);
  }

  if (method === 'POST' && pathname === '/api/sessions') {
    return Promise.resolve({ id: 1 });
  }

  if (method === 'POST' && pathname === '/api/mark-studied') {
    return Promise.resolve({ ok: true, date: getTodayKey() });
  }

  if (method === 'GET' && pathname === '/api/focus-timer') {
    return Promise.resolve(buildStaticFocusTimer());
  }

  if (
    method === 'POST' &&
    ['/api/focus-timer/start', '/api/focus-timer/pause', '/api/focus-timer/resume', '/api/focus-timer/reset'].includes(pathname)
  ) {
    return Promise.resolve(buildStaticFocusTimer(pathname));
  }

  if (method === 'PUT' && pathname === '/api/settings') {
    return Promise.resolve({ ok: true });
  }

  return Promise.resolve({ ok: true });
}

function buildStaticBootstrap() {
  const today = getTodayKey();
  const settings = {
    studentName: 'StudySync User',
    weeklyGoalHours: 10,
    focusDurationMinutes: 25
  };
  const focusTimer = buildStaticFocusTimer();
  const tasks = [];
  const subjects = [];
  const sessions = [];
  const weeklyHours = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(shiftDateKey(today, -6), index);
    return {
      date,
      label: formatWeekday(date),
      hours: 0,
      minutes: 0
    };
  });
  const streakHeatmap = Array.from({ length: 14 }, (_, index) => {
    const date = shiftDateKey(shiftDateKey(today, -13), index);
    return {
      date,
      label: formatWeekday(date),
      studied: false,
      minutes: 0
    };
  });
  const stats = {
    weeklyHours: 0,
    weeklyGoalHours: settings.weeklyGoalHours,
    progressPercent: 0,
    streakDays: 0,
    totalSessions: 0,
    totalPoints: 0,
    completedTasks: 0,
    pendingTasks: 0,
    studiedToday: false,
    hoursRemaining: settings.weeklyGoalHours,
    totalHours: 0
  };
  const badges = [];
  return {
    meta: {
      appName: 'StudySync',
      today,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      formattedDate: formatReadableDate(today),
      greeting: 'Welcome',
      quote: 'StudySync is ready for GitHub Pages.',
      message: 'This static mode is enabled because the backend is unavailable on GitHub Pages.'
    },
    settings,
    stats,
    subjects,
    tasks,
    sessions,
    planner: buildStaticPlanner(tasks),
    focusTimer,
    analytics: {
      weeklyHours,
      taskStatus: { completed: 0, pending: 0 },
      streakHeatmap,
      badges,
      subjectActivity: []
    },
    insights: {
      weakSubjects: [],
      todayTasks: [],
      badgeCount: 0,
      nextMilestone: 'Add your first task to get started.',
      streakPrompt: 'Track your first study session and build momentum.'
    }
  };
}

function buildStaticPlanner(tasks) {
  const today = getTodayKey();
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(today, index);
    return {
      date,
      dayName: formatWeekday(date, 'long'),
      shortLabel: formatReadableDate(date, {
        weekday: null,
        month: 'short',
        day: 'numeric',
        year: null
      }),
      tasks: tasks.filter((task) => task.plannedDate === date)
    };
  });
}

function buildStaticFocusTimer(pathname) {
  const timer = {
    status: 'idle',
    durationSec: 1500,
    elapsedSec: 0,
    startedAt: null,
    subjectId: null,
    label: 'Focus Session',
    autoSavedSessionId: null,
    lastCompletedAt: null,
    updatedAt: new Date().toISOString()
  };

  if (pathname === '/api/focus-timer/start') {
    timer.status = 'running';
    timer.startedAt = new Date().toISOString();
  }

  if (pathname === '/api/focus-timer/pause') {
    timer.status = 'paused';
    timer.elapsedSec = 60;
  }

  if (pathname === '/api/focus-timer/resume') {
    timer.status = 'running';
    timer.startedAt = new Date().toISOString();
  }

  return timer;
}

function getTodayKey() {
  return formatDateKey(new Date());
}

function formatDateKey(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(dateKey, deltaDays) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return formatDateKey(date);
}

function formatReadableDate(dateKey, options = {}) {
  const formatOptions = {
    timeZone: TIME_ZONE
  };

  if (options.weekday !== null) {
    formatOptions.weekday = options.weekday || 'long';
  }
  if (options.month !== null) {
    formatOptions.month = options.month || 'long';
  }
  if (options.day !== null) {
    formatOptions.day = options.day || 'numeric';
  }
  if (options.year !== null) {
    formatOptions.year = options.year || 'numeric';
  }

  return new Intl.DateTimeFormat('en-US', formatOptions).format(
    new Date(`${dateKey}T12:00:00`)
  );
}

function formatWeekday(dateKey, weekday = 'short') {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday
  }).format(new Date(`${dateKey}T12:00:00`));
}

function renderLoading() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-shell">
      <main class="main">
        <section class="page">
          <div class="hero-card card">
            <div class="stack">
              <p class="eyebrow">StudySync workspace</p>
              <h3>Preparing your study system...</h3>
              <p class="muted">Loading subjects, streaks, planner items, and focus timer state.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}

function renderError(message) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-shell">
      <main class="main">
        <section class="page">
          <div class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">StudySync workspace</p>
                <h3 class="card-title">The app could not load</h3>
                <p class="card-subtitle">${escapeHtml(message)}</p>
              </div>
              <button class="button primary" data-action="retry-load">Try again</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}

function renderApp() {
  if (!state.data) {
    renderLoading();
    return;
  }

  const app = document.getElementById('app');
  const pageMeta = PAGE_META[state.view] || PAGE_META.dashboard;
  const focus = getLiveFocusTimer();

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="overlay ${state.mobileNavOpen ? 'open' : ''}" data-action="close-nav"></div>
      <main class="main">
        <header class="topbar">
          <div class="topbar-copy">
            <p class="eyebrow">${escapeHtml(pageMeta.eyebrow)}</p>
            <h2>${escapeHtml(pageMeta.title)}</h2>
          </div>
          <div class="topbar-actions">
            <button class="icon-button mobile-only" data-action="toggle-nav" aria-label="Toggle navigation">
              ${icon('menu')}
            </button>
            <div class="chip ${focus.status === 'running' ? 'primary' : ''}">
              ${icon('spark')}
              <span>${renderGlobalFocusLabel(focus)}</span>
            </div>
            <div class="chip">
              ${icon('points')}
              <span>${state.data.stats.totalPoints} pts</span>
            </div>
          </div>
        </header>
        ${renderCurrentPage()}
      </main>
    </div>
    ${renderModal()}
  `;
}

function renderSidebar() {
  return `
    <aside class="sidebar ${state.mobileNavOpen ? 'open' : ''}">
      <div class="brand">
        <div class="brand-badge">${icon('sync')}</div>
        <div class="brand-copy">
          <h1>StudySync</h1>
          <p>Keep your routine steady.</p>
        </div>
      </div>
      <nav class="sidebar-nav">
        ${NAV_ITEMS.map((item) => {
          const active = item.id === state.view ? 'active' : '';
          return `
            <button class="nav-item ${active}" data-action="set-view" data-view="${item.id}">
              <span class="nav-icon">${icon(item.icon)}</span>
              <span>${escapeHtml(item.label)}</span>
            </button>
          `;
        }).join('')}
      </nav>
      <div class="sidebar-footer">
        <h2>${state.data.stats.progressPercent}% of weekly goal</h2>
        <p>${escapeHtml(state.data.insights.nextMilestone)}</p>
      </div>
    </aside>
  `;
}

function renderCurrentPage() {
  switch (state.view) {
    case 'subjects':
      return renderSubjectsPage();
    case 'sessions':
      return renderSessionsPage();
    case 'progress':
      return renderProgressPage();
    case 'settings':
      return renderSettingsPage();
    case 'dashboard':
    default:
      return renderDashboardPage();
  }
}

function renderDashboardPage() {
  const { meta, stats, insights } = state.data;
  const todayTasks = insights.todayTasks.slice(0, 4);

  return `
    <section class="page">
      <div class="hero-card card">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(meta.formattedDate)}</p>
          <h3>${escapeHtml(meta.greeting)}, ${escapeHtml(state.data.settings.studentName)}</h3>
          <p>${escapeHtml(meta.message)}</p>
          <div class="hero-actions">
            <button class="button primary" data-action="open-modal" data-modal="session">Log Study Session</button>
            <button class="button secondary" data-action="start-quick-focus">Start Focus Session</button>
            <button
              class="button ghost"
              data-action="mark-studied"
              ${stats.studiedToday ? 'disabled' : ''}
            >
              ${stats.studiedToday ? 'Studied Today Marked' : 'Mark Studied Today'}
            </button>
          </div>
        </div>
        <div class="hero-panel">
          <div>
            <div class="quote-mark">"</div>
            <p>${escapeHtml(meta.quote.text)}</p>
          </div>
          <div>
            <strong>${escapeHtml(meta.quote.author)}</strong>
            <p>${escapeHtml(insights.streakPrompt)}</p>
          </div>
        </div>
      </div>

      <div class="stats-grid">
        ${renderStatCard('Weekly Hours', `${stats.weeklyHours}h`, `${stats.hoursRemaining}h left to hit goal`, 'success')}
        ${renderStatCard('Study Streak', `${stats.streakDays} day${stats.streakDays === 1 ? '' : 's'}`, 'Keep showing up every day.', stats.streakDays > 0 ? 'success' : 'warning')}
        ${renderStatCard('Total Sessions', `${stats.totalSessions}`, 'Every block adds up.', 'warning')}
        ${renderStatCard('Tasks Complete', `${stats.completedTasks}`, `${stats.pendingTasks} task${stats.pendingTasks === 1 ? '' : 's'} still pending`, stats.pendingTasks ? 'warning' : 'success')}
        <div class="card ring-card">
          ${renderRing(stats.progressPercent, `${stats.progressPercent}%`, 'Goal progress')}
          <div class="stack">
            <div>
              <p class="eyebrow">Progress circle</p>
              <h3 class="card-title">Weekly consistency</h3>
            </div>
            <p class="card-subtitle">You are working toward a ${stats.weeklyGoalHours} hour weekly goal. ${escapeHtml(insights.nextMilestone)}</p>
            <div class="inline-actions">
              <div class="chip">${icon('target')} ${stats.weeklyGoalHours}h goal</div>
              <div class="chip">${icon('badge')} ${insights.badgeCount} badges</div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card focus-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Focus timer</h3>
              <p class="card-subtitle">Runs across views and resumes exactly where you left it.</p>
            </div>
          </div>
          ${renderFocusWidget('dashboard')}
        </div>
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Weekly snapshot</h3>
              <p class="card-subtitle">A quick look at how this week is shaping up.</p>
            </div>
          </div>
          ${renderWeeklySummaryList()}
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Weak subjects spotlight</h3>
              <p class="card-subtitle">Spend extra attention where momentum is lowest.</p>
            </div>
            <button class="button ghost small" data-action="set-view" data-view="subjects">Open planner</button>
          </div>
          ${renderWeakSubjects()}
        </div>
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Today's study tasks</h3>
              <p class="card-subtitle">Clear these and your day stays organized.</p>
            </div>
            <button class="button ghost small" data-action="open-modal" data-modal="task">Add task</button>
          </div>
          ${todayTasks.length ? `
            <div class="today-list">
              ${todayTasks.map((task) => renderTaskRow(task)).join('')}
            </div>
          ` : renderEmptyState('No tasks planned for today yet.', 'Add a task to shape the day.')}
        </div>
      </div>
    </section>
  `;
}

function renderSubjectsPage() {
  return `
    <section class="page">
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Subjects</h3>
            <p class="card-subtitle">Track the classes that matter most and spot which ones need more attention.</p>
          </div>
          <div class="header-actions">
            <button class="button primary" data-action="open-modal" data-modal="subject">Add subject</button>
            <button class="button secondary" data-action="open-modal" data-modal="task">Add study task</button>
          </div>
        </div>
        <div class="subject-grid">
          ${state.data.subjects.map((subject) => renderSubjectCard(subject)).join('')}
        </div>
      </div>

      <div class="grid-2">
        <div class="card planner-board">
          <div class="card-header">
            <div>
              <h3 class="card-title">Planner</h3>
              <p class="card-subtitle">A simple timetable for the next seven days.</p>
            </div>
          </div>
          <div class="planner-columns">
            ${state.data.planner.map((day) => renderPlannerColumn(day)).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Low activity subjects</h3>
              <p class="card-subtitle">These subjects could use a dedicated block this week.</p>
            </div>
          </div>
          ${renderWeakSubjects()}
        </div>
      </div>
    </section>
  `;
}

function renderSessionsPage() {
  return `
    <section class="page">
      <div class="grid-2">
        <div class="card timer-studio">
          <div class="card-header">
            <div>
              <h3 class="card-title">Focus Studio</h3>
              <p class="card-subtitle">Start, pause, resume, and autosave focus sessions without losing state.</p>
            </div>
          </div>
          ${renderFocusWidget('sessions')}
        </div>
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Manual session log</h3>
              <p class="card-subtitle">Add offline study blocks or review sessions in a few seconds.</p>
            </div>
            <button class="button primary small" data-action="open-modal" data-modal="session">Log session</button>
          </div>
          <div class="stack">
            <div class="simple-list-item">
              <div>
                <strong>${state.data.stats.totalSessions}</strong>
                <div class="muted">Total recorded sessions</div>
              </div>
              <div>
                <strong>${state.data.stats.totalHours}h</strong>
                <div class="muted">Total study hours</div>
              </div>
            </div>
            <div class="simple-list-item">
              <div>
                <strong>${state.data.analytics.weeklyHours.filter((day) => day.hours > 0).length}</strong>
                <div class="muted">Active study days this week</div>
              </div>
              <div>
                <strong>${state.data.analytics.taskStatus.completed}</strong>
                <div class="muted">Tasks completed</div>
              </div>
            </div>
            <div class="divider"></div>
            <p class="muted">Focus sessions are stored automatically when the timer ends, so your session history stays complete even after switching pages or refreshing the app.</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Session history</h3>
            <p class="card-subtitle">Every recorded study block, ordered from newest to oldest.</p>
          </div>
        </div>
        ${
          state.data.sessions.length
            ? `<div class="session-list">${state.data.sessions.map((session) => renderSessionRow(session)).join('')}</div>`
            : renderEmptyState('No sessions recorded yet.', 'Use the timer or log one manually to start building history.')
        }
      </div>
    </section>
  `;
}

function renderProgressPage() {
  const { weeklyHours, taskStatus, streakHeatmap, badges, subjectActivity } = state.data.analytics;

  return `
    <section class="page">
      <div class="grid-2">
        <div class="card chart-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Weekly study hours</h3>
              <p class="card-subtitle">See how each day contributed to your overall momentum.</p>
            </div>
          </div>
          ${renderWeeklyChart(weeklyHours)}
        </div>
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Goals and completion</h3>
              <p class="card-subtitle">Track hours, completed tasks, and the remaining workload.</p>
            </div>
          </div>
          <div class="grid-2">
            <div class="card soft">
              ${renderRing(state.data.stats.progressPercent, `${state.data.stats.progressPercent}%`, 'Weekly goal')}
              <p class="card-subtitle">${state.data.stats.weeklyHours} of ${state.data.stats.weeklyGoalHours} hours completed.</p>
            </div>
            <div class="card soft">
              ${renderRing(
                percentage(taskStatus.completed, taskStatus.completed + taskStatus.pending),
                `${taskStatus.completed}/${taskStatus.completed + taskStatus.pending || 0}`,
                'Tasks complete'
              )}
              <p class="card-subtitle">${taskStatus.pending} task${taskStatus.pending === 1 ? '' : 's'} still open.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card heatmap-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Streak visualization</h3>
              <p class="card-subtitle">Your last two weeks of study consistency.</p>
            </div>
          </div>
          ${renderHeatmap(streakHeatmap)}
        </div>
        <div class="card badge-showcase">
          <div class="card-header">
            <div>
              <h3 class="card-title">Badges</h3>
              <p class="card-subtitle">A small reward system for consistency and follow-through.</p>
            </div>
          </div>
          <div class="badge-grid">
            ${badges.map((badge) => renderBadgeCard(badge)).join('')}
          </div>
        </div>
      </div>

      <div class="card momentum-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Subject momentum</h3>
            <p class="card-subtitle">Compare weekly study hours against the target you set for each subject.</p>
          </div>
        </div>
        <div class="momentum-list">
          ${subjectActivity.map((subject) => renderMomentumRow(subject)).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderSettingsPage() {
  const settings = state.data.settings;
  return `
    <section class="page">
      <div class="grid-2">
        <form class="card" data-form="settings">
          <div class="card-header">
            <div>
              <h3 class="card-title">Settings</h3>
              <p class="card-subtitle">Adjust your goals and default focus duration.</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="studentName">Student name</label>
              <input id="studentName" name="studentName" value="${escapeHtml(settings.studentName)}" required />
            </div>
            <div class="field">
              <label for="weeklyGoalHours">Weekly goal (hours)</label>
              <input id="weeklyGoalHours" name="weeklyGoalHours" type="number" min="1" max="60" step="0.5" value="${settings.weeklyGoalHours}" required />
            </div>
            <div class="field">
              <label for="focusDurationMinutes">Default focus duration (minutes)</label>
              <input id="focusDurationMinutes" name="focusDurationMinutes" type="number" min="10" max="180" step="5" value="${settings.focusDurationMinutes}" required />
            </div>
            <div class="field">
              <label>Current streak</label>
              <input value="${state.data.stats.streakDays} day${state.data.stats.streakDays === 1 ? '' : 's'}" disabled />
            </div>
          </div>
          <div class="modal-actions">
            <button type="submit" class="button primary">Save settings</button>
          </div>
        </form>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">How StudySync helps</h3>
              <p class="card-subtitle">A quick guide to what is stored and how the app supports consistency.</p>
            </div>
          </div>
          <div class="insight-list">
            <div class="simple-list-item">
              <div>
                <strong>Persistent timer state</strong>
                <div class="muted">The focus timer stays accurate across views and page refreshes.</div>
              </div>
            </div>
            <div class="simple-list-item">
              <div>
                <strong>Database-backed progress</strong>
                <div class="muted">Subjects, sessions, tasks, and streak days are all saved locally.</div>
              </div>
            </div>
            <div class="simple-list-item">
              <div>
                <strong>Gamified consistency</strong>
                <div class="muted">Points, streaks, and badges are based on real study activity.</div>
              </div>
            </div>
            <div class="simple-list-item">
              <div>
                <strong>Hackathon-ready demo flow</strong>
                <div class="muted">Seeded data makes the dashboard feel alive from the first launch.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderStatCard(label, value, note, tone) {
  return `
    <div class="card stat-card">
      <div class="pill ${tone}">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="stat-note">${escapeHtml(note)}</div>
    </div>
  `;
}

function renderRing(progress, value, label) {
  return `
    <div class="ring" style="--progress: ${clamp(progress, 0, 100)}%;">
      <div>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    </div>
  `;
}

function renderWeeklySummaryList() {
  return `
    <div class="weak-list">
      ${state.data.analytics.weeklyHours.map((day) => `
        <div class="simple-list-item">
          <div>
            <strong>${escapeHtml(day.label)}</strong>
            <div class="muted">${formatDate(day.date, { month: 'short', day: 'numeric' })}</div>
          </div>
          <div>
            <strong>${day.hours}h</strong>
            <div class="muted">${day.minutes} minutes</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderWeakSubjects() {
  const weakSubjects = state.data.insights.weakSubjects;
  if (!weakSubjects.length) {
    return renderEmptyState('Every subject is getting attention right now.', 'Keep the balance going this week.');
  }

  return `
    <div class="weak-list">
      ${weakSubjects.map((subject) => `
        <div class="simple-list-item">
          <div>
            <strong>${escapeHtml(subject.name)}</strong>
            <div class="muted">${subject.weeklyHours}h logged of ${subject.targetHours}h target</div>
          </div>
          <span class="pill warning">Needs focus</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSubjectCard(subject) {
  return `
    <div class="subject-card" style="--subject-color: ${safeColor(subject.color)};">
      <div class="subject-top">
        <div class="subject-title">
          <span class="subject-dot"></span>
          <div>
            <strong>${escapeHtml(subject.name)}</strong>
            <span>${subject.weeklyMinutes ? `${formatMinutes(subject.weeklyMinutes)} this week` : 'No study time logged yet'}</span>
          </div>
        </div>
        <span class="pill ${subject.isWeak ? 'warning' : 'success'}">${subject.isWeak ? 'Weak area' : 'On track'}</span>
      </div>
      <div class="metric-row">
        <div class="metric-pill">
          <strong>${subject.targetHours}h</strong>
          <span class="muted">Target</span>
        </div>
        <div class="metric-pill">
          <strong>${subject.totalSessions}</strong>
          <span class="muted">Sessions</span>
        </div>
        <div class="metric-pill">
          <strong>${subject.pendingTasks}</strong>
          <span class="muted">Pending</span>
        </div>
      </div>
      <div class="subject-actions">
        <button class="button ghost small" data-action="open-modal" data-modal="subject" data-id="${subject.id}">Edit</button>
        <button class="button danger small" data-action="delete-subject" data-id="${subject.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderPlannerColumn(day) {
  return `
    <article class="planner-column">
      <header>
        <h4>${escapeHtml(day.dayName)}</h4>
        <p class="muted">${escapeHtml(day.shortLabel)}</p>
      </header>
      ${
        day.tasks.length
          ? `<div class="planner-task-list">${day.tasks.map((task) => renderTaskRow(task)).join('')}</div>`
          : renderEmptyState('Open block', 'Add a task and turn this into a planned study session.')
      }
    </article>
  `;
}

function renderTaskRow(task) {
  return `
    <article class="planner-task ${task.completed ? 'task-done' : ''}" style="--subject-color: ${safeColor(task.subjectColor)};">
      <div class="task-header">
        <label class="task-checkbox">
          <input type="checkbox" data-task-checkbox data-id="${task.id}" ${task.completed ? 'checked' : ''} />
        </label>
        <div class="subject-actions">
          <button class="button ghost small" data-action="open-modal" data-modal="task" data-id="${task.id}">Edit</button>
          <button class="button danger small" data-action="delete-task" data-id="${task.id}">Delete</button>
        </div>
      </div>
      <div class="task-info">
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(task.subjectName)}</small>
      </div>
      <div class="task-meta">
        ${task.startTime ? `<span class="chip">${icon('clock')} ${escapeHtml(task.startTime)}</span>` : ''}
        <span class="chip">${icon('timer')} ${task.durationMinutes} min</span>
        ${task.dueDate ? `<span class="chip">${icon('calendar')} ${formatDate(task.dueDate, { month: 'short', day: 'numeric' })}</span>` : ''}
      </div>
      ${task.notes ? `<p class="muted">${escapeHtml(task.notes)}</p>` : ''}
    </article>
  `;
}

function renderSessionRow(session) {
  return `
    <div class="session-row">
      <div class="session-info">
        <strong>${escapeHtml(session.subjectName)}</strong>
        <small>${formatDate(session.sessionDate, { month: 'short', day: 'numeric', year: 'numeric' })}</small>
        ${session.notes ? `<small>${escapeHtml(session.notes)}</small>` : ''}
      </div>
      <div class="session-meta">
        <span class="chip">${icon('timer')} ${formatMinutes(session.durationMinutes)}</span>
        <span class="pill ${session.source === 'focus' ? 'success' : 'warning'}">${session.source === 'focus' ? 'Focus timer' : 'Manual log'}</span>
      </div>
    </div>
  `;
}

function renderWeeklyChart(days) {
  const maxHours = Math.max(...days.map((day) => day.hours), 1);
  return `
    <div class="chart-bars">
      ${days.map((day) => `
        <div class="chart-column">
          <div class="chart-track">
            <div class="chart-bar" style="--height: ${Math.max(18, (day.hours / maxHours) * 100)}%;"></div>
          </div>
          <strong>${day.hours}h</strong>
          <span class="chart-label">${escapeHtml(day.label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderHeatmap(cells) {
  return `
    <div class="heatmap-grid">
      ${cells.map((cell) => {
        const opacity = cell.studied ? Math.min(0.95, 0.22 + cell.minutes / 220) : 0.08;
        return `
          <div class="heat-cell" style="background: rgba(47, 107, 255, ${opacity});">
            <strong>${escapeHtml(cell.label)}</strong>
            <div class="muted">${cell.studied ? `${Math.round(cell.minutes)} min` : 'Rest day'}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBadgeCard(badge) {
  const initials = badge.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

  return `
    <div class="badge-card ${badge.earned ? 'earned' : 'locked'}">
      <div class="badge-mark">${escapeHtml(initials)}</div>
      <strong>${escapeHtml(badge.name)}</strong>
      <p class="muted">${escapeHtml(badge.description)}</p>
      <span class="pill ${badge.earned ? 'success' : 'warning'}">${badge.earned ? 'Unlocked' : 'In progress'}</span>
    </div>
  `;
}

function renderMomentumRow(subject) {
  const progress = percentage(subject.weeklyHours, subject.targetHours || 1);
  return `
    <div class="momentum-row">
      <div>
        <strong>${escapeHtml(subject.name)}</strong>
        <div class="muted">${subject.weeklyHours}h of ${subject.targetHours}h target</div>
      </div>
      <div class="momentum-bar">
        <span style="--width: ${clamp(progress, 0, 100)}%;"></span>
      </div>
      <span class="pill ${subject.isWeak ? 'warning' : 'success'}">${Math.round(progress)}%</span>
    </div>
  `;
}

function renderEmptyState(title, description) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span class="muted">${escapeHtml(description)}</span>
    </div>
  `;
}

function renderFocusWidget(context) {
  const timer = getLiveFocusTimer();
  const locked = timer.status === 'running' || timer.status === 'paused';
  const durationMinutes =
    timer.status === 'idle' || timer.status === 'completed'
      ? state.data.settings.focusDurationMinutes
      : Math.round(timer.durationSec / 60);

  return `
    <div class="focus-widget" data-focus-widget data-focus-context="${context}">
      <div class="focus-meta">
        <span class="status-pill ${timer.status}" data-focus-status>${escapeHtml(renderFocusStatus(timer))}</span>
        <span class="muted" data-focus-subject>${escapeHtml(timer.subjectName || 'General Focus')}</span>
      </div>
      <div class="timer-face" data-focus-face style="--progress: ${timer.progressPercent}%;">
        <div class="timer-display">
          <div class="timer-time" data-focus-time>${formatTimer(timer.remainingSec)}</div>
          <div class="timer-text" data-focus-caption>${escapeHtml(renderFocusCaption(timer))}</div>
        </div>
      </div>
      <div class="form-grid">
        <div class="field">
          <label>Subject</label>
          <select class="focus-subject-select" ${locked ? 'disabled' : ''}>
            <option value="">General focus</option>
            ${state.data.subjects.map((subject) => `
              <option value="${subject.id}" ${String(timer.subjectId || '') === String(subject.id) ? 'selected' : ''}>
                ${escapeHtml(subject.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="field">
          <label>Duration (minutes)</label>
          <input class="focus-duration-input" type="number" min="10" max="180" step="5" value="${durationMinutes}" ${locked ? 'disabled' : ''} />
        </div>
      </div>
      <div class="chip-row">
        ${[25, 45, 60].map((minutes) => `
          <button class="button ghost chip-button" data-action="set-focus-duration" data-value="${minutes}" ${locked ? 'disabled' : ''}>
            ${minutes} min
          </button>
        `).join('')}
      </div>
      <div class="focus-controls">
        ${renderFocusActions(timer)}
      </div>
    </div>
  `;
}

function renderFocusActions(timer) {
  if (timer.status === 'running') {
    return `
      <button class="button primary" data-action="pause-focus">Pause</button>
      <button class="button ghost" data-action="reset-focus">End Session</button>
    `;
  }

  if (timer.status === 'paused') {
    return `
      <button class="button primary" data-action="resume-focus">Resume</button>
      <button class="button ghost" data-action="reset-focus">Reset</button>
    `;
  }

  if (timer.status === 'completed') {
    return `
      <button class="button primary" data-action="start-focus">Start another</button>
      <button class="button ghost" data-action="reset-focus">Clear state</button>
    `;
  }

  return `
    <button class="button primary" data-action="start-focus">Start focus</button>
    <button class="button ghost" data-action="open-modal" data-modal="session">Log manual session</button>
  `;
}

function renderModal() {
  if (!state.modal) {
    return '<div class="modal-backdrop"></div>';
  }

  const { type, id } = state.modal;
  const record = getModalRecord(type, id);

  return `
    <div class="modal-backdrop open" data-action="close-modal">
      <div class="modal-card" onclick="event.stopPropagation()">
        ${type === 'subject' ? renderSubjectModal(record) : ''}
        ${type === 'task' ? renderTaskModal(record) : ''}
        ${type === 'session' ? renderSessionModal(record) : ''}
      </div>
    </div>
  `;
}

function renderSubjectModal(subject) {
  return `
    <form data-form="subject">
      <div class="card-header">
        <div>
          <h3 class="card-title">${subject ? 'Edit subject' : 'Add subject'}</h3>
          <p class="card-subtitle">Create a subject card with a clear target for the week.</p>
        </div>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close modal">${icon('close')}</button>
      </div>
      <input type="hidden" name="id" value="${subject?.id || ''}" />
      <div class="form-grid">
        <div class="field">
          <label for="subjectName">Subject name</label>
          <input id="subjectName" name="name" value="${escapeHtml(subject?.name || '')}" required />
        </div>
        <div class="field">
          <label for="subjectTarget">Target hours</label>
          <input id="subjectTarget" name="targetHours" type="number" min="0.5" max="40" step="0.5" value="${subject?.targetHours || 3}" required />
        </div>
        <div class="field full">
          <label for="subjectColor">Accent color</label>
          <input id="subjectColor" name="color" type="color" value="${safeColor(subject?.color || '#2F6BFF')}" />
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="button ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="button primary">${subject ? 'Save changes' : 'Add subject'}</button>
      </div>
    </form>
  `;
}

function renderTaskModal(task) {
  return `
    <form data-form="task">
      <div class="card-header">
        <div>
          <h3 class="card-title">${task ? 'Edit task' : 'Add task'}</h3>
          <p class="card-subtitle">Plan a focused study block and attach it to a subject.</p>
        </div>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close modal">${icon('close')}</button>
      </div>
      <input type="hidden" name="id" value="${task?.id || ''}" />
      <div class="form-grid">
        <div class="field full">
          <label for="taskTitle">Task title</label>
          <input id="taskTitle" name="title" value="${escapeHtml(task?.title || '')}" required />
        </div>
        <div class="field">
          <label for="taskSubject">Subject</label>
          <select id="taskSubject" name="subjectId">
            <option value="">General study</option>
            ${state.data.subjects.map((subject) => `
              <option value="${subject.id}" ${String(task?.subjectId || '') === String(subject.id) ? 'selected' : ''}>
                ${escapeHtml(subject.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="field">
          <label for="taskDuration">Duration (minutes)</label>
          <input id="taskDuration" name="durationMinutes" type="number" min="15" max="480" step="5" value="${task?.durationMinutes || 60}" required />
        </div>
        <div class="field">
          <label for="plannedDate">Planned date</label>
          <input id="plannedDate" name="plannedDate" type="date" value="${task?.plannedDate || state.data.meta.today}" required />
        </div>
        <div class="field">
          <label for="startTime">Start time</label>
          <input id="startTime" name="startTime" type="time" value="${task?.startTime || ''}" />
        </div>
        <div class="field">
          <label for="dueDate">Due date</label>
          <input id="dueDate" name="dueDate" type="date" value="${task?.dueDate || task?.plannedDate || state.data.meta.today}" />
        </div>
        <div class="field">
          <label for="taskCompleted">Completed</label>
          <select id="taskCompleted" name="completed">
            <option value="false" ${task?.completed ? '' : 'selected'}>Pending</option>
            <option value="true" ${task?.completed ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="field full">
          <label for="taskNotes">Notes</label>
          <textarea id="taskNotes" name="notes" placeholder="Add details, chapter names, or reminders...">${escapeHtml(task?.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="button ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="button primary">${task ? 'Save changes' : 'Add task'}</button>
      </div>
    </form>
  `;
}

function renderSessionModal(session) {
  return `
    <form data-form="session">
      <div class="card-header">
        <div>
          <h3 class="card-title">Log study session</h3>
          <p class="card-subtitle">Add a manual study block and keep your totals accurate.</p>
        </div>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close modal">${icon('close')}</button>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="sessionSubject">Subject</label>
          <select id="sessionSubject" name="subjectId">
            <option value="">General study</option>
            ${state.data.subjects.map((subject) => `
              <option value="${subject.id}" ${String(session?.subjectId || '') === String(subject.id) ? 'selected' : ''}>
                ${escapeHtml(subject.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="field">
          <label for="sessionDuration">Duration (minutes)</label>
          <input id="sessionDuration" name="durationMinutes" type="number" min="5" max="600" step="5" value="${session?.durationMinutes || 60}" required />
        </div>
        <div class="field">
          <label for="sessionDate">Date</label>
          <input id="sessionDate" name="sessionDate" type="date" value="${session?.sessionDate || state.data.meta.today}" required />
        </div>
        <div class="field full">
          <label for="sessionNotes">Notes</label>
          <textarea id="sessionNotes" name="notes" placeholder="What did you work on?">${escapeHtml(session?.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="button ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="button primary">Save session</button>
      </div>
    </form>
  `;
}

function getModalRecord(type, id) {
  if (!id || !state.data) {
    return null;
  }

  const numericId = Number(id);
  if (type === 'subject') {
    return state.data.subjects.find((subject) => subject.id === numericId) || null;
  }
  if (type === 'task') {
    return state.data.tasks.find((task) => task.id === numericId) || null;
  }
  if (type === 'session') {
    return state.data.sessions.find((session) => session.id === numericId) || null;
  }

  return null;
}

function updateLiveFocusWidgets() {
  if (!state.data) {
    return;
  }

  const timer = getLiveFocusTimer();
  document.querySelectorAll('[data-focus-widget]').forEach((widget) => {
    const face = widget.querySelector('[data-focus-face]');
    const time = widget.querySelector('[data-focus-time]');
    const caption = widget.querySelector('[data-focus-caption]');
    const status = widget.querySelector('[data-focus-status]');
    const subject = widget.querySelector('[data-focus-subject]');

    if (face) {
      face.style.setProperty('--progress', `${timer.progressPercent}%`);
    }
    if (time) {
      time.textContent = formatTimer(timer.remainingSec);
    }
    if (caption) {
      caption.textContent = renderFocusCaption(timer);
    }
    if (status) {
      status.textContent = renderFocusStatus(timer);
      status.className = `status-pill ${timer.status}`;
    }
    if (subject) {
      subject.textContent = timer.subjectName || 'General Focus';
    }
  });
}

function getLiveFocusTimer() {
  const timer = state.data?.focusTimer;
  if (!timer) {
    return {
      status: 'idle',
      durationSec: state.data?.settings.focusDurationMinutes * 60 || 1500,
      elapsedSec: 0,
      remainingSec: state.data?.settings.focusDurationMinutes * 60 || 1500,
      progressPercent: 0,
      subjectId: null,
      subjectName: 'General Focus'
    };
  }

  let elapsedSec = timer.elapsedSec;
  if (timer.status === 'running' && timer.startedAt) {
    elapsedSec += Math.max(
      0,
      Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000)
    );
  }

  elapsedSec = Math.min(elapsedSec, timer.durationSec);
  const remainingSec = Math.max(0, timer.durationSec - elapsedSec);
  const progressPercent = timer.durationSec
    ? Math.round((elapsedSec / timer.durationSec) * 100)
    : 0;

  return {
    ...timer,
    elapsedSec,
    remainingSec,
    progressPercent
  };
}

async function handleClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;

  try {
    if (action === 'retry-load') {
      await refreshData();
      return;
    }

    if (action === 'set-view') {
      state.view = trigger.dataset.view;
      localStorage.setItem('studysync:view', state.view);
      state.mobileNavOpen = false;
      renderApp();
      return;
    }

    if (action === 'toggle-nav') {
      state.mobileNavOpen = !state.mobileNavOpen;
      renderApp();
      return;
    }

    if (action === 'close-nav') {
      state.mobileNavOpen = false;
      renderApp();
      return;
    }

    if (action === 'close-modal') {
      state.modal = null;
      renderApp();
      return;
    }

    if (action === 'open-modal') {
      state.modal = {
        type: trigger.dataset.modal,
        id: trigger.dataset.id || null
      };
      renderApp();
      return;
    }

    if (action === 'delete-subject') {
      if (!window.confirm('Delete this subject? Existing sessions will stay, but the subject will be removed.')) {
        return;
      }
      await api(`/api/subjects/${trigger.dataset.id}`, { method: 'DELETE' });
      state.modal = null;
      await refreshData({ toastMessage: 'Subject deleted.' });
      return;
    }

    if (action === 'delete-task') {
      if (!window.confirm('Delete this task from the planner?')) {
        return;
      }
      await api(`/api/tasks/${trigger.dataset.id}`, { method: 'DELETE' });
      await refreshData({ toastMessage: 'Task deleted.' });
      return;
    }

    if (action === 'mark-studied') {
      await api('/api/mark-studied', {
        method: 'POST',
        body: { date: state.data.meta.today }
      });
      await refreshData({ toastMessage: 'Marked today as studied.' });
      return;
    }

    if (action === 'set-focus-duration') {
      const container = trigger.closest('[data-focus-context]');
      const input = container?.querySelector('.focus-duration-input');
      if (input) {
        input.value = trigger.dataset.value;
      }
      return;
    }

    if (action === 'start-focus' || action === 'start-quick-focus') {
      await startFocus(trigger);
      return;
    }

    if (action === 'pause-focus') {
      await api('/api/focus-timer/pause', { method: 'POST' });
      await refreshData({ toastMessage: 'Focus timer paused.' });
      return;
    }

    if (action === 'resume-focus') {
      await api('/api/focus-timer/resume', { method: 'POST' });
      await refreshData({ toastMessage: 'Focus timer resumed.' });
      return;
    }

    if (action === 'reset-focus') {
      await api('/api/focus-timer/reset', { method: 'POST' });
      await refreshData({ toastMessage: 'Focus timer reset.' });
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSubmit(event) {
  const form = event.target;
  if (!form.matches('[data-form]')) {
    return;
  }

  event.preventDefault();

  try {
    if (form.dataset.form === 'subject') {
      await saveSubject(form);
    }
    if (form.dataset.form === 'task') {
      await saveTask(form);
    }
    if (form.dataset.form === 'session') {
      await saveSession(form);
    }
    if (form.dataset.form === 'settings') {
      await saveSettings(form);
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleChange(event) {
  const checkbox = event.target.closest('[data-task-checkbox]');
  if (!checkbox) {
    return;
  }

  try {
    await api(`/api/tasks/${checkbox.dataset.id}/toggle`, {
      method: 'PATCH',
      body: { completed: checkbox.checked }
    });
    await refreshData({
      toastMessage: checkbox.checked ? 'Task completed. Nice work.' : 'Task moved back to pending.'
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveSubject(form) {
  const formData = new FormData(form);
  const payload = {
    name: formData.get('name'),
    targetHours: Number(formData.get('targetHours')),
    color: formData.get('color')
  };

  const subjectId = formData.get('id');
  if (subjectId) {
    await api(`/api/subjects/${subjectId}`, { method: 'PUT', body: payload });
  } else {
    await api('/api/subjects', { method: 'POST', body: payload });
  }

  state.modal = null;
  await refreshData({ toastMessage: `Subject ${subjectId ? 'updated' : 'added'}.` });
}

async function saveTask(form) {
  const formData = new FormData(form);
  const payload = {
    title: formData.get('title'),
    subjectId: formData.get('subjectId') || null,
    plannedDate: formData.get('plannedDate'),
    dueDate: formData.get('dueDate') || null,
    startTime: formData.get('startTime') || null,
    durationMinutes: Number(formData.get('durationMinutes')),
    notes: formData.get('notes'),
    completed: formData.get('completed') === 'true'
  };

  const taskId = formData.get('id');
  if (taskId) {
    await api(`/api/tasks/${taskId}`, { method: 'PUT', body: payload });
  } else {
    await api('/api/tasks', { method: 'POST', body: payload });
  }

  state.modal = null;
  await refreshData({ toastMessage: `Task ${taskId ? 'updated' : 'added'} to the planner.` });
}

async function saveSession(form) {
  const formData = new FormData(form);
  const payload = {
    subjectId: formData.get('subjectId') || null,
    durationMinutes: Number(formData.get('durationMinutes')),
    sessionDate: formData.get('sessionDate'),
    notes: formData.get('notes'),
    source: 'manual'
  };

  await api('/api/sessions', { method: 'POST', body: payload });
  state.modal = null;
  await refreshData({ toastMessage: 'Study session logged.' });
}

async function saveSettings(form) {
  const formData = new FormData(form);
  const payload = {
    studentName: formData.get('studentName'),
    weeklyGoalHours: Number(formData.get('weeklyGoalHours')),
    focusDurationMinutes: Number(formData.get('focusDurationMinutes'))
  };

  await api('/api/settings', { method: 'PUT', body: payload });
  await refreshData({ toastMessage: 'Settings updated.' });
}

async function startFocus(trigger) {
  const container = trigger.closest('[data-focus-context]');
  const subjectId =
    container?.querySelector('.focus-subject-select')?.value || '';
  const minutes = Number(
    container?.querySelector('.focus-duration-input')?.value ||
      state.data.settings.focusDurationMinutes
  );
  const subject = state.data.subjects.find((item) => String(item.id) === String(subjectId));

  await api('/api/focus-timer/start', {
    method: 'POST',
    body: {
      subjectId: subjectId || null,
      durationSec: minutes * 60,
      label: subject ? `${subject.name} Focus` : 'Focus Session'
    }
  });

  await refreshData({ toastMessage: 'Focus session started.' });
}

function renderGlobalFocusLabel(timer) {
  if (timer.status === 'running') {
    return `Focus ${formatTimer(timer.remainingSec)}`;
  }
  if (timer.status === 'paused') {
    return `Paused ${formatTimer(timer.remainingSec)}`;
  }
  if (timer.status === 'completed') {
    return 'Session completed';
  }
  return 'Ready for deep work';
}

function renderFocusStatus(timer) {
  if (timer.status === 'running') {
    return 'Running';
  }
  if (timer.status === 'paused') {
    return 'Paused';
  }
  if (timer.status === 'completed') {
    return 'Completed';
  }
  return 'Ready';
}

function renderFocusCaption(timer) {
  if (timer.status === 'running') {
    return 'Stay with the current block.';
  }
  if (timer.status === 'paused') {
    return 'Resume when you are ready to continue.';
  }
  if (timer.status === 'completed') {
    return 'Saved automatically to session history.';
  }
  return 'Set a duration and begin a focused block.';
}

function showToast(message, tone = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeColor(color) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(color || '').trim())
    ? String(color).trim()
    : '#2F6BFF';
}

function formatMinutes(minutes) {
  const total = Math.round(Number(minutes));
  const hours = Math.floor(total / 60);
  const remainder = total % 60;

  if (!hours) {
    return `${remainder}m`;
  }
  if (!remainder) {
    return `${hours}h`;
  }
  return `${hours}h ${remainder}m`;
}

function formatTimer(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatDate(dateKey, options = {}) {
  return new Intl.DateTimeFormat('en-US', {
    month: options.month || 'short',
    day: options.day || 'numeric',
    year: options.year || undefined
  }).format(new Date(`${dateKey}T12:00:00`));
}

function percentage(value, total) {
  if (!total) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function icon(name) {
  const icons = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16.5H6.5A2.5 2.5 0 0 0 4 22V5.5Z"/><path d="M8 7h8"/><path d="M8 11h8"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V9"/><path d="M10 20V4"/><path d="M16 20v-8"/><path d="M22 20V12"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.7a1 1 0 0 1-1-1v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.2-1.2a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.7a1 1 0 0 1 1-1h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.7a1 1 0 0 1 1 1v.1a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.7a1 1 0 0 1-1 1h-.1a1 1 0 0 0-.9.7Z"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.3 5.7L20 10l-5.7 2.3L12 18l-2.3-5.7L4 10l5.7-2.3L12 2Z"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M5.6 9A8 8 0 0 1 19 7"/><path d="M18.4 15A8 8 0 0 1 5 17"/></svg>',
    points: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4.5 9v6L12 21l7.5-6V9L12 3Z"/><path d="M9.5 12h5"/></svg>',
    badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="m8 12-1 8 5-3 5 3-1-8"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M22 12h-3"/></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 2h4"/><path d="M12 14V9"/><path d="M12 14l3 2"/><circle cx="12" cy="14" r="8"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 10h18"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>'
  };

  return `<span class="icon">${icons[name] || ''}</span>`;
}
