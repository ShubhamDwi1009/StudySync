const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const APP_NAME = 'StudySync';
const PORT = Number(process.env.PORT || 3000);
const TIME_ZONE =
  process.env.STUDYSYNC_TZ ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  'UTC';

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DEFAULT_DB_PATH = path.join(ROOT_DIR, 'data', 'studysync.db');

const QUOTES = [
  {
    text: 'Small consistent steps build the strongest academic momentum.',
    author: 'StudySync'
  },
  {
    text: 'Focus turns scattered effort into visible progress.',
    author: 'StudySync'
  },
  {
    text: 'Discipline is what keeps your goals moving on quiet days.',
    author: 'StudySync'
  },
  {
    text: 'A single study block today is better than a perfect plan tomorrow.',
    author: 'StudySync'
  },
  {
    text: 'Your routine writes the story your grades will tell later.',
    author: 'StudySync'
  },
  {
    text: 'Protected time is where deep understanding begins.',
    author: 'StudySync'
  },
  {
    text: 'Momentum feels small while you build it and powerful once it is built.',
    author: 'StudySync'
  }
];

function createApp(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  initializeDatabase(db);
  seedDatabase(db);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (url.pathname.startsWith('/api/')) {
        await handleApiRequest(req, res, url, db);
        return;
      }

      serveStaticFile(res, url.pathname);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        console.error('StudySync request failed:', error);
      }
      sendJson(res, statusCode, {
        error: error.message || 'Something went wrong while processing the request.'
      });
    }
  });

  return {
    server,
    db,
    close() {
      return new Promise((resolve) => {
        server.close(() => {
          try {
            db.close();
          } catch (error) {
            console.error('Failed to close the database cleanly:', error);
          }
          resolve();
        });
      });
    }
  };
}

