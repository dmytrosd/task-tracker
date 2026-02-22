import { useState, useEffect } from "react";

const CLIENT_ID = "1063965843339-2jc6ukp1ae5raild4e7rqq2pqns88fr2.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

const CATEGORIES = [
  { id: "work", label: "Работа", color: "#FF6B35", emoji: "💼" },
  { id: "personal", label: "Личное", color: "#4ECDC4", emoji: "🌿" },
  { id: "health", label: "Здоровье", color: "#FF85A1", emoji: "💪" },
  { id: "study", label: "Учёба", color: "#A78BFA", emoji: "📚" },
  { id: "sport", label: "Спорт", color: "#34D399", emoji: "🏆" },
];

const PRIORITIES = [
  { id: "low", label: "Низкий", color: "#6EE7B7" },
  { id: "medium", label: "Средний", color: "#FCD34D" },
  { id: "high", label: "Высокий", color: "#F87171" },
];

const formatDate = (d) => {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

const isOverdue = (d) => {
  if (!d) return false;
  return new Date(d) < new Date() && new Date(d).toDateString() !== new Date().toDateString();
};

export default function TaskTracker() {
  const [tasks, setTasks] = useState([
    { id: 1, text: "Сделать презентацию", description: "Подготовить слайды для встречи с клиентом", category: "work", priority: "high", deadline: "2026-02-25", done: false, calendarEventId: null, completedAt: null },
    { id: 2, text: "Пробежка 5 км", description: "", category: "health", priority: "medium", deadline: "2026-02-22", done: false, calendarEventId: null, completedAt: null },
    { id: 3, text: "Прочитать главу книги", description: "", category: "study", priority: "low", deadline: null, done: true, calendarEventId: null, completedAt: "2026-02-20" },
    { id: 4, text: "Утренняя пробежка", description: "", category: "sport", priority: "medium", deadline: null, done: true, calendarEventId: null, completedAt: "2026-02-19" },
    { id: 5, text: "Подтягивания 3 подхода", description: "", category: "sport", priority: "low", deadline: null, done: false, calendarEventId: null, completedAt: null },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [filter, setFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [newTask, setNewTask] = useState({ text: "", description: "", category: "work", priority: "medium", deadline: "" });
  const [tab, setTab] = useState("tasks");

  const [googleUser, setGoogleUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [gisReady, setGisReady] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGisReady(true);
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  useEffect(() => {
    if (!gisReady || !window.google) return;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) { showToast("Ошибка авторизации", "error"); return; }
        setAccessToken(response.access_token);
        fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${response.access_token}` },
        }).then(r => r.json()).then(info => {
          setGoogleUser(info);
          showToast(`Привет, ${info.given_name}! 👋`);
        });
      },
    });
    setTokenClient(client);
  }, [gisReady]);

  const handleLogin = () => { if (tokenClient) tokenClient.requestAccessToken(); };
  const handleLogout = () => {
    if (accessToken && window.google) window.google.accounts.oauth2.revoke(accessToken);
    setAccessToken(null); setGoogleUser(null);
    showToast("Вышли из аккаунта");
  };

  const addToCalendar = async (task) => {
    if (!accessToken) { showToast("Сначала войди в Google", "error"); return; }
    if (!task.deadline) { showToast("Добавь дедлайн к задаче", "error"); return; }
    setSyncingId(task.id);
    const c = CATEGORIES.find(x => x.id === task.category);
    const p = PRIORITIES.find(x => x.id === task.priority);
    const event = {
      summary: `${c?.emoji} ${task.text}`,
      description: `${task.description ? task.description + "\n\n" : ""}Приоритет: ${p?.label}\nКатегория: ${c?.label}\n\nДобавлено из Task Tracker`,
      start: { date: task.deadline },
      end: { date: task.deadline },
      colorId: task.priority === "high" ? "11" : task.priority === "medium" ? "5" : "2",
    };
    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (res.status === 401) { setAccessToken(null); setGoogleUser(null); showToast("Сессия истекла", "error"); return; }
      const data = await res.json();
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, calendarEventId: data.id } : t));
      showToast("Добавлено в Google Calendar! 📅");
    } catch { showToast("Ошибка при добавлении", "error"); }
    finally { setSyncingId(null); }
  };

  const removeFromCalendar = async (task) => {
    if (!accessToken || !task.calendarEventId) return;
    setSyncingId(task.id);
    try {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.calendarEventId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, calendarEventId: null } : t));
      showToast("Удалено из Google Calendar");
    } catch { showToast("Ошибка при удалении", "error"); }
    finally { setSyncingId(null); }
  };

  const addTask = () => {
    if (!newTask.text.trim()) return;
    setTasks([...tasks, { ...newTask, id: Date.now(), done: false, deadline: newTask.deadline || null, calendarEventId: null, completedAt: null }]);
    setNewTask({ text: "", description: "", category: "work", priority: "medium", deadline: "" });
    setShowForm(false);
  };

  const toggleDone = (id) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? new Date().toISOString().split("T")[0] : null } : t
    ));
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
  };

  const activeTasks = tasks.filter(t => !t.done && (filter === "all" || t.category === filter));
  const doneTasks = tasks.filter(t => t.done && (archiveFilter === "all" || t.category === archiveFilter));

  const groupedArchive = doneTasks.reduce((acc, t) => {
    const key = t.completedAt || "Без даты";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});
  const archiveDates = Object.keys(groupedArchive).sort((a, b) => b.localeCompare(a));

  const cat = (id) => CATEGORIES.find(c => c.id === id);
  const pri = (id) => PRIORITIES.find(p => p.id === id);

  // всегда берём свежую версию задачи из стейта
  const liveTask = selectedTask ? tasks.find(t => t.id === selectedTask.id) : null;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0F0F14", minHeight: "100vh", display: "flex", justifyContent: "center" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .phone { width: 390px; min-height: 100vh; background: #0F0F14; display: flex; flex-direction: column; overflow: hidden; }
        .header { padding: 52px 24px 16px; }
        .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .greeting { color: #5A5A72; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-family: 'DM Mono', monospace; }
        .title { color: #F0F0F8; font-size: 28px; font-weight: 700; margin-top: 4px; }
        .stats { display: flex; gap: 12px; margin-top: 20px; }
        .stat { flex: 1; background: #1A1A24; border-radius: 16px; padding: 14px 16px; }
        .stat-num { font-size: 24px; font-weight: 700; color: #F0F0F8; }
        .stat-label { font-size: 11px; color: #5A5A72; margin-top: 2px; font-family: 'DM Mono', monospace; }
        .google-btn { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 100px; border: 1px solid #2A2A38; background: #1A1A24; color: #F0F0F8; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; white-space: nowrap; }
        .google-btn:hover { border-color: #FF6B35; }
        .google-avatar { width: 22px; height: 22px; border-radius: 50%; }
        .filters { display: flex; gap: 8px; padding: 0 24px 16px; overflow-x: auto; scrollbar-width: none; }
        .filters::-webkit-scrollbar { display: none; }
        .chip { padding: 8px 14px; border-radius: 100px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; white-space: nowrap; transition: all 0.2s; }
        .chip-active { color: #0F0F14; }
        .chip-inactive { background: #1A1A24; color: #5A5A72; }
        .task-list { flex: 1; padding: 0 24px; overflow-y: auto; scrollbar-width: none; }
        .task-list::-webkit-scrollbar { display: none; }
        .task-card { background: #1A1A24; border-radius: 18px; padding: 16px; margin-bottom: 12px; display: flex; gap: 12px; align-items: flex-start; border: 1px solid #22222E; cursor: pointer; transition: border-color 0.2s; }
        .task-card:hover { border-color: #3A3A50; }
        .task-done-card { opacity: 0.5; }
        .check-box { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .task-body { flex: 1; min-width: 0; }
        .task-text { font-size: 15px; font-weight: 600; color: #F0F0F8; line-height: 1.4; }
        .task-text-done { text-decoration: line-through; color: #5A5A72; }
        .task-desc-preview { font-size: 12px; color: #5A5A72; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .task-meta { display: flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
        .tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 600; }
        .deadline { font-size: 11px; font-family: 'DM Mono', monospace; color: #5A5A72; }
        .deadline-overdue { color: #F87171; }
        .task-actions { display: flex; flex-direction: column; gap: 6px; }
        .icon-btn { width: 28px; height: 28px; border-radius: 8px; background: #22222E; border: none; color: #5A5A72; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s; }
        .icon-btn:hover { background: #2A2A38; color: #F0F0F8; }
        .icon-btn-synced { background: #1A3A2A; color: #6EE7B7; }
        .fab { position: fixed; bottom: 32px; right: calc(50% - 195px + 24px); width: 56px; height: 56px; border-radius: 18px; background: linear-gradient(135deg, #FF6B35, #FF85A1); border: none; color: white; font-size: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(255,107,53,0.4); transition: transform 0.2s; z-index: 10; }
        .fab:active { transform: scale(0.93); }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 20; display: flex; align-items: flex-end; justify-content: center; }
        .modal { width: 390px; background: #1A1A24; border-radius: 28px 28px 0 0; padding: 24px; max-height: 90vh; overflow-y: auto; }
        .modal-title { color: #F0F0F8; font-size: 20px; font-weight: 700; margin-bottom: 20px; }
        .input { width: 100%; background: #0F0F14; border: 1px solid #2A2A38; border-radius: 14px; padding: 14px 16px; color: #F0F0F8; font-size: 15px; font-family: 'DM Sans', sans-serif; outline: none; margin-bottom: 12px; }
        .input::placeholder { color: #3A3A50; }
        .input:focus { border-color: #FF6B35; }
        .textarea { width: 100%; background: #0F0F14; border: 1px solid #2A2A38; border-radius: 14px; padding: 14px 16px; color: #F0F0F8; font-size: 15px; font-family: 'DM Sans', sans-serif; outline: none; margin-bottom: 12px; resize: none; min-height: 90px; line-height: 1.5; }
        .textarea::placeholder { color: #3A3A50; }
        .textarea:focus { border-color: #FF6B35; }
        .label { color: #5A5A72; font-size: 12px; font-family: 'DM Mono', monospace; letter-spacing: 0.06em; margin-bottom: 8px; text-transform: uppercase; }
        .row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .pill { padding: 8px 14px; border-radius: 100px; font-size: 13px; font-weight: 600; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; }
        .pill-selected { border-color: white; }
        .btn-add { width: 100%; padding: 16px; border-radius: 16px; background: linear-gradient(135deg, #FF6B35, #FF85A1); border: none; color: white; font-size: 16px; font-weight: 700; font-family: 'DM Sans', sans-serif; cursor: pointer; margin-top: 4px; }
        .tabs { display: flex; padding: 0 24px 16px; }
        .tab-btn { flex: 1; padding: 10px; border: none; background: none; cursor: pointer; font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; color: #5A5A72; border-bottom: 2px solid #22222E; transition: all 0.2s; }
        .tab-btn-active { color: #FF6B35; border-bottom-color: #FF6B35; }
        .empty { text-align: center; padding: 48px 24px; color: #3A3A50; font-size: 15px; }
        .empty-icon { font-size: 40px; margin-bottom: 12px; }
        .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 12px 20px; border-radius: 14px; font-size: 14px; font-weight: 600; z-index: 100; white-space: nowrap; }
        .toast-success { background: #1A3A2A; color: #6EE7B7; border: 1px solid #2A4A3A; }
        .toast-error { background: #3A1A1A; color: #F87171; border: 1px solid #4A2A2A; }
        .gcal-banner { margin: 0 24px 16px; background: #1A2A3A; border: 1px solid #2A3A4A; border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
        .gcal-banner-text { font-size: 13px; color: #7ABAFF; flex: 1; }
        .archive-date-header { color: #5A5A72; font-size: 11px; font-family: 'DM Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; padding: 8px 0 6px; display: flex; align-items: center; gap: 8px; }
        .archive-date-header::after { content: ''; flex: 1; height: 1px; background: #22222E; }
        .archive-stats { margin: 0 24px 12px; background: #1A2A1A; border: 1px solid #2A3A2A; border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
        .archive-stats-text { font-size: 13px; color: #6EE7B7; }
        .restore-btn { padding: 4px 10px; border-radius: 8px; background: #22222E; border: none; color: #5A5A72; cursor: pointer; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif; transition: all 0.2s; white-space: nowrap; }
        .restore-btn:hover { background: #2A3A2A; color: #6EE7B7; }
        .spinning { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .detail-modal { width: 390px; background: #1A1A24; border-radius: 28px 28px 0 0; max-height: 92vh; overflow-y: auto; }
        .detail-header { padding: 24px 24px 16px; border-bottom: 1px solid #22222E; }
        .detail-back { display: flex; align-items: center; gap: 6px; color: #5A5A72; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 16px; background: none; border: none; font-family: 'DM Sans', sans-serif; padding: 0; transition: color 0.2s; }
        .detail-back:hover { color: #F0F0F8; }
        .detail-title { color: #F0F0F8; font-size: 22px; font-weight: 700; line-height: 1.3; }
        .detail-title-done { text-decoration: line-through; color: #5A5A72; }
        .detail-description { color: #9A9AB0; font-size: 15px; line-height: 1.6; margin-top: 12px; white-space: pre-wrap; }
        .detail-body { padding: 8px 24px; }
        .detail-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid #22222E; }
        .detail-row-label { color: #5A5A72; font-size: 13px; font-family: 'DM Mono', monospace; }
        .detail-footer { padding: 16px 24px 40px; display: flex; gap: 10px; }
        .btn-done-active { flex: 1; padding: 15px; border-radius: 14px; background: linear-gradient(135deg, #FF6B35, #FF85A1); border: none; color: white; font-size: 15px; font-weight: 700; font-family: 'DM Sans', sans-serif; cursor: pointer; }
        .btn-done-completed { flex: 1; padding: 15px; border-radius: 14px; background: #1A3A2A; border: 1px solid #2A4A3A; color: #6EE7B7; font-size: 15px; font-weight: 700; font-family: 'DM Sans', sans-serif; cursor: pointer; }
        .btn-delete { padding: 15px 18px; border-radius: 14px; background: #2E1A1A; border: 1px solid #3A2A2A; color: #F87171; font-size: 16px; cursor: pointer; transition: background 0.2s; }
        .btn-delete:hover { background: #3E2A2A; }
        .btn-calendar { width: 100%; padding: 14px; border-radius: 14px; border: 1px solid #2A3A4A; background: #1A2A3A; color: #7ABAFF; font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; margin: 0 24px 12px; width: calc(100% - 48px); display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-calendar-synced { background: #1A3A2A; border-color: #2A4A3A; color: #6EE7B7; }
      `}</style>

      {toast && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : "toast-success"}`}>{toast.msg}</div>
      )}

      <div className="phone">
        <div className="header">
          <div className="header-top">
            <div>
              <div className="greeting">Сегодня, {new Date().toLocaleDateString("ru-RU", { weekday: "long" })}</div>
              <div className="title">Мои задачи</div>
            </div>
            {googleUser ? (
              <button className="google-btn" onClick={handleLogout}>
                <img className="google-avatar" src={googleUser.picture} alt="" />
                <span>{googleUser.given_name}</span>
              </button>
            ) : (
              <button className="google-btn" onClick={handleLogin}>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Войти
              </button>
            )}
          </div>
          <div className="stats">
            <div className="stat">
              <div className="stat-num">{tasks.filter(t => !t.done).length}</div>
              <div className="stat-label">Активных</div>
            </div>
            <div className="stat">
              <div className="stat-num">{tasks.filter(t => t.priority === "high" && !t.done).length}</div>
              <div className="stat-label">Срочных</div>
            </div>
            <div className="stat">
              <div className="stat-num">{tasks.filter(t => t.calendarEventId).length}</div>
              <div className="stat-label" style={{ color: googleUser ? "#6EE7B7" : undefined }}>В Calendar</div>
            </div>
          </div>
        </div>

        {!googleUser && (
          <div className="gcal-banner">
            <span style={{ fontSize: 18 }}>📅</span>
            <span className="gcal-banner-text">Войди в Google, чтобы синхронизировать с Calendar</span>
          </div>
        )}

        <div className="tabs">
          <button className={`tab-btn ${tab === "tasks" ? "tab-btn-active" : ""}`} onClick={() => setTab("tasks")}>Активные</button>
          <button className={`tab-btn ${tab === "done" ? "tab-btn-active" : ""}`} onClick={() => setTab("done")}>Архив</button>
        </div>

        {tab === "tasks" && (
          <div className="filters">
            {[{ id: "all", label: "Все", color: "#FF6B35" }, ...CATEGORIES].map(c => (
              <button key={c.id} className={`chip ${filter === c.id ? "chip-active" : "chip-inactive"}`}
                style={filter === c.id ? { background: c.color } : {}} onClick={() => setFilter(c.id)}>
                {"emoji" in c ? c.emoji + " " : ""}{c.label}
              </button>
            ))}
          </div>
        )}

        {tab === "done" && (
          <>
            <div className="archive-stats">
              <span style={{ fontSize: 18 }}>🗂</span>
              <span className="archive-stats-text">Выполнено: <b>{tasks.filter(t => t.done).length}</b> задач</span>
            </div>
            <div className="filters">
              {[{ id: "all", label: "Все", color: "#6EE7B7" }, ...CATEGORIES].map(c => (
                <button key={c.id} className={`chip ${archiveFilter === c.id ? "chip-active" : "chip-inactive"}`}
                  style={archiveFilter === c.id ? { background: c.color } : {}} onClick={() => setArchiveFilter(c.id)}>
                  {"emoji" in c ? c.emoji + " " : ""}{c.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="task-list">
          {tab === "tasks" && activeTasks.length === 0 && (
            <div className="empty"><div className="empty-icon">✅</div>Нет задач в этой категории</div>
          )}
          {tab === "done" && doneTasks.length === 0 && (
            <div className="empty"><div className="empty-icon">🗂</div>Архив пуст</div>
          )}

          {tab === "tasks" && activeTasks.map(task => {
            const c = cat(task.category);
            const p = pri(task.priority);
            const overdue = isOverdue(task.deadline);
            const isSyncing = syncingId === task.id;
            const isSynced = !!task.calendarEventId;
            return (
              <div key={task.id} className="task-card" onClick={() => setSelectedTask(task)}>
                <div className="check-box" style={{ background: "transparent", border: "2px solid #3A3A50" }}
                  onClick={e => { e.stopPropagation(); toggleDone(task.id); }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: p?.color }} />
                </div>
                <div className="task-body">
                  <div className="task-text">{task.text}</div>
                  {task.description ? <div className="task-desc-preview">{task.description}</div> : null}
                  <div className="task-meta">
                    <span className="tag" style={{ background: c?.color + "22", color: c?.color }}>{c?.emoji} {c?.label}</span>
                    <span className="tag" style={{ background: p?.color + "22", color: p?.color }}>{p?.label}</span>
                    {task.deadline && (
                      <span className={`deadline ${overdue ? "deadline-overdue" : ""}`}>
                        {overdue ? "⚠ " : "📅 "}{formatDate(task.deadline)}
                      </span>
                    )}
                    {isSynced && <span className="tag" style={{ background: "#6EE7B722", color: "#6EE7B7" }}>✓ Cal</span>}
                  </div>
                </div>
                <div className="task-actions" onClick={e => e.stopPropagation()}>
                  {googleUser && (
                    <button className={`icon-btn ${isSynced ? "icon-btn-synced" : ""}`}
                      onClick={() => isSynced ? removeFromCalendar(task) : addToCalendar(task)}>
                      {isSyncing ? <span className="spinning">⟳</span> : isSynced ? "✓" : "📅"}
                    </button>
                  )}
                  <button className="icon-btn" style={{ fontSize: 16 }} onClick={() => deleteTask(task.id)}>×</button>
                </div>
              </div>
            );
          })}

          {tab === "done" && archiveDates.map(date => (
            <div key={date}>
              <div className="archive-date-header">
                {date === new Date().toISOString().split("T")[0] ? "Сегодня" :
                 date === new Date(Date.now() - 86400000).toISOString().split("T")[0] ? "Вчера" :
                 date !== "Без даты" ? new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "Без даты"}
              </div>
              {groupedArchive[date].map(task => {
                const c = cat(task.category);
                const p = pri(task.priority);
                return (
                  <div key={task.id} className="task-card task-done-card" onClick={() => setSelectedTask(task)}>
                    <div className="check-box" style={{ background: p?.color, border: "none" }}
                      onClick={e => { e.stopPropagation(); toggleDone(task.id); }}>
                      <span style={{ color: "#0F0F14", fontSize: 13, fontWeight: 700 }}>✓</span>
                    </div>
                    <div className="task-body">
                      <div className="task-text task-text-done">{task.text}</div>
                      {task.description ? <div className="task-desc-preview">{task.description}</div> : null}
                      <div className="task-meta">
                        <span className="tag" style={{ background: c?.color + "22", color: c?.color }}>{c?.emoji} {c?.label}</span>
                        {task.deadline && <span className="deadline">📅 {formatDate(task.deadline)}</span>}
                      </div>
                    </div>
                    <div className="task-actions" onClick={e => e.stopPropagation()}>
                      <button className="restore-btn" onClick={() => toggleDone(task.id)}>↩ Вернуть</button>
                      <button className="icon-btn" style={{ fontSize: 16 }} onClick={() => deleteTask(task.id)}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ height: 100 }} />
        </div>

        <button className="fab" onClick={() => setShowForm(true)}>+</button>
      </div>

      {/* Детальный просмотр */}
      {liveTask && (
        <div className="modal-bg" onClick={() => setSelectedTask(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            {(() => {
              const task = liveTask;
              const c = cat(task.category);
              const p = pri(task.priority);
              const overdue = isOverdue(task.deadline);
              const isSyncing = syncingId === task.id;
              const isSynced = !!task.calendarEventId;
              return (
                <>
                  <div className="detail-header">
                    <button className="detail-back" onClick={() => setSelectedTask(null)}>← Назад</button>
                    <div className={`detail-title ${task.done ? "detail-title-done" : ""}`}>{task.text}</div>
                    {task.description ? <div className="detail-description">{task.description}</div> : null}
                  </div>

                  <div className="detail-body">
                    <div className="detail-row">
                      <span className="detail-row-label">Категория</span>
                      <span className="tag" style={{ background: c?.color + "22", color: c?.color }}>{c?.emoji} {c?.label}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-row-label">Приоритет</span>
                      <span className="tag" style={{ background: p?.color + "22", color: p?.color }}>{p?.label}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-row-label">Дедлайн</span>
                      <span style={{ color: overdue ? "#F87171" : "#F0F0F8", fontSize: 14, fontWeight: 600 }}>
                        {task.deadline ? (overdue ? "⚠ " : "") + formatDate(task.deadline) : "Не указан"}
                      </span>
                    </div>
                    {task.done && task.completedAt && (
                      <div className="detail-row">
                        <span className="detail-row-label">Выполнено</span>
                        <span style={{ color: "#6EE7B7", fontSize: 14, fontWeight: 600 }}>✓ {formatDate(task.completedAt)}</span>
                      </div>
                    )}
                    {isSynced && (
                      <div className="detail-row">
                        <span className="detail-row-label">Google Calendar</span>
                        <span style={{ color: "#6EE7B7", fontSize: 14, fontWeight: 600 }}>✓ Добавлено</span>
                      </div>
                    )}
                  </div>

                  {googleUser && !task.done && (
                    <button className={`btn-calendar ${isSynced ? "btn-calendar-synced" : ""}`}
                      onClick={() => isSynced ? removeFromCalendar(task) : addToCalendar(task)}>
                      {isSyncing ? <span className="spinning">⟳</span> : "📅 "}
                      {isSynced ? "Удалить из Google Calendar" : "Добавить в Google Calendar"}
                    </button>
                  )}

                  <div className="detail-footer">
                    <button className={task.done ? "btn-done-completed" : "btn-done-active"}
                      onClick={() => toggleDone(task.id)}>
                      {task.done ? "↩ Вернуть в активные" : "✓ Отметить выполненным"}
                    </button>
                    <button className="btn-delete" onClick={() => deleteTask(task.id)}>🗑</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Форма создания */}
      {showForm && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-title">Новая задача</div>
            <input className="input" placeholder="Что нужно сделать?" value={newTask.text}
              onChange={e => setNewTask({ ...newTask, text: e.target.value })} autoFocus />
            <textarea className="textarea" placeholder="Описание (необязательно)" value={newTask.description}
              onChange={e => setNewTask({ ...newTask, description: e.target.value })} />
            <div className="label">Категория</div>
            <div className="row">
              {CATEGORIES.map(c => (
                <button key={c.id} className={`pill ${newTask.category === c.id ? "pill-selected" : ""}`}
                  style={{ background: c.color + "22", color: c.color, borderColor: newTask.category === c.id ? c.color : "transparent" }}
                  onClick={() => setNewTask({ ...newTask, category: c.id })}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            <div className="label">Приоритет</div>
            <div className="row">
              {PRIORITIES.map(p => (
                <button key={p.id} className={`pill ${newTask.priority === p.id ? "pill-selected" : ""}`}
                  style={{ background: p.color + "22", color: p.color, borderColor: newTask.priority === p.id ? p.color : "transparent" }}
                  onClick={() => setNewTask({ ...newTask, priority: p.id })}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="label">Дедлайн (необязательно)</div>
            <input type="date" className="input" value={newTask.deadline}
              onChange={e => setNewTask({ ...newTask, deadline: e.target.value })} />
            <button className="btn-add" onClick={addTask}>Добавить задачу</button>
          </div>
        </div>
      )}
    </div>
  );
}
