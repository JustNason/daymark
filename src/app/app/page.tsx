"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  dateInTimezone,
  sameZonedDay,
  wallTimeToUtc,
  zonedInputValue,
  zonedMidnight,
  zonedPartsOf,
  zonedTime,
} from "@/lib/timezone";
import { useTheme } from "next-themes";
import {
  format,
  addDays,
  addMonths,
  subMonths,
  startOfWeek,
  startOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from "date-fns";
import {
  AlarmClock,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";

type Section =
  | "Today"
  | "Calendar"
  | "Tasks"
  | "Projects"
  | "Courses"
  | "Assignments"
  | "AI Planner"
  | "Notifications"
  | "Settings";
type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_at: string | null;
  estimated_minutes: number | null;
  project_id: string | null;
  assignment_id?: string | null;
  created_at: string;
};
type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  status: string;
  target_date: string | null;
  updated_at?: string;
};
type Course = {
  id: string;
  name: string;
  selected: boolean;
  auto_import: boolean;
  external_id: string | null;
  section_external_id: string | null;
};
type Event = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  color: string;
  category: string;
  description: string;
};
type WorkSession = {
  id: string;
  task_id: string;
  starts_at: string;
  ends_at: string;
  status: "planned" | "done" | "skipped";
};
type IntegrationState = { provider: string; status: string; last_synced_at: string | null; last_error: string | null };
type Assignment = {
  id: string;
  title: string;
  description: string;
  personal_title?: string | null;
  personal_description?: string | null;
  original_due_at: string | null;
  personal_due_at: string | null;
  personal_completed: boolean | null;
  original_completed: boolean | null;
  course_id: string | null;
  url: string | null;
};
type Proposal = {
  id: string;
  slots: { id: string; taskId: string; title: string; start: Date; end: Date; selected: boolean }[];
  explanation?: string;
};
const nav: { title: string; items: Section[] }[] = [
  {
    title: "Personal",
    items: ["Today", "Calendar", "Tasks", "Projects"],
  },
  { title: "Academics", items: ["Courses", "Assignments"] },
  { title: "Tools", items: ["AI Planner", "Notifications", "Settings"] },
];
const icons: Record<Section, React.ElementType> = {
  Today: LayoutDashboard,
  Calendar: CalendarDays,
  Tasks: ListTodo,
  Projects: FolderKanban,
  Courses: BookOpen,
  Assignments: GraduationCap,
  "AI Planner": Sparkles,
  Notifications: Bell,
  Settings: Settings2,
};
const statuses = ["backlog", "todo", "in_progress", "in_review", "completed"];
const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export default function Workspace() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { resolvedTheme, setTheme } = useTheme();
  const [section, setSection] = useState<Section>("Today");
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [ready, setReady] = useState(() => !supabase);
  const [dataLoading, setDataLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const calendarRequest = useRef(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationState[]>([]);
  const [search, setSearch] = useState("");
  const [taskView, setTaskView] = useState<"Board" | "List">("Board");
  const [taskProjectFilter, setTaskProjectFilter] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [taskSort, setTaskSort] = useState<"due" | "priority" | "title">("due");
  const [assignmentCourseFilter, setAssignmentCourseFilter] = useState("");
  const [modal, setModal] = useState<"task" | "event" | "project" | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [date, setDate] = useState(new Date());
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [planning, setPlanning] = useState(false);
  const [plannerPrompt, setPlannerPrompt] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const applyNarrowTaskView = () => { if (media.matches) setTaskView((current) => current === "Board" ? "List" : current); };
    applyNarrowTaskView();
    media.addEventListener("change", applyNarrowTaskView);
    return () => media.removeEventListener("change", applyNarrowTaskView);
  }, []);
  const reload = useCallback(async () => {
    if (!supabase) return;
    const rangeStart = new Date();
    const rangeEnd = addDays(rangeStart, 45);
    const [t, p, e, a, c, n, s, pref, integrationResult] = await Promise.all([
      supabase.from("tasks").select("*").order("due_at", { ascending: true }),
      supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("calendar_events")
        .select("*")
        .gte("ends_at", new Date(Date.now() - 86400000).toISOString())
        .lte("starts_at", new Date(Date.now() + 45 * 86400000).toISOString())
        .order("starts_at"),
      supabase
        .from("assignments")
        .select("*")
        .is("ignored_at", null)
        .order("original_due_at"),
      supabase.from("courses").select("*").order("name"),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
      supabase
        .from("scheduled_work_sessions")
        .select("id,task_id,starts_at,ends_at,status")
        .eq("status", "planned")
        .gte("ends_at", rangeStart.toISOString())
        .lte("starts_at", rangeEnd.toISOString())
        .order("starts_at"),
      supabase.from("user_preferences").select("timezone").maybeSingle(),
      supabase.from("external_integrations").select("provider,status,last_synced_at,last_error").in("provider", ["schoology", "discord"]),
    ]);
    if (t.error || p.error || e.error || a.error || c.error || n.error || s.error || pref.error || integrationResult.error)
      setError(
        (t.error || p.error || e.error || a.error || c.error || n.error || s.error || pref.error || integrationResult.error)
          ?.message ||
          "Could not load workspace data",
      );
    setTasks((t.data || []) as Task[]);
    setProjects((p.data || []) as Project[]);
    setEvents((e.data || []) as Event[]);
    setWorkSessions((s.data || []) as WorkSession[]);
    setAssignments((a.data || []) as Assignment[]);
    setCourses((c.data || []) as Course[]);
    setUnreadCount(n.count || 0);
    if (pref.data?.timezone) setTimezone(pref.data.timezone);
    setIntegrations((integrationResult.data || []) as IntegrationState[]);
    setDataLoading(false);
  }, [supabase]);
  const loadCalendarRange = useCallback(async (from: Date, to: Date) => {
    if (!supabase) return;
    const requestId = ++calendarRequest.current;
    setCalendarLoading(true);
    const [eventResult, sessionResult] = await Promise.all([
      supabase.from("calendar_events").select("*").gte("ends_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at"),
      supabase.from("scheduled_work_sessions").select("id,task_id,starts_at,ends_at,status").eq("status", "planned").gte("ends_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at"),
    ]);
    if (requestId !== calendarRequest.current) return;
    if (eventResult.error || sessionResult.error) {
      setError((eventResult.error || sessionResult.error)?.message || "Could not load calendar items");
      setCalendarLoading(false);
      return;
    }
    setEvents((eventResult.data || []) as Event[]);
    setWorkSessions((sessionResult.data || []) as WorkSession[]);
    setCalendarLoading(false);
  }, [supabase]);
  useEffect(() => {
    if (!mobileNav && !accountMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [accountMenuOpen, mobileNav]);
  useEffect(() => {
    if (!supabase) {
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setUser({ id: data.user.id, email: data.user.email });
      setReady(true);
      reload();
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) router.replace("/login");
    });
    return () => subscription.unsubscribe();
  }, [reload, router, supabase]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkResult = params.get("discord_link");
    const requested = params.get("section");
    const normalized = requested === "My Tasks" ? "Tasks" : requested;
    queueMicrotask(() => {
      if (linkResult) {
        setSection("Notifications");
        setToast(linkResult === "connected" ? "Discord account linked" : linkResult === "not_configured" ? "Discord account linking needs OAuth credentials in Vercel" : linkResult === "cancelled" ? "Discord account linking was cancelled" : "Could not link Discord account");
        router.replace("/app");
      } else if (["Today", "Calendar", "Tasks", "Projects", "Courses", "Assignments", "AI Planner", "Notifications", "Settings"].includes(normalized || "")) {
        setSection(normalized as Section);
      }
    });
  }, [router]);
  async function createTask(title: string, extra: Partial<Task> = {}) {
    if (!supabase) return;
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    if (!u) return;
    const { error } = await supabase
      .from("tasks")
      .insert({ user_id: u.id, title, ...extra });
    if (error) {
      setError(error.message);
      return;
    }
    setToast("Task added");
    await reload();
  }
  async function updateTask(id: string, patch: Partial<Task>) {
    if (!supabase) return;
    const { error } = await supabase
      .from("tasks")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) setError(error.message);
    else {
      setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    }
  }
  async function removeTask(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) setError(error.message);
    else setTasks((v) => v.filter((t) => t.id !== id));
  }
  async function importAssignment(a: Assignment) {
    if (!supabase) return;
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    if (!u) return;
    const result = await supabase
      .from("tasks")
      .insert({
        user_id: u.id,
        assignment_id: a.id,
        title: a.personal_title || a.title,
        description: a.personal_description || a.description,
        due_at: a.personal_due_at || a.original_due_at,
        status: "todo",
        priority: "medium",
        source: "assignment",
      })
      .select()
      .single();
    if (result.error) setError(result.error.message);
    else {
      setTasks((v) => [...v, result.data as Task]);
      setToast("Assignment added to Tasks");
    }
  }
  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setError(error.message);
    else router.replace("/login");
  }
  async function toggleTheme() {
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.dispatchEvent(new CustomEvent("daymark-theme", { detail: nextTheme }));
    localStorage.setItem("theme", nextTheme);
    if (!supabase || !user) return;
    const { error } = await supabase
      .from("user_preferences")
      .update({ theme: nextTheme, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error)
      setError(`Theme changed for this session but could not be saved: ${error.message}`);
  }
  async function generatePlan() {
    setPlanning(true);
    setError("");
    try {
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: plannerPrompt }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not generate a plan");
      setProposal({
        id: crypto.randomUUID(),
        slots: data.slots.map(
          (s: {
            taskId: string;
            title: string;
            start: string;
            end: string;
          }) => ({ ...s, id: crypto.randomUUID(), selected: true, start: new Date(s.start), end: new Date(s.end) }),
        ),
        explanation: data.explanation,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate a plan");
    } finally {
      setPlanning(false);
    }
  }
  const filtered = useMemo(
    () =>
      tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()) && (!taskProjectFilter || t.project_id === taskProjectFilter) && (!taskStatusFilter || t.status === taskStatusFilter)).sort((a,b) => taskSort === "title" ? a.title.localeCompare(b.title) : taskSort === "priority" ? ["urgent","high","medium","low"].indexOf(a.priority) - ["urgent","high","medium","low"].indexOf(b.priority) : (a.due_at ? +new Date(a.due_at) : Infinity) - (b.due_at ? +new Date(b.due_at) : Infinity)),
    [tasks, search, taskProjectFilter, taskStatusFilter, taskSort],
  );
  const todayTasks = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.due_at &&
      sameZonedDay(t.due_at!, new Date(), timezone),
  );
  const upcoming = tasks
    .filter(
      (t) =>
        t.status !== "completed" &&
        t.due_at &&
        new Date(t.due_at) >= new Date(),
    )
    .slice(0, 5);
  const done = tasks.filter((t) => t.status === "completed").length;
  const taskContext = (task: Task) => {
    const projectName = projects.find((project) => project.id === task.project_id)?.name;
    const assignment = assignments.find((item) => item.id === task.assignment_id);
    const courseName = courses.find((course) => course.id === assignment?.course_id)?.name;
    return [projectName, courseName].filter(Boolean).join(" · ");
  };
  const zonedToday = new Date(`${dateInTimezone(new Date(), timezone)}T12:00:00`);
  const weekStartDate = startOfWeek(zonedToday, { weekStartsOn: 1 });
  const weekStart = zonedMidnight(weekStartDate, timezone);
  const weekEnd = zonedMidnight(addDays(weekStartDate, 7), timezone);
  const todayEvents = events.filter((e) => sameZonedDay(e.starts_at, new Date(), timezone));
  const todaySessions = workSessions.filter((s) => sameZonedDay(s.starts_at, new Date(), timezone));
  const scheduledToday = todayEvents.length + todaySessions.length;
  if (!ready)
    return (
      <div className="loading">
        <div className="brand-mark">
          <CalendarDays size={20} />
        </div>
        <p>Preparing your workspace…</p>
      </div>
    );
  if (!supabase)
    return (
      <div className="setup-screen">
        <div className="brand-mark">
          <CalendarDays size={22} />
        </div>
        <div className="eyebrow">DAYMARK SETUP</div>
        <h1>Connect your workspace</h1>
        <p>
          Daymark stores your data in your private Supabase project. Add the
          public project URL and anon key to <code>.env.local</code> to enable
          sign-in and persistence.
        </p>
        <ol>
          <li>Create a Supabase project on the free plan.</li>
          <li>
            Run <code>supabase/migrations/0001_daymark.sql</code>.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code> and fill
            in both Supabase values.
          </li>
          <li>Restart the development server and create your account.</li>
        </ol>
        <a
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noreferrer"
        >
          Open Supabase dashboard <ArrowRight size={14} />
        </a>
      </div>
    );
  return (
    <div className={`app-frame ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">
            <CalendarDays size={17} />
          </div>
          <b>daymark</b>
          <button
            className="icon-button sidebar-collapse"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((v) => !v)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            className="icon-button hide-desktop mobile-nav-close"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-pill" role="group" aria-label="Current workspace">
          <div className="workspace-avatar"><CalendarDays size={15} /></div>
          <span>
            <b>Personal workspace</b>
          </span>
        </div>
        <nav aria-label="Primary navigation">
          {nav.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-label">{group.title}</div>
              {group.items.map((item) => {
                const Icon = icons[item];
                return (
                  <button
                    key={item}
                    type="button"
                    title={item}
                    aria-current={section === item ? "page" : undefined}
                    aria-label={
                      item === "Notifications" && unreadCount > 0
                        ? `Notifications, ${unreadCount} unread`
                        : item
                    }
                    onClick={() => {
                      setSection(item);
                      setMobileNav(false);
                    }}
                    className={`nav-item ${section === item ? "active" : ""}`}
                  >
                    <Icon size={16} />
                    <span>{item}</span>
                    {item === "Notifications" && unreadCount > 0 && (
                      <span className="notification-count">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-label">
            <span>Planned this week</span>
            <span>{workSessions.filter((s) => new Date(s.starts_at) >= weekStart && new Date(s.starts_at) < weekEnd).length}</span>
          </div>
          <div className="progress-track">
            <i
              style={{
                width: `${Math.min(100, workSessions.filter((s) => new Date(s.starts_at) >= weekStart && new Date(s.starts_at) < weekEnd).length * 10)}%`,
              }}
            />
          </div>
          <div
            className="account-menu-wrap"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setAccountMenuOpen(false);
            }}
          >
            <button
              type="button"
              className="user-row"
              aria-label={`Account menu for ${user?.email || "your account"}`}
              aria-expanded={accountMenuOpen}
              aria-controls="account-actions"
              onClick={() => setAccountMenuOpen((v) => !v)}
            >
              <div className="user-avatar">
                {user?.email?.[0]?.toUpperCase() || "D"}
              </div>
              <span>
                <b>{user?.email?.split("@")[0] || "My account"}</b>
                <small>{user?.email}</small>
              </span>
              <MoreHorizontal size={16} />
            </button>
            {accountMenuOpen && (
              <div className="account-popover" id="account-actions">
                <button
                  type="button"
                  onClick={() => {
                    setSection("Settings");
                    setAccountMenuOpen(false);
                  }}
                >
                  Account and settings
                </button>
                <button type="button" className="sign-out-action" onClick={signOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          type="button"
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <main className="main-shell">
        <header className="topbar">
          <button
            className="icon-button hide-desktop"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={19} />
          </button>
          <div className="crumb">
            {section}
            <span className="crumb-sep">/</span>
            <span>
              {section === "Today"
                ? format(new Date(), "EEEE, MMMM d")
                : "Personal workspace"}
            </span>
          </div>
          <div className="top-actions">
            <label className="searchbox">
              <Search size={15} />
              <input
                aria-label="Search tasks"
                placeholder="Search tasks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="button primary small-button"
              onClick={() => setModal("task")}
            >
              <Plus size={15} /> <span>New task</span>
            </button>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setSection("Notifications")}
            >
              <Bell size={17} />
            </button>
            <button
              className="icon-button theme-toggle"
              aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={toggleTheme}
            >
              {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="user-avatar top-avatar"
              aria-label="Account settings"
              onClick={() => setSection("Settings")}
            >
              {user?.email?.[0]?.toUpperCase() || "D"}
            </button>
          </div>
        </header>
        <div className="page-content">
          {error && (
            <div className="notice error page-notice">
              {error}
              <button onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {dataLoading && <div className="notice neutral page-notice">Loading your workspace data…</div>}
          {toast && (
            <div className="toast">
              {toast}
              <button onClick={() => setToast("")}>
                <X size={13} />
              </button>
            </div>
          )}
          {section === "Today" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR DAY</div>
                  <h1>Today</h1>
                  <p>
                    Good{" "}
                    {new Date().getHours() < 12
                      ? "morning"
                      : new Date().getHours() < 17
                        ? "afternoon"
                        : "evening"}
                    . Here’s what’s on your plate today.
                  </p>
                </div>
                <button
                  className="button subtle"
                  onClick={() => setSection("Calendar")}
                >
                  <CalendarDays size={15} /> Open calendar
                </button>
              </div>
              <div className="metric-row">
                <Metric
                  label="Due today"
                  value={String(todayTasks.length).padStart(2, "0")}
                  detail="tasks need attention"
                  icon={AlarmClock}
                />
                <Metric
                  label="In progress"
                  value={String(scheduledToday).padStart(2, "0")}
                  detail="events and work sessions"
                  icon={CalendarDays}
                />
                <Metric
                  label="Completed"
                  value={String(done).padStart(2, "0")}
                  detail="all time"
                  icon={CheckCircle2}
                />
                <Metric
                  label="Active projects"
                  value={String(
                    projects.filter((p) => p.status === "active").length,
                  ).padStart(2, "0")}
                  detail="moving forward"
                  icon={FolderKanban}
                />
              </div>
              <div className="dashboard-grid">
                <section className="panel schedule-panel">
                  <PanelTitle
                    title="Today’s schedule"
                    action="View calendar"
                    onClick={() => setSection("Calendar")}
                  />
                  {todayEvents.length === 0 && todayTasks.length === 0 && todaySessions.length === 0 ? (
                    <Empty
                      compact
                      icon={Clock3}
                      title="A little breathing room"
                      text="No events or deadlines today."
                    />
                  ) : (
                    <div className="timeline">
                      {[
                        ...todayEvents.map((e) => ({ title: e.title, time: e.starts_at, color: e.color, type: "Calendar event" })),
                        ...todaySessions.map((s) => ({ title: tasks.find((t) => t.id === s.task_id)?.title || "Planned work", time: s.starts_at, color: "var(--accent)", type: "Work session" })),
                        ...todayTasks.map((t) => ({ title: t.title, time: t.due_at!, color: "var(--warning)", type: "Task deadline" })),
                      ]
                        .sort((a, b) => +new Date(a.time) - +new Date(b.time))
                        .map((item, i) => (
                          <div
                            className="timeline-row"
                            key={`${item.type}${i}`}
                          >
                            <time>{zonedTime(item.time, timezone)}</time>
                            <div className="timeline-line">
                              <i style={{ background: item.color }} />
                            </div>
                            <div>
                              <b>{item.title}</b>
                              <small>
                                {item.type}
                              </small>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  <button
                    className="add-inline"
                    onClick={() => setModal("event")}
                  >
                    <Plus size={14} /> Add event
                  </button>
                </section>
                <section className="panel upcoming-panel">
                  <PanelTitle
                    title="Upcoming deadlines"
                    action="All tasks"
                    onClick={() => setSection("Tasks")}
                  />
                  {upcoming.length === 0 ? (
                    <Empty
                      compact
                      icon={CheckCircle2}
                      title="Nothing due soon"
                      text="You’re all caught up."
                    />
                  ) : (
                    <div className="deadline-list">
                      {upcoming.map((t) => (
                        <button
                          className="deadline-row"
                          key={t.id}
                          onClick={() => setSection("Tasks")}
                        >
                          <span className={`priority-mark ${t.priority}`} />
                          <span className="deadline-copy">
                            <b>{t.title}</b>
                            <small>
                              {projects.find((p) => p.id === t.project_id)
                                ?.name || "Personal"}
                            </small>
                          </span>
                          <time>{format(new Date(t.due_at!), "MMM d")}</time>
                          <ArrowRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <section className="panel week-panel">
                  <PanelTitle
                    title="This week"
                    action="Plan week"
                    onClick={() => setSection("AI Planner")}
                  />
                  <div className="week-chart">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = addDays(
                        startOfWeek(new Date(), { weekStartsOn: 1 }),
                        i,
                      );
                      const count =
                        tasks.filter(
                          (t) => t.due_at && isSameDay(new Date(t.due_at), d),
                        ).length +
                        events.filter((e) =>
                          isSameDay(new Date(e.starts_at), d),
                        ).length;
                      return (
                        <div key={i} className="week-day">
                          <span className="week-hours">
                            {count
                              ? `${count} item${count > 1 ? "s" : ""}`
                              : "free"}
                          </span>
                          <div className="bar-track">
                            <i
                              style={{
                                height: `${Math.max(8, Math.min(94, count * 24))}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`week-date ${isSameDay(d, new Date()) ? "today" : ""}`}
                          >
                            {format(d, "EEEEE")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section className="panel quick-panel">
                  <PanelTitle title="Quick actions" />
                  <div className="quick-actions">
                    <QuickAction
                      icon={Plus}
                      title="Create a task"
                      onClick={() => setModal("task")}
                    />
                    <QuickAction
                      icon={CalendarDays}
                      title="Schedule an event"
                      onClick={() => setModal("event")}
                    />
                    <QuickAction
                      icon={FolderKanban}
                      title="New project"
                      onClick={() => setModal("project")}
                    />
                    <QuickAction
                      icon={Sparkles}
                      title="Plan my week"
                      onClick={() => setSection("AI Planner")}
                    />
                  </div>
                </section>
              </div>
            </>
          )}
          {section === "Tasks" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">TASK MANAGEMENT</div>
                  <h1>Tasks</h1>
                  <p>{filtered.length} tasks across your workspace</p>
                </div>
                <div className="heading-actions">
                  <select aria-label="Filter tasks by project" value={taskProjectFilter} onChange={(event) => setTaskProjectFilter(event.target.value)}>
                    <option value="">All projects</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  <select aria-label="Filter tasks by status" value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
                  <select aria-label="Sort tasks" value={taskSort} onChange={(event) => setTaskSort(event.target.value as typeof taskSort)}><option value="due">Due date</option><option value="priority">Priority</option><option value="title">Title</option></select>
                  <div className="view-switch" aria-label="Task view">
                    {(["Board", "List"] as const).map((view) => <button key={view} type="button" className={taskView === view ? "selected" : ""} aria-pressed={taskView === view} onClick={() => setTaskView(view)}>{view}</button>)}
                  </div>
                  <button
                    className="button primary"
                    onClick={() => setModal("task")}
                  >
                    <Plus size={15} /> Add task
                  </button>
                </div>
              </div>
              {taskView === "Board" ? <div className="task-board">
                {statuses.map((status) => (
                  <div
                    className="task-column"
                    key={status}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData("task");
                      if (id) updateTask(id, { status });
                    }}
                  >
                    <div className="column-title">
                      <span className={`status-dot ${status}`} />
                      <b>{label(status)}</b>
                      <span className="count-pill">
                        {filtered.filter((t) => t.status === status).length}
                      </span>
                      <button
                        className="icon-button mini"
                        onClick={() => setModal("task")}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {filtered
                      .filter((t) => t.status === status)
                      .map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          onEdit={() => setEditingTask(t)}
                          project={taskContext(t)}
                          onComplete={() =>
                            updateTask(t.id, {
                              status:
                                t.status === "completed" ? "todo" : "completed",
                            })
                          }
                          onDelete={() => removeTask(t.id)}
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData("task", t.id)
                          }
                        />
                      ))}
                    <button
                      className="column-add"
                      onClick={() => setModal("task")}
                    >
                      <Plus size={14} /> Add task
                    </button>
                  </div>
                ))}
              </div> : <div className="panel task-list-view">
                {filtered.length === 0 ? <Empty icon={ListTodo} title="No tasks match" text="Add a task or adjust your search." /> : filtered.map((task) => <div className="task-list-row" key={task.id}>
                  <button className={`status-dot ${task.status}`} aria-label={task.status === "completed" ? `Reopen ${task.title}` : `Mark ${task.title} complete`} onClick={() => updateTask(task.id, { status: task.status === "completed" ? "todo" : "completed" })} />
                  <button className="task-list-title" onClick={() => setEditingTask(task)}>{task.title}</button>
                  <span className={`priority ${task.priority}`}>{label(task.priority)}</span>
                  <span className="task-context-cell">{taskContext(task) || "—"}</span>
                  <span>{task.due_at ? format(new Date(task.due_at), "MMM d") : "No deadline"}</span>
                  <select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })}>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
                  <button className="icon-button mini" onClick={() => removeTask(task.id)} aria-label={`Delete ${task.title}`}><Trash2 size={14} /></button>
                </div>)}
              </div>}
            </>
          )}
          {section === "Projects" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR WORK</div>
                  <h1>Projects</h1>
                  <p>Keep related work moving together.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal("project")}
                >
                  <Plus size={15} /> New project
                </button>
              </div>
              {projects.length === 0 ? (
                <Empty
                  icon={FolderKanban}
                  title="Start with a project"
                  text="Give your goals a home, then connect the tasks that move them forward."
                  action="Create project"
                  onAction={() => setModal("project")}
                />
              ) : (
                <div className="project-grid">
                  {projects.map((p) => {
                    const related = tasks.filter((t) => t.project_id === p.id);
                    const completed = related.filter(
                      (t) => t.status === "completed",
                    ).length;
                    const upcomingMilestones = related.filter((t) => t.due_at && t.status !== "completed").sort((a,b) => +new Date(a.due_at!) - +new Date(b.due_at!));
                    const overdueMilestones = upcomingMilestones.filter((t) => new Date(t.due_at!) < new Date());
                    return (
                      <article className="project-card" key={p.id}>
                        <div className="project-card-top">
                          <span
                            className="project-color"
                            style={{ background: p.color }}
                          >
                            <FolderKanban size={16} />
                          </span>
                          <button
                            className="icon-button mini"
                            onClick={async () => {
                              const result = await supabase
                                ?.from("projects")
                                .delete()
                                .eq("id", p.id);
                              if (!result?.error) {
                                setProjects((v) =>
                                  v.filter((x) => x.id !== p.id),
                                );
                                setToast("Project removed");
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <h3>{p.name}</h3>
                        <p>{p.description || "No description added"}</p>
                        <div className="project-progress-label">
                          <span>
                            {completed} of {related.length} tasks
                          </span>
                          <span>
                            {related.length
                              ? Math.round((completed / related.length) * 100)
                              : 0}
                            %
                          </span>
                        </div>
                        <div className="progress-track">
                          <i
                            style={{
                              width: `${related.length ? (completed / related.length) * 100 : 0}%`,
                              background: p.color,
                            }}
                          />
                        </div>
                        <div className="project-card-foot">
                          <span>{p.status} · {completed}/{related.length} tasks complete</span>
                          {p.target_date && (
                            <span>
                              Target {format(new Date(p.target_date), "MMM d")}
                            </span>
                          )}
                        </div>
                        <div className="project-milestones">
                          {p.updated_at && <small>Updated {format(new Date(p.updated_at), "MMM d")}</small>}
                          {overdueMilestones.length > 0 && <span className="state error">{overdueMilestones.length} overdue</span>}
                          {upcomingMilestones.length > 0 ? <small>Next: {upcomingMilestones[0].title} · {format(new Date(upcomingMilestones[0].due_at!), "MMM d")}</small> : <small>No upcoming task deadlines</small>}
                          <button type="button" className="text-button" onClick={() => { setTaskProjectFilter(p.id); setSection("Tasks"); }}>View project tasks</button>
                        </div>
                      </article>
                    );
                  })}
                  <button
                    className="project-add-card"
                    onClick={() => setModal("project")}
                  >
                    <Plus size={18} />
                    <span>Create a project</span>
                  </button>
                </div>
              )}
            </>
          )}
          {section === "Calendar" && (
            <CalendarView
              date={date}
              setDate={setDate}
              events={events}
              workSessions={workSessions}
              tasks={tasks}
              assignments={assignments}
              timezone={timezone}
              loadRange={loadCalendarRange}
              loading={calendarLoading}
              addEvent={() => setModal("event")}
            />
          )}
          {section === "Assignments" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ACADEMICS</div>
                  <h1>Assignments</h1>
                  <p>Imported coursework and your personal deadlines.</p>
                </div>
                <div className="heading-actions">
                <select aria-label="Filter assignments by course" value={assignmentCourseFilter} onChange={(event) => setAssignmentCourseFilter(event.target.value)}>
                  <option value="">All courses</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
                <button
                  className="button subtle"
                  onClick={() => setSection("Courses")}
                >
                  <GraduationCap size={15} /> Manage courses
                </button>
                </div>
              </div>
              {assignments.length === 0 ? (
                <Empty
                  icon={GraduationCap}
                  title="No assignments yet"
                  text="Connect Schoology in Settings, or create a task manually. Assignment import stays under your control."
                  action="Open integrations"
                  onAction={() => setSection("Settings")}
                />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Assignment</th>
                        <th>Course</th>
                        <th>Schoology due</th>
                        <th>Your deadline</th>
                        <th>Status</th>
                        <th>Task</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.filter((assignment) => !assignmentCourseFilter || assignment.course_id === assignmentCourseFilter).map((a) => (
                        <AssignmentRow
                          key={a.id}
                          assignment={a}
                          course={
                            courses.find((c) => c.id === a.course_id)?.name ||
                            "—"
                          }
                          imported={tasks.some((t) => t.assignment_id === a.id)}
                          importTask={() => importAssignment(a)}
                          onError={setError}
                          timezone={timezone}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {section === "Courses" && (
            <CoursesView
              courses={courses}
              integration={integrations.find((item) => item.provider === "schoology") || null}
              onRefresh={reload}
              toast={setToast}
              error={setError}
              onSettings={() => setSection("Settings")}
            />
          )}
          {section === "AI Planner" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">THOUGHTFUL SCHEDULING</div>
                  <h1>AI Planner</h1>
                  <p>Build a realistic plan from your tasks and calendar.</p>
                </div>
                <span className="state neutral">
                  <span className="status-dot todo" /> Deterministic planner
                  ready
                </span>
              </div>
              <div className="planner-card">
                <div className="planner-icon">
                  <Sparkles size={19} />
                </div>
                <h2>Make space for focused work.</h2>
                <p>
                  Daymark checks your deadlines, priorities, existing
                  commitments, and working hours. Review the proposed sessions
                  before anything is added to your calendar.
                </p>
                <textarea
                  className="planner-prompt"
                  value={plannerPrompt}
                  onChange={(event) => setPlannerPrompt(event.target.value)}
                  placeholder="Add context, e.g. robotics on Wednesday and a three-hour history assignment…"
                  rows={3}
                />
                <button className="button primary" onClick={generatePlan}>
                  <Sparkles size={15} />{" "}
                  {planning ? "Building plan…" : "Generate a week plan"}
                </button>
                <div className="provider-note">
                  The deterministic scheduler always works; when a server AI
                  provider is configured, it adds a concise explanation.
                </div>
              </div>
              {proposal && (
                <div className="panel proposal-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">PROPOSED SCHEDULE</div>
                      <h2>{proposal.slots.length} work sessions</h2>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => setProposal(null)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {proposal.explanation && (
                    <p className="proposal-explanation">
                      {proposal.explanation}
                    </p>
                  )}
                  {proposal.slots.length === 0 ? (
                    <p className="muted">
                      No schedulable tasks in this date range.
                    </p>
                  ) : (
                    [...proposal.slots].sort((a,b) => +a.start - +b.start).map((s) => (
                      <div className={`proposal-row ${s.selected ? "" : "proposal-rejected"}`} key={s.id}>
                        <input type="checkbox" aria-label={`Include ${s.title} on ${format(s.start, "MMM d")}`} checked={s.selected} onChange={(event) => setProposal((current) => current ? { ...current, slots: current.slots.map((slot) => slot.id === s.id ? { ...slot, selected: event.target.checked } : slot) } : current)} />
                        <span className="status-dot in_progress" />
                        <b>{s.title}</b>
                        <label className="proposal-time">Start<input type="datetime-local" value={zonedInputValue(s.start.toISOString(), timezone)} onChange={(event) => setProposal((current) => current ? { ...current, slots: current.slots.map((slot) => slot.id === s.id ? { ...slot, start: wallTimeToUtc(event.target.value, timezone) } : slot) } : current)} /></label>
                        <label className="proposal-time">End<input type="datetime-local" value={zonedInputValue(s.end.toISOString(), timezone)} onChange={(event) => setProposal((current) => current ? { ...current, slots: current.slots.map((slot) => slot.id === s.id ? { ...slot, end: wallTimeToUtc(event.target.value, timezone) } : slot) } : current)} /></label>
                      </div>
                    ))
                  )}
                  <div className="proposal-actions">
                    <button
                      className="button subtle"
                      disabled={proposalBusy}
                      onClick={async () => {
                        if (!supabase || !proposal) return;
                        setProposalBusy(true);
                        try {
                          const { data: { user: currentUser } } = await supabase.auth.getUser();
                          if (!currentUser) throw new Error("Your session expired. Sign in again.");
                          const { error: saveError } = await supabase.from("ai_scheduling_proposals").insert({ id: proposal.id, user_id: currentUser.id, status: "rejected", proposal: proposal.slots.map((slot) => ({ taskId: slot.taskId, title: slot.title, start: slot.start.toISOString(), end: slot.end.toISOString() })) });
                          if (saveError) throw saveError;
                          setProposal(null);
                          setToast("Proposal rejected");
                        } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not reject proposal"); }
                        finally { setProposalBusy(false); }
                      }}
                    >
                      Reject
                    </button>
                    <button
                      className="button primary"
                      disabled={!proposal.slots.some((slot) => slot.selected) || proposalBusy}
                      onClick={async () => {
                        if (!supabase) return;
                        setProposalBusy(true);
                        try {
                        const selectedSlots = proposal.slots.filter((slot) => slot.selected);
                        if (selectedSlots.some((slot) => slot.end <= slot.start)) { setError("Each session must end after it starts."); return; }
                        const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && a.end > b.start;
                        const conflict = selectedSlots.some((slot, index) => events.some((event) => overlaps(slot, { start: new Date(event.starts_at), end: new Date(event.ends_at) })) || workSessions.some((session) => overlaps(slot, { start: new Date(session.starts_at), end: new Date(session.ends_at) })) || selectedSlots.slice(index + 1).some((other) => overlaps(slot, other)));
                        if (conflict) { setError("Selected sessions overlap each other or an existing calendar item. Adjust the times and try again."); return; }
                        const {
                          data: { user: u },
                        } = await supabase.auth.getUser();
                        if (!u) return;
                        const { data: prop } = await supabase
                          .from("ai_scheduling_proposals")
                          .insert({
                            id: proposal.id,
                            user_id: u.id,
                            status: "accepted",
                            proposal: proposal.slots.filter((slot) => slot.selected).map((slot) => ({ taskId: slot.taskId, title: slot.title, start: slot.start.toISOString(), end: slot.end.toISOString() })),
                          })
                          .select()
                          .single();
                        if (!prop) {
                          setError("Could not save approved schedule.");
                          return;
                        }
                        const result = await supabase
                          .from("scheduled_work_sessions")
                          .insert(
                            proposal.slots.filter((slot) => slot.selected).map((s) => ({
                              user_id: u.id,
                              task_id: s.taskId,
                              starts_at: s.start.toISOString(),
                              ends_at: s.end.toISOString(),
                              proposal_id: proposal.id,
                            })),
                          );
                        if (result.error) {
                          await supabase.from("ai_scheduling_proposals").delete().eq("id", proposal.id);
                          setError(result.error.message);
                        }
                        else {
                          setToast(`${proposal.slots.filter((slot) => slot.selected).length} sessions approved; ${proposal.slots.filter((slot) => !slot.selected).length} excluded`);
                          setProposal(null);
                          await reload();
                        }
                        } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not approve schedule"); }
                        finally { setProposalBusy(false); }
                      }}
                    >
                      {proposalBusy ? "Saving…" : `Approve ${proposal.slots.filter((slot) => slot.selected).length} sessions`}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {section === "Notifications" && (
            <NotificationCenter onUnreadCountChange={setUnreadCount} />
          )}
          {section === "Settings" && (
            <SettingsView user={user} integrations={integrations} onTimezoneChange={setTimezone} onSignOut={signOut} />
          )}
        </div>
      </main>
      {modal && (
        <CreateModal
          kind={modal}
          close={() => setModal(null)}
          projects={projects}
          saveTask={createTask}
          saved={async () => {
            setModal(null);
            await reload();
          }}
          supabase={supabase}
          timezone={timezone}
          toast={setToast}
          error={setError}
        />
      )}
      {editingTask && supabase && user && (
        <TaskDetailModal
          task={editingTask}
          projects={projects}
          supabase={supabase}
          userId={user?.id || ""}
          onClose={() => setEditingTask(null)}
          onSave={async (id, patch) => {
            await updateTask(id, patch);
            setEditingTask(null);
          }}
          onDuplicate={async (task) => {
            await createTask(`${task.title} (copy)`, {
              description: task.description,
              status: "todo",
              priority: task.priority,
              due_at: task.due_at,
              project_id: task.project_id,
              estimated_minutes: task.estimated_minutes,
            });
            setEditingTask(null);
          }}
          onDelete={async (id) => {
            await removeTask(id);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={15} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function PanelTitle({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {action && (
        <button className="link-button" onClick={onClick}>
          {action}
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
  action,
  onAction,
  compact,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact" : ""}`}>
      <Icon size={compact ? 18 : 22} />
      <b>{title}</b>
      <p>{text}</p>
      {action && (
        <button className="button subtle small-button" onClick={onAction}>
          {action}
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
function QuickAction({
  icon: Icon,
  title,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
}) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span>
        <Icon size={16} />
      </span>
      {title}
      <ArrowRight size={13} />
    </button>
  );
}
function TaskCard({
  task,
  onEdit,
  project,
  onComplete,
  onDelete,
  draggable,
  onDragStart,
}: {
  task: Task;
  onEdit: () => void;
  project?: string;
  onComplete: () => void;
  onDelete: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <article
      className="task-card"
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="task-card-head">
        <button
          className={`check-circle ${task.status === "completed" ? "checked" : ""}`}
          onClick={onComplete}
          aria-label="Toggle complete"
        >
          {task.status === "completed" && <Check size={12} />}
        </button>
        <button
          className="icon-button mini edit-task"
          onClick={onEdit}
          aria-label="Edit task"
        >
          <MoreHorizontal size={14} />
        </button>
        <button className="icon-button mini delete-task" onClick={onDelete}>
          <Trash2 size={13} />
        </button>
      </div>
      <h3>{task.title}</h3>
      {task.description && <p>{task.description}</p>}
      <div className="task-card-meta">
        <span className={`priority ${task.priority}`}>
          <i />
          {label(task.priority)}
        </span>
        {task.due_at && (
          <span>
            <Clock3 size={12} />
            {format(new Date(task.due_at), "MMM d")}
          </span>
        )}
      </div>
      {project && (
        <div className="task-project">
          <span />
          {project}
        </div>
      )}
    </article>
  );
}
function CalendarView({
  date,
  setDate,
  events,
  workSessions,
  tasks,
  assignments,
  timezone,
  loadRange,
  loading,
  addEvent,
}: {
  date: Date;
  setDate: (d: Date) => void;
  events: Event[];
  workSessions: WorkSession[];
  tasks: Task[];
  assignments: Assignment[];
  timezone: string;
  loadRange: (from: Date, to: Date) => Promise<void>;
  loading: boolean;
  addEvent: () => void;
}) {
  const [view, setView] = useState<"Month" | "Week" | "Day" | "Agenda">("Week");
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const applyNarrowFallback = () => { if (media.matches) setView((current) => current === "Week" ? "Agenda" : current); };
    applyNarrowFallback();
    media.addEventListener("change", applyNarrowFallback);
    return () => media.removeEventListener("change", applyNarrowFallback);
  }, []);
  const start = useMemo(
    () =>
      view === "Month"
        ? startOfWeek(startOfMonth(date), { weekStartsOn: 1 })
        : startOfWeek(date, { weekStartsOn: 1 }),
    [date, view],
  );
  const days =
    view === "Month"
      ? eachDayOfInterval({ start, end: addDays(start, 41) })
      : view === "Day"
        ? [date]
        : Array.from({ length: 7 }, (_, i) => addDays(start, i));
  useEffect(() => {
    const visibleStart = view === "Month" ? start : view === "Day" ? date : start;
    const visibleEnd = view === "Month" ? addDays(start, 42) : view === "Day" ? addDays(date, 1) : addDays(start, 7);
    void loadRange(zonedMidnight(visibleStart, timezone), zonedMidnight(visibleEnd, timezone));
  }, [date, loadRange, start, timezone, view]);
  const entries = [
    ...events.map((e) => ({
      id: e.id,
      title: e.title,
      time: e.starts_at,
      end: e.ends_at,
      color: e.color,
      kind: "Event",
      deadline: false,
    })),
    ...workSessions.map((s) => ({
      id: s.id,
      title: tasks.find((t) => t.id === s.task_id)?.title || "Planned work",
      time: s.starts_at,
      end: s.ends_at,
      color: "var(--accent)",
      kind: "Work session",
      deadline: false,
    })),
    ...tasks
      .filter((t) => t.due_at && t.status !== "completed")
      .map((t) => ({
        id: t.id,
        title: t.title,
        time: t.due_at!,
        end: null,
        color: "var(--warning)",
        kind: "Task deadline",
        deadline: true,
      })),
  ];
  const assignmentEntries = assignments.filter((a) => (a.personal_due_at || a.original_due_at) && !(a.personal_completed ?? a.original_completed)).map((a) => ({
    id: a.id, title: a.personal_title || a.title, time: a.personal_due_at || a.original_due_at!, end: null,
    color: "var(--info)", kind: "Assignment deadline", deadline: true,
  }));
  const allEntries = [...entries, ...assignmentEntries];
  const moveDate = (direction: -1 | 1) => setDate(view === "Month" ? (direction > 0 ? addMonths(date, 1) : subMonths(date, 1)) : addDays(date, direction * (view === "Day" ? 1 : 7)));
  return (
    <>
      <div className="page-heading calendar-heading">
        <div>
          <div className="eyebrow">YOUR TIME</div>
          <h1>Calendar</h1>
          <p>See commitments and deadlines together.</p>
        </div>
        <button className="button primary" onClick={addEvent}>
          <Plus size={15} /> Add event
        </button>
      </div>
      <div className="calendar-toolbar">
        <div className="date-nav">
          <button
            className="button subtle small-button"
            onClick={() => setDate(new Date())}
          >
            Today
          </button>
          <button
            className="icon-button"
            onClick={() => moveDate(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button className="icon-button" onClick={() => moveDate(1)}>
            <ChevronRight size={17} />
          </button>
          <h2>{format(date, view === "Day" ? "MMMM d, yyyy" : "MMMM yyyy")}</h2>
        </div>
        <div className="view-switch">
          {(["Day", "Week", "Month", "Agenda"] as const).map((v) => (
            <button
              className={view === v ? "selected" : ""}
              onClick={() => setView(v)}
              key={v}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {loading && <div className="calendar-loading" role="status">Loading this date range…</div>}
      {view === "Agenda" ? (
        <div className="panel agenda-list">
          {allEntries
            .filter(
              (e) =>
                new Date(e.time) >= zonedMidnight(startOfWeek(date, { weekStartsOn: 1 }), timezone) &&
                new Date(e.time) < zonedMidnight(addDays(startOfWeek(date, { weekStartsOn: 1 }), 7), timezone),
            )
            .sort((a, b) => +new Date(a.time) - +new Date(b.time))
            .map((e) => (
              <div className="agenda-row" key={e.id}>
                <time>{new Intl.DateTimeFormat(undefined, { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(e.time))}</time>
                <span style={{ background: e.color }} />
                <b>{e.title}</b>
                <small>{e.kind}</small>
              </div>
            ))}
          {allEntries.length === 0 && (
            <Empty
              icon={CalendarDays}
              title="No scheduled items"
              text="Create an event or schedule task work."
            />
          )}
        </div>
      ) : view === "Month" ? (
        <div className={`calendar-grid ${view.toLowerCase()}`}>
          <div className="calendar-weekdays">
            {days.map((d) => (
              <div key={d.toISOString()}>{format(d, "EEE")}</div>
            ))}
          </div>
          <div className="calendar-cells">
            {days.map((d) => {
              const dayEntries = allEntries.filter((e) =>
                sameZonedDay(e.time, d, timezone),
              );
              return (
                <div
                  key={d.toISOString()}
                  className={`calendar-cell ${!isSameMonth(d, date) && view === "Month" ? "outside" : ""} ${isSameDay(d, new Date()) ? "is-today" : ""}`}
                  onDoubleClick={addEvent}
                >
                  <span className="cell-date">
                    {format(d, "d")}
                  </span>
                  {dayEntries.slice(0, view === "Month" ? 3 : 8).map((e) => (
                    <div
                      className={`calendar-item ${e.deadline ? "calendar-deadline" : ""}`}
                      key={e.id}
                      style={{ borderLeftColor: e.color }}
                      title={e.title}
                    >
                      {e.deadline ? "Due · " : `${zonedTime(e.time, timezone)} · `}{e.title}
                    </div>
                  ))}
                  {dayEntries.length > 3 && view === "Month" && (
                    <small className="muted">
                      +{dayEntries.length - 3} more
                    </small>
                  )}
                  <button className="cell-add" onClick={addEvent}>
                    <Plus size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`time-calendar ${view.toLowerCase()}`}>
          <div className="time-day-head"><div /><div>{days.map((day) => <div key={day.toISOString()} className={isSameDay(day, now) ? "is-today" : ""}>{format(day, "EEE d")}</div>)}</div></div>
          <div className="time-all-day"><b>All day</b><div>{days.map((day) => <div key={day.toISOString()} className="all-day-items">{allEntries.filter((entry) => entry.deadline && sameZonedDay(entry.time, day, timezone)).map((entry) => <span key={entry.id} title={entry.title} className="deadline-chip">{entry.kind}: {entry.title}</span>)}</div>)}</div></div>
          <div className="time-scroll"><div className="time-axis">{Array.from({ length: 18 }, (_, i) => i + 6).map((hour) => <div key={hour}>{format(new Date(2000, 0, 1, hour), "h a")}</div>)}</div><div className="time-columns">{days.map((day) => {
            const dayStart = zonedMidnight(day, timezone);
            const dayEnd = zonedMidnight(addDays(day, 1), timezone);
            const dayEntries = allEntries.filter((entry) => !entry.deadline && new Date(entry.time) < dayEnd && new Date(entry.end || new Date(+new Date(entry.time) + 30 * 60_000)) > dayStart).sort((a, b) => +new Date(a.time) - +new Date(b.time));
            const lanes: number[] = [];
            const positioned = dayEntries.map((entry) => {
              const startAt = new Date(entry.time);
              const startParts = zonedPartsOf(startAt, timezone);
              const startMinute = startAt < dayStart ? 360 : Math.max(360, startParts.hour * 60 + startParts.minute);
              const endAt = new Date(entry.end || new Date(+startAt + 30 * 60_000));
              const endParts = zonedPartsOf(endAt, timezone);
              const endMinute = Math.min(1440, Math.max(startMinute + 24, endAt >= dayEnd ? 1440 : endParts.hour * 60 + endParts.minute));
              let lane = lanes.findIndex((laneEnd) => laneEnd <= startMinute);
              if (lane < 0) lane = lanes.length;
              lanes[lane] = endMinute;
              return { entry, startMinute, endMinute, lane };
            });
            const laneCount = Math.max(1, lanes.length);
            const nowParts = zonedPartsOf(now, timezone);
            const showNow = sameZonedDay(day, now, timezone) && nowParts.hour >= 6 && nowParts.hour < 24;
            const nowTop = ((nowParts.hour * 60 + nowParts.minute - 360) / 1080) * 100;
            return <div className={`time-day ${isSameDay(day, now) ? "today" : ""}`} key={day.toISOString()} onDoubleClick={addEvent}>
              {Array.from({ length: 18 }, (_, i) => <div className="time-hour-line" key={i} style={{ top: `${(i / 18) * 100}%` }} />)}
              {positioned.map(({ entry, startMinute, endMinute, lane }) => <div className={`time-event ${endMinute - startMinute < 40 ? "compact" : ""}`} key={entry.id} title={`${entry.kind}: ${entry.title}`} style={{ top: `${((startMinute - 360) / 1080) * 100}%`, height: `${Math.max(2.3, ((endMinute - startMinute) / 1080) * 100)}%`, left: `calc(${(lane / laneCount) * 100}% + 2px)`, width: `calc(${100 / laneCount}% - 4px)`, borderLeftColor: entry.color }}><b>{entry.title}</b><small>{zonedTime(entry.time, timezone)}–{zonedTime(entry.end || new Date(+new Date(entry.time) + 30 * 60_000), timezone)}</small></div>)}
              {showNow && <div className="current-time-line" style={{ top: `${nowTop}%` }}><i />{format(now, "h:mm a")}</div>}
            </div>;
          })}</div></div>
        </div>
      )}
    </>
  );
}
function TaskDetailModal({
  task,
  projects,
  supabase,
  userId,
  onClose,
  onSave,
  onDuplicate,
  onDelete,
}: {
  task: Task;
  projects: Project[];
  supabase: NonNullable<ReturnType<typeof createClient>>;
  userId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Task>) => Promise<void>;
  onDuplicate: (task: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [due, setDue] = useState(
    task.due_at ? format(new Date(task.due_at), "yyyy-MM-dd'T'HH:mm") : "",
  );
  const [minutes, setMinutes] = useState(
    task.estimated_minutes?.toString() || "",
  );
  const [projectId, setProjectId] = useState(task.project_id || "");
  const [busy, setBusy] = useState(false);
  const [subtasks, setSubtasks] = useState<
    { id: string; title: string; is_completed: boolean }[]
  >([]);
  const [comments, setComments] = useState<
    { id: string; body: string; created_at: string }[]
  >([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [comment, setComment] = useState("");
  useEffect(() => {
    let active = true;
    async function loadDetails() {
      const [subtaskResult, commentResult] = await Promise.all([
        supabase
          .from("subtasks")
          .select("id,title,is_completed")
          .eq("task_id", task.id)
          .order("position"),
        supabase
          .from("task_comments")
          .select("id,body,created_at")
          .eq("task_id", task.id)
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (!subtaskResult.error) setSubtasks(subtaskResult.data || []);
      if (!commentResult.error) setComments(commentResult.data || []);
    }
    void loadDetails();
    return () => {
      active = false;
    };
  }, [supabase, task.id]);
  async function addSubtask(event: React.FormEvent) {
    event.preventDefault();
    const value = subtaskTitle.trim();
    if (!value) return;
    const result = await supabase
      .from("subtasks")
      .insert({
        user_id: userId,
        task_id: task.id,
        title: value,
        position: subtasks.length,
      })
      .select("id,title,is_completed")
      .single();
    if (!result.error) {
      setSubtasks((items) => [...items, result.data]);
      setSubtaskTitle("");
    }
  }
  async function toggleSubtask(item: (typeof subtasks)[number]) {
    const result = await supabase
      .from("subtasks")
      .update({ is_completed: !item.is_completed })
      .eq("id", item.id);
    if (!result.error)
      setSubtasks((items) =>
        items.map((entry) =>
          entry.id === item.id
            ? { ...entry, is_completed: !entry.is_completed }
            : entry,
        ),
      );
  }
  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    const value = comment.trim();
    if (!value) return;
    const result = await supabase
      .from("task_comments")
      .insert({ user_id: userId, task_id: task.id, body: value })
      .select("id,body,created_at")
      .single();
    if (!result.error) {
      setComments((items) => [result.data, ...items]);
      setComment("");
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    await onSave(task.id, {
      title: title.trim(),
      description,
      status,
      priority,
      due_at: due ? new Date(due).toISOString() : null,
      estimated_minutes: minutes ? Number(minutes) : null,
      project_id: projectId || null,
    });
    setBusy(false);
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">TASK DETAILS</div>
            <h2>Edit task</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <label>
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {["low", "medium", "high", "urgent"].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Due date
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <label>
            Estimate (minutes)
            <input
              type="number"
              min="5"
              step="5"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
        </div>
        <label>
          Project
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <section className="detail-section">
          <div className="section-heading">
            <h3>Checklist</h3>
            <span className="muted">
              {subtasks.filter((item) => item.is_completed).length}/
              {subtasks.length}
            </span>
          </div>
          {subtasks.map((item) => (
            <label className="checklist-row" key={item.id}>
              <input
                type="checkbox"
                checked={item.is_completed}
                onChange={() => void toggleSubtask(item)}
              />
              <span className={item.is_completed ? "completed-text" : ""}>
                {item.title}
              </span>
            </label>
          ))}
          <form className="inline-add" onSubmit={addSubtask}>
            <input
              aria-label="New checklist item"
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              placeholder="Add checklist item"
            />
            <button className="button subtle small-button" type="submit">
              Add
            </button>
          </form>
        </section>
        <section className="detail-section">
          <div className="section-heading">
            <h3>Notes</h3>
            <span className="muted">{comments.length}</span>
          </div>
          <form className="inline-add" onSubmit={addComment}>
            <input
              aria-label="Task note"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note"
            />
            <button className="button subtle small-button" type="submit">
              Post
            </button>
          </form>
          {comments.map((entry) => (
            <article className="comment-row" key={entry.id}>
              <p>{entry.body}</p>
              <time>{format(new Date(entry.created_at), "MMM d, h:mm a")}</time>
            </article>
          ))}
        </section>
        <div className="modal-actions task-detail-actions">
          <button
            className="button danger-outline small-button"
            type="button"
            onClick={() => onDelete(task.id)}
          >
            Delete
          </button>
          <button
            className="button subtle small-button"
            type="button"
            onClick={() => onDuplicate(task)}
          >
            Duplicate
          </button>
          <span />
          <button className="button subtle" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateModal({
  kind,
  close,
  projects,
  saveTask,
  saved,
  supabase,
  timezone,
  toast,
  error,
}: {
  kind: "task" | "event" | "project";
  close: () => void;
  projects: Project[];
  saveTask: (title: string, extra: Partial<Task>) => Promise<void>;
  saved: () => Promise<void>;
  supabase: ReturnType<typeof createClient>;
  timezone: string;
  toast: (s: string) => void;
  error: (s: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [due, setDue] = useState("");
  const [estimate, setEstimate] = useState("");
  const [project, setProject] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (!title.trim()) {
      setBusy(false);
      return;
    }
    if (kind === "task") {
      if (due && !Number.isFinite(wallTimeToUtc(due, timezone).getTime())) {
        error("That time does not exist in your timezone because the clock changes. Choose another time.");
        setBusy(false);
        return;
      }
      await saveTask(title.trim(), {
        description,
        priority,
        due_at: due ? wallTimeToUtc(due, timezone).toISOString() : null,
        project_id: project || null,
        estimated_minutes: estimate ? Number(estimate) : null,
        status: "todo",
      });
      close();
    } else if (kind === "event") {
      if (!supabase) return;
      const a = start ? wallTimeToUtc(start, timezone) : new Date(NaN),
        b = end ? wallTimeToUtc(end, timezone) : new Date(NaN);
      if (!start || !end || !Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b <= a) {
        error("Choose a valid start and end time in your timezone.");
        setBusy(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = await supabase
        .from("calendar_events")
        .insert({
          user_id: user?.id,
          title,
          description,
          starts_at: a.toISOString(),
          ends_at: b.toISOString(),
          timezone,
        })
        .select()
        .single();
      if (result.error) error(result.error.message);
      else {
        toast("Event scheduled");
        await saved();
      }
      close();
    } else {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = await supabase
        .from("projects")
        .insert({
          user_id: user?.id,
          name: title,
          description,
          color: "#8bae96",
        })
        .select()
        .single();
      if (result.error) error(result.error.message);
      else {
        toast("Project created");
        await saved();
      }
      close();
    }
    setBusy(false);
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              {kind === "task"
                ? "GET IT MOVING"
                : kind === "event"
                  ? "MAKE TIME"
                  : "GIVE IT A HOME"}
            </div>
            <h2>
              {kind === "task"
                ? "Create a task"
                : kind === "event"
                  ? "Schedule an event"
                  : "Create a project"}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={close}>
            <X size={17} />
          </button>
        </div>
        <label>
          {kind === "project" ? "Project name" : "Title"}
          <input
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === "task"
                ? "What needs to get done?"
                : kind === "event"
                  ? "What’s happening?"
                  : "A name for this project"
            }
          />
        </label>
        {kind !== "task" && <label>
          Description
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add some context…" />
        </label>}
        {kind === "task" && <details className="task-advanced">
          <summary>Task details</summary>
          <label>Description<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add some context…" /></label>
          <div className="form-row">
            <label>
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {["low", "medium", "high", "urgent"].map((x) => (
                  <option key={x} value={x}>
                    {label(x)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          </div>
          <label>
            Project
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estimated duration (minutes)
            <input
              type="number"
              min="5"
              step="5"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="60"
            />
          </label>
        </details>}
        {kind === "event" && (
          <div className="form-row">
            <label>
              Starts
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button className="button subtle" type="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Saving…"
              : kind === "task"
                ? "Create task"
                : kind === "event"
                  ? "Save event"
                  : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}
function NotificationCenter({
  onUnreadCountChange,
}: {
  onUnreadCountChange: React.Dispatch<React.SetStateAction<number>>;
}) {
  const [rows, setRows] = useState<
    {
      id: string;
      kind: string;
      title: string;
      body: string;
      target_url: string | null;
      read_at: string | null;
      created_at: string;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = createClient();
    c?.from("notifications")
      .select("id,kind,title,body,target_url,read_at,created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data || []);
        setLoading(false);
      });
  }, []);
  async function read(id: string) {
    const existing = rows.find((n) => n.id === id);
    if (!existing || existing.read_at) return;
    const c = createClient();
    if (!c) return;
    const { error } = await c
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    const readAt = new Date().toISOString();
    setRows((v) =>
      v.map((n) => (n.id === id ? { ...n, read_at: readAt } : n)),
    );
    onUnreadCountChange((count) => Math.max(0, count - 1));
  }
  async function readAll() {
    const unread = rows.filter((row) => !row.read_at);
    if (!unread.length) return;
    const c = createClient();
    if (!c) return;
    setBusy(true);
    const readAt = new Date().toISOString();
    const { error } = await c.from("notifications").update({ read_at: readAt }).is("read_at", null);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setRows((current) => current.map((row) => row.read_at ? row : { ...row, read_at: readAt }));
    onUnreadCountChange(0);
  }
  const visibleRows = rows.filter((row) => filter === "all" || !row.read_at);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">STAY IN THE LOOP</div>
          <h1>Notifications</h1>
          <p>Your reminders and recent activity.</p>
        </div>
        <div className="heading-actions">
          <div className="view-switch" aria-label="Notification filter">
            <button type="button" className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All</button>
            <button type="button" className={filter === "unread" ? "selected" : ""} onClick={() => setFilter("unread")}>Unread</button>
          </div>
          <button type="button" className="button subtle small-button" onClick={readAll} disabled={busy || !rows.some((row) => !row.read_at)}>{busy ? "Marking…" : "Mark all read"}</button>
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      <NotificationPreferences />
      <div className="panel notification-list">
        {loading ? <div className="loading-inline">Loading notifications…</div> : visibleRows.length ? (
          visibleRows.map((n) => (
            <a
              className={`notification-row ${n.read_at ? "read" : "unread"}`}
              key={n.id}
              href={n.target_url?.startsWith("/") && !n.target_url.startsWith("//") ? n.target_url : "/app"}
              onClick={() => read(n.id)}
            >
              <span className="notification-icon">
                <Bell size={15} />
              </span>
              <span>
                <b>{n.title}</b>
                <p>{n.body}</p>
                <small>{label(n.kind)}</small>
                <small>
                  {format(new Date(n.created_at), "MMM d · h:mm a")}
                </small>
              </span>
              {!n.read_at && <i className="unread-dot" />}
            </a>
          ))
        ) : (
          <Empty
            icon={Bell}
            title={filter === "unread" ? "No unread notifications" : "You’re all caught up"}
            text={filter === "unread" ? "You’ve read all recent notifications." : "In-app reminders and schedule updates will show up here."}
          />
        )}
      </div>
    </>
  );
}
function NotificationPreferences() {
  const [value, setValue] = useState({
    in_app_enabled: true,
    push_enabled: false,
    discord_enabled: false,
    discord_user_id: "",
    email_enabled: false,
    reminder_minutes: [1440, 120],
    quiet_start: "",
    quiet_end: "",
    daily_summary: false,
    weekly_summary: false,
  });
  const [message, setMessage] = useState("");
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [discordLinked, setDiscordLinked] = useState(false);
  useEffect(() => {
    const c = createClient();
    fetch("/api/integrations/discord")
      .then((response) => response.json())
      .then((result: { connected?: boolean }) =>
        setDiscordLinked(result.connected === true),
      )
      .catch(() => setDiscordLinked(false));
    c?.from("notification_preferences")
      .select("*")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { setMessage(error.message); return; }
        if (data)
          setValue((v) => ({
            ...v,
            ...data,
            discord_user_id: data.discord_user_id || "",
            quiet_start: data.quiet_start || "",
            quiet_end: data.quiet_end || "",
          }));
      });
  }, []);
  async function save() {
    const c = createClient();
    if (!c) {
      setMessage("Supabase is not configured.");
      return false;
    }
    const { data } = await c.auth.getUser();
    const { error } = await c.from("notification_preferences").upsert({
      ...value,
      user_id: data.user?.id,
      discord_user_id: value.discord_user_id || null,
      quiet_start: value.quiet_start || null,
      quiet_end: value.quiet_end || null,
    });
    setMessage(error ? error.message : "Notification preferences saved.");
    return !error;
  }
  async function testDiscord() {
    setTestingDiscord(true);
    setMessage("");
    try {
      if (!(await save())) return;
      const response = await fetch("/api/notifications/discord-test", {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      setMessage(
        response.ok && result.ok
          ? "Test Discord notification sent. Check your DMs."
          : result.error || "Could not send the Discord test notification.",
      );
    } catch {
      setMessage("Could not send the Discord test notification. Try again.");
    } finally {
      setTestingDiscord(false);
    }
  }
  async function unlinkDiscord() {
    setMessage("");
    try {
      const response = await fetch("/api/integrations/discord", {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "Could not unlink Discord.");
        return;
      }
      setValue((v) => ({ ...v, discord_user_id: "", discord_enabled: false }));
      setDiscordLinked(false);
      setMessage("Discord account unlinked.");
    } catch {
      setMessage("Could not unlink Discord. Please try again.");
    }
  }
  async function subscribePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage("Browser push is not available in this browser.");
      return;
    }
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      setMessage(
        "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY first.",
      );
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setMessage("Browser notification permission was not granted.");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(
          atob(key.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      }));
    const result = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    setMessage(
      result.ok
        ? "Browser push is enabled."
        : "Could not save push subscription.",
    );
  }
  function toggle(
    key:
      | "in_app_enabled"
      | "push_enabled"
      | "discord_enabled"
      | "email_enabled"
      | "daily_summary"
      | "weekly_summary",
  ) {
    setValue((v) => ({ ...v, [key]: !v[key] }));
  }
  return (
    <section className="panel notification-preferences">
      <div className="panel-heading">
        <h2>Reminder preferences</h2>
        <button className="button subtle small-button" onClick={save}>
          Save preferences
        </button>
      </div>
      <div className="preference-grid">
        <label>
          <input
            type="checkbox"
            checked={value.in_app_enabled}
            onChange={() => toggle("in_app_enabled")}
          />{" "}
          In-app
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.push_enabled}
            onChange={() => toggle("push_enabled")}
          />{" "}
          Browser push
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.discord_enabled}
            onChange={() => toggle("discord_enabled")}
          />{" "}
          Discord DM
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.email_enabled}
            onChange={() => toggle("email_enabled")}
          />{" "}
          Email
        </label>
      </div>
      <div className="preference-grid secondary">
        <span className="muted reminder-label">Remind me</span>
        {[4320, 1440, 120].map((minutes) => (
          <label key={minutes}>
            <input
              type="checkbox"
              checked={value.reminder_minutes.includes(minutes)}
              onChange={() =>
                setValue((v) => ({
                  ...v,
                  reminder_minutes: v.reminder_minutes.includes(minutes)
                    ? v.reminder_minutes.filter((item) => item !== minutes)
                    : [...v.reminder_minutes, minutes].sort((a, b) => b - a),
                }))
              }
            />
            {minutes === 4320
              ? "3 days before"
              : minutes === 1440
                ? "1 day before"
                : "2 hours before"}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={value.daily_summary}
            onChange={() => toggle("daily_summary")}
          />{" "}
          Daily summary
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.weekly_summary}
            onChange={() => toggle("weekly_summary")}
          />{" "}
          Weekly summary
        </label>
        <label>
          Quiet from{" "}
          <input
            type="time"
            value={value.quiet_start}
            onChange={(e) =>
              setValue((v) => ({ ...v, quiet_start: e.target.value }))
            }
          />
        </label>
        <label>
          until{" "}
          <input
            type="time"
            value={value.quiet_end}
            onChange={(e) =>
              setValue((v) => ({ ...v, quiet_end: e.target.value }))
            }
          />
        </label>
      </div>
      <div className="preference-footer">
        <div className="discord-link-status">
          <span className="muted">
            {discordLinked
              ? "Discord account linked"
              : "No Discord account linked"}
          </span>
          <a
            className="button subtle small-button"
            href="/api/integrations/discord/connect"
          >
            {discordLinked ? "Reconnect Discord" : "Link Discord account"}
          </a>
          {discordLinked && (
            <button
              className="button subtle small-button"
              onClick={unlinkDiscord}
            >
              Unlink
            </button>
          )}
        </div>
        <button className="button subtle small-button" onClick={subscribePush}>
          Enable browser push
        </button>
        <button
          className="button subtle small-button"
          onClick={testDiscord}
          disabled={testingDiscord}
        >
          {testingDiscord ? "Sending test…" : "Test Discord notification"}
        </button>
        <span className="muted">
          Email delivery requires a configured provider and may be quota
          limited.
        </span>
      </div>
      {message && <p className="preference-message">{message}</p>}
    </section>
  );
}
function AssignmentRow({
  assignment: a,
  course,
  imported,
  importTask,
  onError,
  timezone,
}: {
  assignment: Assignment;
  course: string;
  imported: boolean;
  importTask: () => void;
  onError: (s: string) => void;
  timezone: string;
}) {
  const [due, setDue] = useState(
    a.personal_due_at
      ? zonedInputValue(a.personal_due_at, timezone)
      : "",
  );
  const [saving, setSaving] = useState(false);
  async function persist(value: string | null) {
    const c = createClient();
    if (!c) return;
    const dueInstant = value ? wallTimeToUtc(value, timezone) : null;
    if (dueInstant && !Number.isFinite(dueInstant.getTime())) {
      onError("That time does not exist in your timezone because the clock changes. Choose another time.");
      setDue(a.personal_due_at ? zonedInputValue(a.personal_due_at, timezone) : "");
      return;
    }
    setSaving(true);
    const result = await c
      .from("assignments")
      .update({
        personal_due_at: dueInstant?.toISOString() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    setSaving(false);
    if (result.error) onError(result.error.message);
  }
  return (
    <tr>
      <td>
        <b>{a.personal_title || a.title}</b>
        <small>{a.personal_description || a.description}</small>
      </td>
      <td>{course}</td>
      <td>
        {a.original_due_at
          ? format(new Date(a.original_due_at), "MMM d, yyyy")
          : "—"}
        <small>Schoology source</small>
      </td>
      <td>
        <input
          className="inline-date"
          aria-label={`Personal deadline for ${a.title}`}
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          onBlur={() => persist(due || null)}
        />
        {saving && <small>Saving…</small>}
        <small>{a.personal_due_at ? "Personal override" : "Using Schoology date"}</small>
        {a.personal_due_at && (
          <button
            className="text-button reset-deadline"
            onClick={() => {
              setDue("");
              persist(null);
            }}
          >
            Revert
          </button>
        )}
      </td>
      <td>
        {(a.personal_completed ?? a.original_completed) ? (
          <span className="state complete">Completed</span>
        ) : (
          <span className="state pending">Upcoming</span>
        )}
      </td>
      <td>
        {imported ? (
          <span className="state complete">In tasks</span>
        ) : (
          <button className="button subtle small-button" onClick={importTask}>
            Import task
          </button>
        )}
      </td>
    </tr>
  );
}
function CoursesView({
  courses,
  integration,
  onRefresh,
  toast,
  error,
  onSettings,
}: {
  courses: Course[];
  integration: IntegrationState | null;
  onRefresh: () => Promise<void>;
  toast: (s: string) => void;
  error: (s: string) => void;
  onSettings: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const connected = integration?.status === "connected";
  async function sync() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/schoology/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setStatus(json.error || "Sync failed"); return; }
      setStatus(`${json.itemsSeen} assignments checked`);
      toast("Schoology sync complete");
      await onRefresh();
    } catch (failure) {
      setStatus(failure instanceof Error ? failure.message : "Schoology sync failed");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(course: Course, key: "selected" | "auto_import") {
    const c = createClient();
    if (!c) return;
    const result = await c
      .from("courses")
      .update({ [key]: !course[key], updated_at: new Date().toISOString() })
      .eq("id", course.id);
    if (result.error) error(result.error.message);
    else await onRefresh();
  }
  async function disconnect() {
    const res = await fetch("/api/integrations/schoology", {
      method: "DELETE",
    });
    if (res.ok) {
      setStatus("Disconnected. Existing imported data remains available.");
      await onRefresh();
    } else setStatus("Could not disconnect Schoology.");
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACADEMICS</div>
          <h1>Courses</h1>
          <p>Choose which classes Daymark should keep in sync.</p>
        </div>
        <div className="heading-actions">
          <a
            className="button subtle"
            href="/api/integrations/schoology/connect"
          >
            {connected ? "Reconnect Schoology" : "Connect Schoology"}
          </a>
          <button className="button primary" disabled={busy || !connected} onClick={sync}>
            {busy ? "Syncing…" : "Sync courses"}
          </button>
        </div>
      </div>
      <div className={`notice page-notice ${integration?.last_error ? "error" : connected ? "success" : "neutral"}`}>
        <b>{connected ? "Schoology connected" : "Schoology not connected"}</b>
        <span>{integration?.last_error || (integration?.last_synced_at ? `Last successful sync ${format(new Date(integration.last_synced_at), "MMM d, yyyy · h:mm a")}` : "No successful sync recorded")}</span>
      </div>
      {status && <div className={`notice page-notice ${/failed|error|could not/i.test(status) ? "error" : "success"}`}>{status}</div>}
      {courses.length === 0 ? (
        <Empty
          icon={BookOpen}
          title="Connect Schoology to add courses"
          text="Course data is fetched from Schoology only after you authorize it. Consumer credentials and institutional API access are required."
          action="Integration setup"
          onAction={onSettings}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Course section</th>
                  <th>Sync course</th>
                  <th>Auto import assignments</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                      <small>Section {c.section_external_id || "—"}</small>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggle(c, "selected")}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={c.auto_import}
                        onChange={() => toggle(c, "auto_import")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="text-button" onClick={disconnect}>
            Disconnect Schoology (keep synced data)
          </button>
        </>
      )}
    </>
  );
}
function SettingsView({
  user,
  integrations,
  onTimezoneChange,
  onSignOut,
}: {
  user: { email?: string } | null;
  integrations: IntegrationState[];
  onTimezoneChange: (timezone: string) => void;
  onSignOut: () => void;
}) {
  const [theme, setTheme] = useState("dark");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [displayName, setDisplayName] = useState(
    user?.email?.split("@")[0] || "",
  );
  const [workdayStart, setWorkdayStart] = useState("09:00");
  const [workdayEnd, setWorkdayEnd] = useState("17:00");
  const [weekStartsOn, setWeekStartsOn] = useState(1);
  const [saved, setSaved] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState("General");
  const settingsSections = [
    "General",
    "Calendar",
    "Appearance",
    "Notifications",
    "Integrations",
    "Schoology",
    "Discord",
    "AI Planner",
    "Account",
  ];
  const schoologyIntegration = integrations.find((item) => item.provider === "schoology");
  const discordIntegration = integrations.find((item) => item.provider === "discord");
  useEffect(() => {
    const c = createClient();
    c?.from("user_preferences")
      .select("theme,timezone,workday_start,workday_end,week_starts_on")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTheme(data.theme);
          setTimezone(data.timezone);
          setWorkdayStart(data.workday_start.slice(0, 5));
          setWorkdayEnd(data.workday_end.slice(0, 5));
          setWeekStartsOn(data.week_starts_on);
        }
      });
    c?.from("profiles")
      .select("display_name")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
      });
    fetch("/api/ai/plan")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not read AI provider status")))
      .then((result: { configured: boolean }) => setAiConfigured(result.configured))
      .catch(() => setAiConfigured(null));
  }, []);
  useEffect(() => {
    const applyTheme = (event: globalThis.Event) => {
      const nextTheme = (event as CustomEvent<string>).detail;
      if (nextTheme) setTheme(nextTheme);
    };
    window.addEventListener("daymark-theme", applyTheme);
    return () => window.removeEventListener("daymark-theme", applyTheme);
  }, []);
  async function save() {
    if (workdayEnd <= workdayStart) {
      alert("Workday end must be after the start time.");
      return;
    }
    const c = createClient();
    const {
      data: { user: u },
    } = await c!.auth.getUser();
    const { error } = await c!.from("user_preferences").upsert({
      user_id: u?.id,
      theme,
      timezone,
      workday_start: workdayStart,
      workday_end: workdayEnd,
      week_starts_on: weekStartsOn,
    });
    const profileResult = await c!
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", u?.id);
    if (error || profileResult.error)
      alert(error?.message || profileResult.error?.message);
    else {
      setSaved(true);
      onTimezoneChange(timezone);
      window.dispatchEvent(new CustomEvent("daymark-theme", { detail: theme }));
      localStorage.setItem("theme", theme);
    }
  }
  async function deleteAccount() {
    if (
      !confirm(
        "Permanently delete your Daymark account and all of its data? This cannot be undone.",
      )
    )
      return;
    const response = await fetch("/api/account", { method: "DELETE" });
    if (response.ok) onSignOut();
    else {
      const result = await response.json().catch(() => ({}));
      alert(result.error || "Account deletion failed.");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>Settings</h1>
          <p>Preferences for your Daymark workspace.</p>
        </div>
        <button className="button primary" onClick={save}>
          {saved ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>
      <div className="settings-layout">
        <div className="settings-nav">
          {settingsSections.map((name) => (
            <button
              type="button"
              className={name === activeSettingsSection ? "selected" : ""}
              aria-current={name === activeSettingsSection ? "location" : undefined}
              key={name}
              onClick={() => {
                setActiveSettingsSection(name);
                document
                  .getElementById(`settings-${name.toLowerCase()}`)
                  ?.scrollIntoView({
                    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                      ? "auto"
                      : "smooth",
                    block: "start",
                  });
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="settings-content">
          <section className="settings-section" id="settings-general">
            <div className="settings-section-head">
              <h2>General</h2>
              <p>Set the basics for how Daymark works for you.</p>
            </div>
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label>
              Timezone
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {[
                  timezone,
                  "UTC",
                  "America/Los_Angeles",
                  "America/New_York",
                  "Europe/London",
                ]
                  .filter((x, i, a) => a.indexOf(x) === i)
                  .map((x) => (
                    <option key={x}>{x}</option>
                  ))}
              </select>
            </label>
          </section>
          <section className="settings-section" id="settings-calendar">
            <div className="settings-section-head">
              <h2>Calendar</h2>
              <p>Set the regular working window for scheduling proposals.</p>
            </div>
            <div className="form-row settings-hours">
              <label>
                Workday starts
                <input
                  type="time"
                  value={workdayStart}
                  onChange={(e) => setWorkdayStart(e.target.value)}
                />
              </label>
              <label>
                Workday ends
                <input
                  type="time"
                  value={workdayEnd}
                  onChange={(e) => setWorkdayEnd(e.target.value)}
                />
              </label>
            </div>
            <label>
              First day of week
              <select
                value={weekStartsOn}
                onChange={(e) => setWeekStartsOn(Number(e.target.value))}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={6}>Saturday</option>
              </select>
            </label>
          </section>
          <section className="settings-section" id="settings-appearance">
            <div className="settings-section-head">
              <h2>Appearance</h2>
              <p>Choose a comfortable working environment.</p>
            </div>
            <div className="theme-options">
              <button
                className={theme === "dark" ? "chosen" : ""}
                onClick={() => setTheme("dark")}
              >
                <Moon size={16} /> Dark
              </button>
              <button
                className={theme === "light" ? "chosen" : ""}
                onClick={() => setTheme("light")}
              >
                <Sun size={16} /> Light
              </button>
              <button
                className={theme === "system" ? "chosen" : ""}
                onClick={() => setTheme("system")}
              >
                <Settings2 size={16} /> System
              </button>
            </div>
          </section>
          <section className="settings-section" id="settings-integrations">
            <div className="settings-section-head">
              <h2>Integrations</h2>
              <p>
                Connect optional services. Your core workspace works without
                them.
              </p>
            </div>
            <div className="integration-row" id="settings-schoology">
              <span className="integration-icon">
                <GraduationCap size={17} />
              </span>
              <span>
                <b>Schoology</b>
                <small>
                  Course and assignment synchronization · API credentials
                  required
                </small>
              </span>
              <span className={`state ${schoologyIntegration?.last_error || schoologyIntegration?.status === "error" ? "error" : schoologyIntegration?.status === "connected" ? "complete" : "neutral"}`}>
                {schoologyIntegration?.last_error || (schoologyIntegration?.status ? label(schoologyIntegration.status) : "Not connected")}
              </span>
              <a className="button subtle small-button" href="/api/integrations/schoology/connect">{schoologyIntegration?.status === "connected" ? "Reconnect" : "Connect"}</a>
            </div>
            <div className="integration-row" id="settings-ai-planner">
              <span className="integration-icon"><Sparkles size={17} /></span>
              <span><b>AI provider</b><small>Optional OpenAI-compatible endpoint; secrets stay on the server.</small></span>
              <span className={`state ${aiConfigured ? "complete" : "neutral"}`}>{aiConfigured === null ? "Status unavailable" : aiConfigured ? "Configured" : "Not configured"}</span>
              <span className="muted">Set AI_BASE_URL and AI_MODEL on the server.</span>
            </div>
            <div className="integration-row" id="settings-discord">
              <span className="integration-icon">
                <Sparkles size={17} />
              </span>
              <span>
                <b>AI provider</b>
                <small>
                  OpenAI-compatible endpoint · local Ollama supported
                </small>
              </span>
              <span className={`state ${discordIntegration?.status === "connected" ? "complete" : "neutral"}`}>{discordIntegration?.status ? label(discordIntegration.status) : "Not linked"}</span>
              <a className="button subtle small-button" href="/api/integrations/discord/connect">{discordIntegration?.status === "connected" ? "Reconnect" : "Connect"}</a>
            </div>
            <div className="integration-row">
              <span className="integration-icon">
                <Bell size={17} />
              </span>
              <span>
                <b>Browser notifications</b>
                <small>Web Push support and permission</small>
              </span>
              <button
                className="button subtle small-button"
                disabled={typeof window !== "undefined" && !("Notification" in window)}
                onClick={() => { if (!("Notification" in window)) return; void Notification.requestPermission(); }}
              >
                Enable
              </button>
            </div>
          </section>
          <section className="settings-section" id="settings-notifications">
            <div className="settings-section-head"><h2>Notifications</h2><p>Choose delivery channels and reminder timing.</p></div>
            <NotificationPreferences />
          </section>
          <section className="settings-section" id="settings-account">
            <div className="settings-section-head">
              <h2>Account</h2>
              <p>Signed in as {user?.email}</p>
            </div>
            <button className="button danger-outline" onClick={onSignOut}>
              <LogOut size={15} /> Sign out
            </button>
            <button className="button danger-outline" onClick={deleteAccount}>
              Delete account and data
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