function initializeDatabase(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      student_name TEXT NOT NULL DEFAULT 'Alex',
      weekly_goal_hours REAL NOT NULL DEFAULT 10,
      focus_duration_minutes INTEGER NOT NULL DEFAULT 25,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#4B7BF5',
      target_hours REAL NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject_id INTEGER,
      planned_date TEXT NOT NULL,
      due_date TEXT,
      start_time TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      notes TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER,
      duration_minutes REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      notes TEXT NOT NULL DEFAULT '',
      session_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS study_days (
      date TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'session',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS focus_timer (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'idle',
      duration_sec INTEGER NOT NULL DEFAULT 1500,
      elapsed_sec INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      subject_id INTEGER,
      label TEXT NOT NULL DEFAULT 'Focus Session',
      auto_saved_session_id INTEGER,
      last_completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
    );
  `);

  db.prepare(`
    INSERT OR IGNORE INTO settings (
      id,
      student_name,
      weekly_goal_hours,
      focus_duration_minutes,
      updated_at
    ) VALUES (1, 'Alex', 10, 25, ?)
  `).run(nowIso());

  db.prepare(`
    INSERT OR IGNORE INTO focus_timer (
      id,
      status,
      duration_sec,
      elapsed_sec,
      label,
      updated_at
    ) VALUES (1, 'idle', 1500, 0, 'Focus Session', ?)
  `).run(nowIso());
}

function seedDatabase(db) {
  const subjectCount = Number(db.prepare('SELECT COUNT(*) AS count FROM subjects').get().count);

  if (subjectCount > 0) {
    return;
  }

  const colors = ['#2F6BFF', '#34B3FF', '#6C7BFF', '#25C79A'];
  const demoSubjects = [
    { name: 'Mathematics', targetHours: 4.5 },
    { name: 'Physics', targetHours: 3.5 },
    { name: 'Computer Science', targetHours: 5.5 },
    { name: 'Literature', targetHours: 2.5 }
  ];

  const insertSubject = db.prepare(`
    INSERT INTO subjects (name, color, target_hours, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const subjectIds = demoSubjects.map((subject, index) => {
    const result = insertSubject.run(
      subject.name,
      colors[index % colors.length],
      subject.targetHours,
      nowIso()
    );
    return Number(result.lastInsertRowid);
  });

  const today = getTodayKey();
  const demoSessions = [
    { offset: 0, subjectId: subjectIds[2], durationMinutes: 90, source: 'focus', notes: 'Algorithm revision sprint' },
    { offset: 0, subjectId: subjectIds[0], durationMinutes: 45, source: 'manual', notes: 'Calculus warm-up' },
    { offset: -1, subjectId: subjectIds[1], durationMinutes: 70, source: 'focus', notes: 'Optics practice set' },
    { offset: -2, subjectId: subjectIds[0], durationMinutes: 55, source: 'manual', notes: 'Integration drills' },
    { offset: -3, subjectId: subjectIds[2], durationMinutes: 80, source: 'focus', notes: 'Database fundamentals' },
    { offset: -4, subjectId: subjectIds[3], durationMinutes: 40, source: 'manual', notes: 'Essay annotations' },
    { offset: -5, subjectId: subjectIds[1], durationMinutes: 65, source: 'manual', notes: 'Wave motion recap' }
  ];

  demoSessions.forEach((session) => {
    insertSession(db, {
      subjectId: session.subjectId,
      durationMinutes: session.durationMinutes,
      source: session.source,
      notes: session.notes,
      sessionDate: shiftDateKey(today, session.offset)
    });
  });

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      title,
      subject_id,
      planned_date,
      due_date,
      start_time,
      duration_minutes,
      notes,
      completed,
      completed_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const taskSeeds = [
    {
      title: 'Review lecture notes',
      subjectId: subjectIds[0],
      plannedDate: today,
      dueDate: today,
      startTime: '07:30',
      durationMinutes: 45,
      notes: 'Summarize limits and continuity.',
      completed: 1
    },
    {
      title: 'Physics numericals',
      subjectId: subjectIds[1],
      plannedDate: today,
      dueDate: shiftDateKey(today, 1),
      startTime: '16:00',
      durationMinutes: 60,
      notes: 'Finish at least five problems from the workbook.',
      completed: 0
    },
    {
      title: 'Code practice block',
      subjectId: subjectIds[2],
      plannedDate: shiftDateKey(today, 1),
      dueDate: shiftDateKey(today, 1),
      startTime: '18:30',
      durationMinutes: 90,
      notes: 'Solve graph questions.',
      completed: 0
    },
    {
      title: 'Read one literature chapter',
      subjectId: subjectIds[3],
      plannedDate: shiftDateKey(today, 2),
      dueDate: shiftDateKey(today, 2),
      startTime: '20:00',
      durationMinutes: 35,
      notes: 'Collect three strong quotes for class discussion.',
      completed: 0
    }
  ];

  taskSeeds.forEach((task) => {
    insertTask.run(
      task.title,
      task.subjectId,
      task.plannedDate,
      task.dueDate,
      task.startTime,
      task.durationMinutes,
      task.notes,
      task.completed,
      task.completed ? nowIso() : null,
      nowIso()
    );
  });

  db.prepare(`
    UPDATE settings
    SET student_name = ?, weekly_goal_hours = ?, focus_duration_minutes = ?, updated_at = ?
    WHERE id = 1
  `).run('Maya', 10, 25, nowIso());
}

async function handleApiRequest(req, res, url, db) {
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    sendJson(res, 200, buildBootstrap(db));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/subjects') {
    sendJson(res, 200, listSubjects(db));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/subjects') {
    const body = await readJson(req);
    const payload = validateSubjectPayload(body);
    const result = db.prepare(`
      INSERT INTO subjects (name, color, target_hours, created_at)
      VALUES (?, ?, ?, ?)
    `).run(payload.name, payload.color, payload.targetHours, nowIso());

    sendJson(res, 201, { id: Number(result.lastInsertRowid) });
    return;
  }

  const subjectMatch = pathname.match(/^\/api\/subjects\/(\d+)$/);
  if (subjectMatch) {
    const subjectId = Number(subjectMatch[1]);
    assertSubjectExists(db, subjectId);

    if (req.method === 'PUT') {
      const body = await readJson(req);
      const payload = validateSubjectPayload(body);

      db.prepare(`
        UPDATE subjects
        SET name = ?, color = ?, target_hours = ?
        WHERE id = ?
      `).run(payload.name, payload.color, payload.targetHours, subjectId);

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM subjects WHERE id = ?').run(subjectId);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/api/tasks') {
    sendJson(res, 200, listTasks(db));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/tasks') {
    const body = await readJson(req);
    const payload = validateTaskPayload(body, db);

    const result = db.prepare(`
      INSERT INTO tasks (
        title,
        subject_id,
        planned_date,
        due_date,
        start_time,
        duration_minutes,
        notes,
        completed,
        completed_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.title,
      payload.subjectId,
      payload.plannedDate,
      payload.dueDate,
      payload.startTime,
      payload.durationMinutes,
      payload.notes,
      payload.completed ? 1 : 0,
      payload.completed ? nowIso() : null,
      nowIso()
    );

    sendJson(res, 201, { id: Number(result.lastInsertRowid) });
    return;
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch) {
    const taskId = Number(taskMatch[1]);
    assertTaskExists(db, taskId);

    if (req.method === 'PUT') {
      const body = await readJson(req);
      const payload = validateTaskPayload(body, db);

      db.prepare(`
        UPDATE tasks
        SET title = ?,
            subject_id = ?,
            planned_date = ?,
            due_date = ?,
            start_time = ?,
            duration_minutes = ?,
            notes = ?,
            completed = ?,
            completed_at = ?
        WHERE id = ?
      `).run(
        payload.title,
        payload.subjectId,
        payload.plannedDate,
        payload.dueDate,
        payload.startTime,
        payload.durationMinutes,
        payload.notes,
        payload.completed ? 1 : 0,
        payload.completed ? nowIso() : null,
        taskId
      );

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  const taskToggleMatch = pathname.match(/^\/api\/tasks\/(\d+)\/toggle$/);
  if (taskToggleMatch && req.method === 'PATCH') {
    const taskId = Number(taskToggleMatch[1]);
    assertTaskExists(db, taskId);
    const body = await readJson(req);
    const completed = Boolean(body.completed);

    db.prepare(`
      UPDATE tasks
      SET completed = ?, completed_at = ?
      WHERE id = ?
    `).run(completed ? 1 : 0, completed ? nowIso() : null, taskId);

    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/sessions') {
    sendJson(res, 200, listSessions(db));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/sessions') {
    const body = await readJson(req);
    const payload = validateSessionPayload(body, db);

    const sessionId = insertSession(db, {
      subjectId: payload.subjectId,
      durationMinutes: payload.durationMinutes,
      source: payload.source,
      notes: payload.notes,
      sessionDate: payload.sessionDate
    });

    sendJson(res, 201, { id: sessionId });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/mark-studied') {
    const body = await readJson(req);
    const date = body.date ? validateDate(body.date, 'date') : getTodayKey();
    markStudyDay(db, date, 'manual');
    sendJson(res, 200, { ok: true, date });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/focus-timer') {
    sendJson(res, 200, normalizeFocusTimer(db));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/focus-timer/start') {
    const body = await readJson(req);
    const payload = validateFocusStartPayload(body, db);

    db.prepare(`
      UPDATE focus_timer
      SET status = 'running',
          duration_sec = ?,
          elapsed_sec = 0,
          started_at = ?,
          subject_id = ?,
          label = ?,
          auto_saved_session_id = NULL,
          last_completed_at = NULL,
          updated_at = ?
      WHERE id = 1
    `).run(
      payload.durationSec,
      nowIso(),
      payload.subjectId,
      payload.label,
      nowIso()
    );

    sendJson(res, 200, normalizeFocusTimer(db));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/focus-timer/pause') {
    const timer = normalizeFocusTimer(db);
    if (timer.status !== 'running') {
      sendJson(res, 200, timer);
      return;
    }

    db.prepare(`
      UPDATE focus_timer
      SET status = 'paused',
          elapsed_sec = ?,
          started_at = NULL,
          updated_at = ?
      WHERE id = 1
    `).run(timer.elapsedSec, nowIso());

    sendJson(res, 200, normalizeFocusTimer(db));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/focus-timer/resume') {
    const timer = normalizeFocusTimer(db);
    if (timer.status !== 'paused') {
      sendJson(res, 200, timer);
      return;
    }

    db.prepare(`
      UPDATE focus_timer
      SET status = 'running',
          started_at = ?,
          updated_at = ?
      WHERE id = 1
    `).run(nowIso(), nowIso());

    sendJson(res, 200, normalizeFocusTimer(db));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/focus-timer/reset') {
    const settings = getSettings(db);
    db.prepare(`
      UPDATE focus_timer
      SET status = 'idle',
          duration_sec = ?,
          elapsed_sec = 0,
          started_at = NULL,
          subject_id = NULL,
          label = 'Focus Session',
          auto_saved_session_id = NULL,
          last_completed_at = NULL,
          updated_at = ?
      WHERE id = 1
    `).run(settings.focusDurationMinutes * 60, nowIso());

    sendJson(res, 200, normalizeFocusTimer(db));
    return;
  }

  if (req.method === 'PUT' && pathname === '/api/settings') {
    const body = await readJson(req);
    const payload = validateSettingsPayload(body);

    db.prepare(`
      UPDATE settings
      SET student_name = ?,
          weekly_goal_hours = ?,
          focus_duration_minutes = ?,
          updated_at = ?
      WHERE id = 1
    `).run(
      payload.studentName,
      payload.weeklyGoalHours,
      payload.focusDurationMinutes,
      nowIso()
    );

    const timer = normalizeFocusTimer(db);
    if (timer.status === 'idle') {
      db.prepare(`
        UPDATE focus_timer
        SET duration_sec = ?, updated_at = ?
        WHERE id = 1
      `).run(payload.focusDurationMinutes * 60, nowIso());
    }

    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'Endpoint not found.' });
}

function buildBootstrap(db) {
  const focusTimer = normalizeFocusTimer(db);
  const settings = getSettings(db);
  const sessions = listSessions(db);
  const totalSessions = Number(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count);
  const totalMinutes = Number(
    db.prepare('SELECT COALESCE(SUM(duration_minutes), 0) AS total FROM sessions').get().total
  );
  const completedTasks = Number(
    db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE completed = 1').get().count
  );
  const pendingTasks = Number(
    db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE completed = 0').get().count
  );
  const focusSessions = Number(
    db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE source = 'focus'").get().count
  );

  const weeklyHours = buildWeeklyHours(db);
  const weeklyHoursTotal = Math.round(weeklyHours.reduce((sum, day) => sum + day.hours, 0) * 10) / 10;
  const streakHeatmap = buildStudyHeatmap(db, 14);
  const streakDays = calculateCurrentStreakDays(db);
  const studiedToday = streakHeatmap[streakHeatmap.length - 1]?.studied ?? false;
  const progressPercent = Math.min(
    100,
    settings.weeklyGoalHours > 0
      ? Math.round((weeklyHoursTotal / settings.weeklyGoalHours) * 100)
      : 0
  );
  const hoursRemaining = Math.max(0, Math.round((settings.weeklyGoalHours - weeklyHoursTotal) * 10) / 10);
  const totalPoints =
    Math.round(totalMinutes / 5) + completedTasks * 20 + streakDays * 8 + focusSessions * 12;

  const subjects = listSubjects(db);
  const weakSubjects = pickWeakSubjects(subjects);
  const weakSubjectIds = new Set(weakSubjects.map((subject) => subject.id));
  const decoratedSubjects = subjects.map((subject) => ({
    ...subject,
    isWeak: weakSubjectIds.has(subject.id)
  }));

  const tasks = listTasks(db);
  const planner = buildPlanner(tasks);
  const badges = buildBadges({
    totalSessions,
    totalHours: totalMinutes / 60,
    streakDays,
    completedTasks,
    weeklyHoursTotal,
    weeklyGoalHours: settings.weeklyGoalHours,
    focusSessions
  });

  const today = getTodayKey();
  const quote = getQuoteForDate(today);
  const stats = {
    weeklyHours: weeklyHoursTotal,
    weeklyGoalHours: settings.weeklyGoalHours,
    progressPercent,
    streakDays,
    totalSessions,
    totalPoints,
    completedTasks,
    pendingTasks,
    studiedToday,
    hoursRemaining,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10
  };

  return {
    meta: {
      appName: APP_NAME,
      today,
      timeZone: TIME_ZONE,
      formattedDate: formatReadableDate(today),
      greeting: getGreeting(),
      quote,
      message: buildMotivation(stats, focusTimer)
    },
    settings,
    stats,
    subjects: decoratedSubjects,
    tasks,
    sessions,
    planner,
    focusTimer,
    analytics: {
      weeklyHours,
      taskStatus: {
        completed: completedTasks,
        pending: pendingTasks
      },
      streakHeatmap,
      subjectActivity: decoratedSubjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        color: subject.color,
        weeklyHours: Math.round((subject.weeklyMinutes / 60) * 10) / 10,
        targetHours: subject.targetHours,
        sessionsCount: subject.totalSessions,
        isWeak: subject.isWeak
      })),
      badges
    },
    insights: {
      weakSubjects,
      todayTasks: tasks.filter((task) => task.plannedDate === today),
      badgeCount: badges.filter((badge) => badge.earned).length,
      nextMilestone:
        hoursRemaining > 0
          ? `${hoursRemaining} more hour${hoursRemaining === 1 ? '' : 's'} to hit this week's goal.`
          : 'Weekly goal complete. Build on the momentum with one more focused block.',
      streakPrompt: studiedToday
        ? 'You already showed up today. Protect the streak with another deliberate session.'
        : 'Keep your streak alive with one focused study block today.'
    }
  };
}

function getSettings(db) {
  const row = db.prepare(`
    SELECT student_name, weekly_goal_hours, focus_duration_minutes
    FROM settings
    WHERE id = 1
  `).get();

  return {
    studentName: row.student_name,
    weeklyGoalHours: Number(row.weekly_goal_hours),
    focusDurationMinutes: Number(row.focus_duration_minutes)
  };
}

function listSubjects(db) {
  const today = getTodayKey();
  const weekStart = shiftDateKey(today, -6);

  return db.prepare(`
    SELECT
      s.id,
      s.name,
      s.color,
      s.target_hours,
      s.created_at,
      COALESCE((
        SELECT SUM(se.duration_minutes)
        FROM sessions se
        WHERE se.subject_id = s.id
          AND se.session_date BETWEEN ? AND ?
      ), 0) AS weekly_minutes,
      COALESCE((
        SELECT COUNT(*)
        FROM sessions se
        WHERE se.subject_id = s.id
      ), 0) AS total_sessions,
      COALESCE((
        SELECT COUNT(*)
        FROM tasks t
        WHERE t.subject_id = s.id
          AND t.completed = 0
      ), 0) AS pending_tasks,
      (
        SELECT MAX(se.session_date)
        FROM sessions se
        WHERE se.subject_id = s.id
      ) AS last_session_date
    FROM subjects s
    ORDER BY s.name COLLATE NOCASE
  `).all(weekStart, today).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    targetHours: Number(row.target_hours),
    weeklyMinutes: Number(row.weekly_minutes),
    totalSessions: Number(row.total_sessions),
    pendingTasks: Number(row.pending_tasks),
    lastSessionDate: row.last_session_date,
    createdAt: row.created_at
  }));
}

function listTasks(db) {
  return db.prepare(`
    SELECT
      t.id,
      t.title,
      t.subject_id,
      t.planned_date,
      t.due_date,
      t.start_time,
      t.duration_minutes,
      t.notes,
      t.completed,
      t.completed_at,
      t.created_at,
      s.name AS subject_name,
      s.color AS subject_color
    FROM tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    ORDER BY t.planned_date ASC, COALESCE(t.start_time, '23:59') ASC, t.created_at ASC
  `).all().map((row) => ({
    id: row.id,
    title: row.title,
    subjectId: row.subject_id,
    subjectName: row.subject_name || 'General Study',
    subjectColor: row.subject_color || '#A0AEC0',
    plannedDate: row.planned_date,
    dueDate: row.due_date,
    startTime: row.start_time,
    durationMinutes: Number(row.duration_minutes),
    notes: row.notes,
    completed: Boolean(row.completed),
    completedAt: row.completed_at,
    createdAt: row.created_at
  }));
}

function listSessions(db) {
  return db.prepare(`
    SELECT
      se.id,
      se.subject_id,
      se.duration_minutes,
      se.source,
      se.notes,
      se.session_date,
      se.created_at,
      s.name AS subject_name,
      s.color AS subject_color
    FROM sessions se
    LEFT JOIN subjects s ON s.id = se.subject_id
    ORDER BY se.session_date DESC, se.created_at DESC
    LIMIT 100
  `).all().map((row) => ({
    id: row.id,
    subjectId: row.subject_id,
    subjectName: row.subject_name || 'General Study',
    subjectColor: row.subject_color || '#A0AEC0',
    durationMinutes: Number(row.duration_minutes),
    source: row.source,
    notes: row.notes,
    sessionDate: row.session_date,
    createdAt: row.created_at
  }));
}

function buildWeeklyHours(db) {
  const today = getTodayKey();
  const start = shiftDateKey(today, -6);
  const rows = db.prepare(`
    SELECT session_date, COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM sessions
    WHERE session_date BETWEEN ? AND ?
    GROUP BY session_date
  `).all(start, today);

  const minutesByDate = new Map(
    rows.map((row) => [row.session_date, Number(row.minutes)])
  );

  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(start, index);
    const minutes = minutesByDate.get(date) || 0;
    return {
      date,
      label: formatWeekday(date),
      hours: Math.round((minutes / 60) * 10) / 10,
      minutes
    };
  });
}

function buildStudyHeatmap(db, days) {
  const today = getTodayKey();
  const start = shiftDateKey(today, -(days - 1));
  const studiedRows = db.prepare(`
    SELECT date
    FROM study_days
    WHERE date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(start, today);

  const sessionRows = db.prepare(`
    SELECT session_date, COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM sessions
    WHERE session_date BETWEEN ? AND ?
    GROUP BY session_date
  `).all(start, today);

  const studiedDates = new Set(studiedRows.map((row) => row.date));
  const minutesByDate = new Map(
    sessionRows.map((row) => [row.session_date, Number(row.minutes)])
  );

  return Array.from({ length: days }, (_, index) => {
    const date = shiftDateKey(start, index);
    const minutes = minutesByDate.get(date) || 0;
    return {
      date,
      label: formatWeekday(date),
      studied: studiedDates.has(date),
      minutes
    };
  });
}

function buildPlanner(tasks) {
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

function pickWeakSubjects(subjects) {
  if (!subjects.length) {
    return [];
  }

  const ranked = [...subjects].sort((left, right) => {
    if (left.weeklyMinutes !== right.weeklyMinutes) {
      return left.weeklyMinutes - right.weeklyMinutes;
    }

    return left.totalSessions - right.totalSessions;
  });

  const threshold = Math.max(1, Math.min(2, ranked.length));
  return ranked
    .filter((subject, index) => index < threshold || subject.weeklyMinutes < 60)
    .slice(0, 2)
    .map((subject) => ({
      id: subject.id,
      name: subject.name,
      color: subject.color,
      weeklyHours: Math.round((subject.weeklyMinutes / 60) * 10) / 10,
      targetHours: subject.targetHours
    }));
}

function buildBadges(stats) {
  return [
    {
      id: 'first-session',
      name: 'Fresh Start',
      description: 'Complete your first study session.',
      earned: stats.totalSessions >= 1
    },
    {
      id: 'streak-keeper',
      name: 'Streak Keeper',
      description: 'Study for three days in a row.',
      earned: stats.streakDays >= 3
    },
    {
      id: 'weekly-warrior',
      name: 'Weekly Warrior',
      description: 'Hit your weekly study goal.',
      earned: stats.weeklyHoursTotal >= stats.weeklyGoalHours
    },
    {
      id: 'focus-master',
      name: 'Focus Master',
      description: 'Finish five focus sessions.',
      earned: stats.focusSessions >= 5
    },
    {
      id: 'task-tamer',
      name: 'Task Tamer',
      description: 'Complete five study tasks.',
      earned: stats.completedTasks >= 5
    }
  ];
}

function buildMotivation(stats, focusTimer) {
  if (focusTimer.status === 'running') {
    return 'Focus mode is live. Stay with the current block and let the timer do the tracking.';
  }

  if (!stats.studiedToday) {
    return 'Keep your streak alive with one deliberate study block today.';
  }

  if (stats.progressPercent < 60) {
    return 'You are building momentum. One more strong session will move the week forward.';
  }

  if (stats.progressPercent < 100) {
    return 'You are close to goal pace. Protect the routine and finish the week strong.';
  }

  return 'Weekly goal complete. Use the momentum to turn consistency into a personal best.';
}

function calculateCurrentStreak(heatmap) {
  let streak = 0;
  for (let index = heatmap.length - 1; index >= 0; index -= 1) {
    if (!heatmap[index].studied) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function calculateCurrentStreakDays(db) {
  const rows = db.prepare(`
    SELECT date
    FROM study_days
    ORDER BY date DESC
    LIMIT 365
  `).all();

  const dates = new Set(rows.map((row) => row.date));
  let streak = 0;
  let cursor = getTodayKey();

  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
}

function normalizeFocusTimer(db) {
  const row = getFocusTimerRow(db);
  const timer = buildFocusTimerPayload(row);

  if (timer.status !== 'running' || timer.remainingSec > 0) {
    return timer;
  }

  let sessionId = timer.autoSavedSessionId;
  if (!sessionId) {
    sessionId = insertSession(db, {
      subjectId: timer.subjectId,
      durationMinutes: Math.max(1, Math.round(timer.durationSec / 60)),
      source: 'focus',
      notes: timer.label || 'Focus Session',
      sessionDate: getTodayKey()
    });
  }

  db.prepare(`
    UPDATE focus_timer
    SET status = 'completed',
        elapsed_sec = ?,
        started_at = NULL,
        auto_saved_session_id = ?,
        last_completed_at = ?,
        updated_at = ?
    WHERE id = 1
  `).run(timer.durationSec, sessionId, nowIso(), nowIso());

  return buildFocusTimerPayload(getFocusTimerRow(db));
}

function getFocusTimerRow(db) {
  return db.prepare(`
    SELECT
      ft.id,
      ft.status,
      ft.duration_sec,
      ft.elapsed_sec,
      ft.started_at,
      ft.subject_id,
      ft.label,
      ft.auto_saved_session_id,
      ft.last_completed_at,
      ft.updated_at,
      s.name AS subject_name,
      s.color AS subject_color
    FROM focus_timer ft
    LEFT JOIN subjects s ON s.id = ft.subject_id
    WHERE ft.id = 1
  `).get();
}

function buildFocusTimerPayload(row) {
  if (!row) {
    return {
      status: 'idle',
      durationSec: 1500,
      elapsedSec: 0,
      remainingSec: 1500,
      progressPercent: 0,
      startedAt: null,
      subjectId: null,
      subjectName: 'General Focus',
      subjectColor: '#2F6BFF',
      label: 'Focus Session',
      autoSavedSessionId: null,
      lastCompletedAt: null,
      updatedAt: null
    };
  }

  let elapsedSec = Number(row.elapsed_sec);
  if (row.status === 'running' && row.started_at) {
    const runningFor = Math.max(
      0,
      Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)
    );
    elapsedSec += runningFor;
  }

  elapsedSec = Math.min(elapsedSec, Number(row.duration_sec));
  const remainingSec = Math.max(0, Number(row.duration_sec) - elapsedSec);
  const progressPercent = Number(row.duration_sec)
    ? Math.round((elapsedSec / Number(row.duration_sec)) * 100)
    : 0;

  return {
    id: row.id,
    status: row.status,
    durationSec: Number(row.duration_sec),
    elapsedSec,
    remainingSec,
    progressPercent,
    startedAt: row.started_at,
    subjectId: row.subject_id,
    subjectName: row.subject_name || 'General Focus',
    subjectColor: row.subject_color || '#2F6BFF',
    label: row.label,
    autoSavedSessionId: row.auto_saved_session_id,
    lastCompletedAt: row.last_completed_at,
    updatedAt: row.updated_at
  };
}

function insertSession(db, session) {
  const result = db.prepare(`
    INSERT INTO sessions (
      subject_id,
      duration_minutes,
      source,
      notes,
      session_date,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    session.subjectId,
    session.durationMinutes,
    session.source || 'manual',
    session.notes || '',
    session.sessionDate || getTodayKey(),
    nowIso()
  );

  markStudyDay(db, session.sessionDate || getTodayKey(), session.source || 'session');
  return Number(result.lastInsertRowid);
}

function markStudyDay(db, date, source) {
  db.prepare(`
    INSERT OR IGNORE INTO study_days (date, source, created_at)
    VALUES (?, ?, ?)
  `).run(date, source, nowIso());
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw createHttpError(400, 'Request body must be valid JSON.');
  }
}

function validateSubjectPayload(body) {
  const name = cleanText(body.name, 32, 'Subject name');
  const color = validateColor(body.color || '#4B7BF5');
  const targetHours = clampNumber(body.targetHours, 0.5, 40, 'Target hours');

  return { name, color, targetHours };
}

function validateTaskPayload(body, db) {
  const title = cleanText(body.title, 80, 'Task title');
  const subjectId = body.subjectId ? validateSubjectId(db, body.subjectId) : null;
  const plannedDate = validateDate(body.plannedDate, 'Planned date');
  const dueDate = body.dueDate ? validateDate(body.dueDate, 'Due date') : null;
  const startTime = body.startTime ? validateTime(body.startTime, 'Start time') : null;
  const durationMinutes = clampNumber(body.durationMinutes, 15, 480, 'Duration');
  const notes = cleanOptionalText(body.notes, 240);
  const completed = Boolean(body.completed);

  return {
    title,
    subjectId,
    plannedDate,
    dueDate,
    startTime,
    durationMinutes,
    notes,
    completed
  };
}

function validateSessionPayload(body, db) {
  const subjectId = body.subjectId ? validateSubjectId(db, body.subjectId) : null;
  const durationMinutes = clampNumber(body.durationMinutes, 5, 600, 'Study duration');
  const notes = cleanOptionalText(body.notes, 240);
  const sessionDate = body.sessionDate ? validateDate(body.sessionDate, 'Session date') : getTodayKey();
  const source = ['manual', 'focus'].includes(body.source) ? body.source : 'manual';

  return {
    subjectId,
    durationMinutes,
    notes,
    sessionDate,
    source
  };
}

function validateFocusStartPayload(body, db) {
  const settings = getSettings(db);
  const durationSec = clampNumber(
    body.durationSec || settings.focusDurationMinutes * 60,
    600,
    10800,
    'Focus duration'
  );
  const subjectId = body.subjectId ? validateSubjectId(db, body.subjectId) : null;
  const label = cleanOptionalText(body.label, 60) || 'Focus Session';

  return { durationSec, subjectId, label };
}

function validateSettingsPayload(body) {
  const studentName = cleanText(body.studentName, 40, 'Student name');
  const weeklyGoalHours = clampNumber(body.weeklyGoalHours, 1, 60, 'Weekly goal');
  const focusDurationMinutes = clampNumber(
    body.focusDurationMinutes,
    10,
    180,
    'Focus duration'
  );

  return { studentName, weeklyGoalHours, focusDurationMinutes };
}

function validateSubjectId(db, value) {
  const subjectId = Number(value);
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    throw createHttpError(400, 'Subject id must be a valid integer.');
  }

  assertSubjectExists(db, subjectId);
  return subjectId;
}

function assertSubjectExists(db, subjectId) {
  const row = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId);
  if (!row) {
    throw createHttpError(404, 'Subject was not found.');
  }
}

function assertTaskExists(db, taskId) {
  const row = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
  if (!row) {
    throw createHttpError(404, 'Task was not found.');
  }
}

function cleanText(value, maxLength, label) {
  const text = String(value || '').trim();
  if (!text) {
    throw createHttpError(400, `${label} is required.`);
  }
  return text.slice(0, maxLength);
}

function cleanOptionalText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function clampNumber(value, min, max, label) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw createHttpError(400, `${label} must be a number.`);
  }

  return Math.min(max, Math.max(min, numericValue));
}

function validateColor(value) {
  const color = String(value || '').trim();
  if (!/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(color)) {
    throw createHttpError(400, 'Color must be a valid hex value.');
  }
  return color.toUpperCase();
}

function validateDate(value, label) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createHttpError(400, `${label} must use YYYY-MM-DD format.`);
  }
  return date;
}

function validateTime(value, label) {
  const time = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw createHttpError(400, `${label} must use HH:MM format.`);
  }
  return time;
}

function nowIso() {
  return new Date().toISOString();
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

function getGreeting() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    hour12: false
  });

  const hour = Number(
    formatter
      .formatToParts(new Date())
      .find((part) => part.type === 'hour')?.value || '12'
  );

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 18) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

function getQuoteForDate(dateKey) {
  const numericDay = Number(dateKey.replaceAll('-', ''));
  return QUOTES[numericDay % QUOTES.length];
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveStaticFile(res, requestPath) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const relativePath = normalizedPath.replace(/^\/+/, '');
  const absolutePath = path.join(PUBLIC_DIR, relativePath);

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    sendPlainText(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(absolutePath, (error, fileBuffer) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendPlainText(res, 404, 'Not found');
        return;
      }

      sendPlainText(res, 500, 'Unable to read the requested file.');
      return;
    }

    res.writeHead(200, {
      'Content-Type': getContentType(absolutePath)
    });
    res.end(fileBuffer);
  });
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };

  return contentTypes[extension] || 'application/octet-stream';
}

function sendPlainText(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end(message);
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

process.on('uncaughtException', (error) => {
  console.error('StudySync uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('StudySync unhandled rejection:', error);
});

if (require.main === module) {
  const app = createApp();
  app.server.listen(PORT, () => {
    console.log(`${APP_NAME} is running at http://localhost:${PORT}`);
  });
}

module.exports = {
  createApp,
  buildBootstrap
};
