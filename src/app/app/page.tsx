"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  dateInTimezone,
  sameZonedDay,
  wallTimeToUtc,
  zonedInputValue,
  zonedMidnight,
  zonedTime,
} from "@/lib/timezone";
import { useTheme } from "next-themes";
import { Modal } from "@/components/Modal";
import { Toast } from "@/components/Toast";
import { IconButton } from "@/components/IconButton";
import { CreateModal, TaskDetailModal } from "@/components/TaskModals";
import { CalendarView } from "@/components/calendar/CalendarView";
import { CalendarEventModal } from "@/components/calendar/CalendarEventModal";
import { Empty } from "@/components/Empty";
import {
  AssignmentRow,
  CoursesView,
} from "@/components/coursework/CourseworkViews";
import {
  DiscordIcon,
  NotificationPreferences,
  SettingsView,
} from "@/components/settings/SettingsView";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import {
  AlarmClock,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
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
import { maxFreeWindowMinutes } from "@/lib/scheduling";

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
type IntegrationState = {
  provider: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};
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
  ignored_at?: string | null;
};
type Proposal = {
  id: string;
  slots: {
    id: string;
    taskId: string;
    title: string;
    start: Date;
    end: Date;
    selected: boolean;
  }[];
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
  const [calendarEvents, setCalendarEvents] = useState<Event[]>([]);
  const [calendarWorkSessions, setCalendarWorkSessions] = useState<
    WorkSession[]
  >([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showIgnoredAssignments, setShowIgnoredAssignments] = useState(false);
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
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<{
    kind: "task" | "project";
    id: string;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [date, setDate] = useState(new Date());
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1 | 6>(1);
  const [workdayStart, setWorkdayStart] = useState("09:00");
  const [workdayEnd, setWorkdayEnd] = useState("17:00");
  const [displayName, setDisplayName] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [todayExplanation, setTodayExplanation] = useState("");
  const [todayExplainBusy, setTodayExplainBusy] = useState(false);
  const [allowExternalTodayExplanation, setAllowExternalTodayExplanation] =
    useState(false);
  const [planning, setPlanning] = useState(false);
  const [plannerPrompt, setPlannerPrompt] = useState("");
  const [allowExternalPlanner, setAllowExternalPlanner] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const applyNarrowTaskView = () => {
      if (media.matches)
        setTaskView((current) => (current === "Board" ? "List" : current));
    };
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
      supabase.from("assignments").select("*").order("original_due_at"),
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
      supabase
        .from("user_preferences")
        .select("timezone,week_starts_on,workday_start,workday_end")
        .maybeSingle(),
      supabase
        .from("external_integrations")
        .select("provider,status,last_synced_at,last_error")
        .in("provider", ["schoology", "discord"]),
    ]);
    if (
      t.error ||
      p.error ||
      e.error ||
      a.error ||
      c.error ||
      n.error ||
      s.error ||
      pref.error ||
      integrationResult.error
    )
      setError(
        (
          t.error ||
          p.error ||
          e.error ||
          a.error ||
          c.error ||
          n.error ||
          s.error ||
          pref.error ||
          integrationResult.error
        )?.message || "Could not load workspace data",
      );
    const { data: notificationPreference } = await supabase
      .from("notification_preferences")
      .select("in_app_enabled")
      .maybeSingle();
    setTasks((t.data || []) as Task[]);
    setProjects((p.data || []) as Project[]);
    setEvents((e.data || []) as Event[]);
    setWorkSessions((s.data || []) as WorkSession[]);
    setAssignments((a.data || []) as Assignment[]);
    setCourses((c.data || []) as Course[]);
    setUnreadCount(
      notificationPreference?.in_app_enabled === false ? 0 : n.count || 0,
    );
    if (pref.data?.timezone) setTimezone(pref.data.timezone);
    if (pref.data?.workday_start)
      setWorkdayStart(pref.data.workday_start.slice(0, 5));
    if (pref.data?.workday_end)
      setWorkdayEnd(pref.data.workday_end.slice(0, 5));
    if (
      pref.data?.week_starts_on === 0 ||
      pref.data?.week_starts_on === 1 ||
      pref.data?.week_starts_on === 6
    )
      setWeekStartsOn(pref.data.week_starts_on);
    setIntegrations((integrationResult.data || []) as IntegrationState[]);
    setDataLoading(false);
  }, [supabase]);
  const loadCalendarRange = useCallback(
    async (from: Date, to: Date) => {
      if (!supabase) return;
      const requestId = ++calendarRequest.current;
      setCalendarLoading(true);
      const [eventResult, sessionResult] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("*")
          .gte("ends_at", from.toISOString())
          .lt("starts_at", to.toISOString())
          .order("starts_at"),
        supabase
          .from("scheduled_work_sessions")
          .select("id,task_id,starts_at,ends_at,status")
          .eq("status", "planned")
          .gte("ends_at", from.toISOString())
          .lt("starts_at", to.toISOString())
          .order("starts_at"),
      ]);
      if (requestId !== calendarRequest.current) return;
      if (eventResult.error || sessionResult.error) {
        setError(
          (eventResult.error || sessionResult.error)?.message ||
            "Could not load calendar items",
        );
        setCalendarLoading(false);
        return;
      }
      setCalendarEvents((eventResult.data || []) as Event[]);
      setCalendarWorkSessions((sessionResult.data || []) as WorkSession[]);
      setCalendarLoading(false);
    },
    [supabase],
  );
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
        setToast(
          linkResult === "connected"
            ? "Discord account linked"
            : linkResult === "not_configured"
              ? "Discord account linking needs OAuth credentials in Vercel"
              : linkResult === "cancelled"
                ? "Discord account linking was cancelled"
                : "Could not link Discord account",
        );
        router.replace("/app");
      } else if (
        [
          "Today",
          "Calendar",
          "Tasks",
          "Projects",
          "Courses",
          "Assignments",
          "AI Planner",
          "Notifications",
          "Settings",
        ].includes(normalized || "")
      ) {
        setSection(normalized as Section);
      }
    });
  }, [router]);
  const changeSection = useCallback(
    (next: Section, history: "push" | "replace" = "push") => {
      setSection(next);
      const href = `/app?section=${encodeURIComponent(next)}`;
      if (history === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [router],
  );
  useEffect(() => {
    const onPopState = () => {
      const requested = new URLSearchParams(window.location.search).get(
        "section",
      );
      const normalized = requested === "My Tasks" ? "Tasks" : requested;
      setSection(
        [
          "Today",
          "Calendar",
          "Tasks",
          "Projects",
          "Courses",
          "Assignments",
          "AI Planner",
          "Notifications",
          "Settings",
        ].includes(normalized || "")
          ? (normalized as Section)
          : "Today",
      );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  async function createTask(title: string, extra: Partial<Task> = {}) {
    if (!supabase) return false;
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    if (!u) return false;
    const { error } = await supabase
      .from("tasks")
      .insert({ user_id: u.id, title, ...extra });
    if (error) {
      setError(error.message);
      return false;
    }
    setToast("Task added");
    await reload();
    return true;
  }
  async function updateTask(id: string, patch: Partial<Task>) {
    if (!supabase) return false;
    const { error } = await supabase
      .from("tasks")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    } else {
      setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      return true;
    }
  }
  async function updateWorkSessionStatus(
    id: string,
    status: "done" | "skipped",
  ) {
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("scheduled_work_sessions")
      .update({ status })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setToast(
      status === "done" ? "Work session completed" : "Work session skipped",
    );
    await reload();
    const start = startOfWeek(date, { weekStartsOn });
    await loadCalendarRange(
      zonedMidnight(start, timezone),
      zonedMidnight(addDays(start, 7), timezone),
    );
  }
  async function removeTask(id: string) {
    if (!supabase) return false;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    }
    setTasks((v) => v.filter((t) => t.id !== id));
    return true;
  }
  async function confirmDeletion() {
    if (!pendingDeletion || !supabase) return;
    if (pendingDeletion.kind === "task") {
      const removed = await removeTask(pendingDeletion.id);
      if (removed) {
        setEditingTask(null);
        setToast("Task deleted");
      }
    } else {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", pendingDeletion.id);
      if (error) setError(error.message);
      else {
        setProjects((items) =>
          items.filter((item) => item.id !== pendingDeletion.id),
        );
        setToast("Project removed");
      }
    }
    setPendingDeletion(null);
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
    window.dispatchEvent(
      new CustomEvent("daymark-theme", { detail: nextTheme }),
    );
    localStorage.setItem("theme", nextTheme);
    if (!supabase || !user) return;
    const { error } = await supabase
      .from("user_preferences")
      .update({ theme: nextTheme, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error)
      setError(
        `Theme changed for this session but could not be saved: ${error.message}`,
      );
  }
  async function generatePlan() {
    setPlanning(true);
    setError("");
    try {
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: plannerPrompt,
          allowExternalProvider: allowExternalPlanner,
        }),
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
          }) => ({
            ...s,
            id: crypto.randomUUID(),
            selected: true,
            start: new Date(s.start),
            end: new Date(s.end),
          }),
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
      tasks
        .filter(
          (t) =>
            t.title.toLowerCase().includes(search.toLowerCase()) &&
            (!taskProjectFilter || t.project_id === taskProjectFilter) &&
            (!taskStatusFilter || t.status === taskStatusFilter),
        )
        .sort((a, b) =>
          taskSort === "title"
            ? a.title.localeCompare(b.title)
            : taskSort === "priority"
              ? ["urgent", "high", "medium", "low"].indexOf(a.priority) -
                ["urgent", "high", "medium", "low"].indexOf(b.priority)
              : (a.due_at ? +new Date(a.due_at) : Infinity) -
                (b.due_at ? +new Date(b.due_at) : Infinity),
        ),
    [tasks, search, taskProjectFilter, taskStatusFilter, taskSort],
  );
  const todayTasks = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.due_at &&
      sameZonedDay(t.due_at!, new Date(), timezone),
  );
  const overdueTasks = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.due_at &&
      new Date(t.due_at) < new Date() &&
      !sameZonedDay(t.due_at, new Date(), timezone),
  );
  const todayEvents = events.filter((event) =>
    sameZonedDay(event.starts_at, new Date(), timezone),
  );
  const todaySessions = workSessions.filter((session) =>
    sameZonedDay(session.starts_at, new Date(), timezone),
  );
  const today = dateInTimezone(new Date(), timezone);
  const workdayStartAt = wallTimeToUtc(`${today}T${workdayStart}`, timezone);
  const workdayEndAt = wallTimeToUtc(`${today}T${workdayEnd}`, timezone);
  const maxFreeMinutesToday = maxFreeWindowMinutes(
    new Date(),
    workdayStartAt,
    workdayEndAt,
    [
      ...todayEvents.map((event) => ({
        start: event.starts_at,
        end: event.ends_at,
      })),
      ...todaySessions.map((session) => ({
        start: session.starts_at,
        end: session.ends_at,
      })),
    ],
  );
  const incompleteTasks = tasks.filter((task) => task.status !== "completed");
  const fittingTasks = incompleteTasks.filter(
    (task) => (task.estimated_minutes || 60) <= maxFreeMinutesToday,
  );
  const suggestedTaskFitsAvailableTime = fittingTasks.length > 0;
  const suggestedNextTask = (
    fittingTasks.length ? fittingTasks : incompleteTasks
  ).sort((a, b) => {
    const overdueA =
      a.due_at &&
      new Date(a.due_at) < new Date() &&
      !sameZonedDay(a.due_at, new Date(), timezone);
    const overdueB =
      b.due_at &&
      new Date(b.due_at) < new Date() &&
      !sameZonedDay(b.due_at, new Date(), timezone);
    if (Boolean(overdueA) !== Boolean(overdueB)) return overdueA ? -1 : 1;
    if (a.due_at && b.due_at && +new Date(a.due_at) !== +new Date(b.due_at))
      return +new Date(a.due_at) - +new Date(b.due_at);
    if (a.due_at !== b.due_at) return a.due_at ? -1 : 1;
    return (
      ["urgent", "high", "medium", "low"].indexOf(a.priority) -
      ["urgent", "high", "medium", "low"].indexOf(b.priority)
    );
  })[0];
  const upcoming = tasks
    .filter(
      (t) =>
        t.status !== "completed" &&
        t.due_at &&
        !sameZonedDay(t.due_at, new Date(), timezone),
    )
    .sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!))
    .slice(0, 5);
  const done = tasks.filter((t) => t.status === "completed").length;
  const taskContext = (task: Task) => {
    const projectName = projects.find(
      (project) => project.id === task.project_id,
    )?.name;
    const assignment = assignments.find(
      (item) => item.id === task.assignment_id,
    );
    const courseName = courses.find(
      (course) => course.id === assignment?.course_id,
    )?.name;
    return [projectName, courseName].filter(Boolean).join(" · ");
  };
  const zonedToday = new Date(
    `${dateInTimezone(new Date(), timezone)}T12:00:00`,
  );
  const weekStartDate = startOfWeek(zonedToday, { weekStartsOn });
  const weekStart = zonedMidnight(weekStartDate, timezone);
  const weekEnd = zonedMidnight(addDays(weekStartDate, 7), timezone);
  const scheduledToday = todayEvents.length + todaySessions.length;
  async function explainTodayPlan() {
    setTodayExplainBusy(true);
    setTodayExplanation("");
    try {
      const slots = [
        ...todayEvents.map((event) => ({
          title: event.title,
          start: event.starts_at,
          end: event.ends_at,
        })),
        ...todaySessions.map((session) => ({
          title:
            tasks.find((task) => task.id === session.task_id)?.title ||
            "Planned work",
          start: session.starts_at,
          end: session.ends_at,
        })),
      ].sort((a, b) => +new Date(a.start) - +new Date(b.start));
      const response = await fetch("/api/ai/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: "explain",
          input: {
            slots,
            tasks: [...overdueTasks, ...todayTasks].map((task) => ({
              title: task.title,
              dueAt: task.due_at,
              priority: task.priority,
            })),
            allowExternalProvider: allowExternalTodayExplanation,
          },
        }),
      });
      const result = (await response.json()) as {
        suggestion?: { text?: string };
        error?: string;
        provider?: string;
      };
      if (!response.ok || !result.suggestion?.text)
        throw new Error(result.error || "Could not explain today’s schedule");
      setTodayExplanation(
        `${result.suggestion.text}${result.provider === "deterministic" ? " (Daymark’s local rules)" : " (AI-assisted)"}`,
      );
    } catch (failure) {
      setTodayExplanation(
        failure instanceof Error
          ? failure.message
          : "Could not explain today’s schedule",
      );
    } finally {
      setTodayExplainBusy(false);
    }
  }
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
            <Image
              src="/daymark-icon.svg"
              alt=""
              className="logo-mark logo-dark"
              width={22}
              height={22}
              unoptimized
            />
            <Image
              src="/daymark-icon-light.svg"
              alt=""
              className="logo-mark logo-light"
              width={22}
              height={22}
              unoptimized
            />
          </div>
          <b>daymark</b>
          <button
            className="icon-button sidebar-collapse"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((v) => !v)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
          <button
            className="icon-button hide-desktop mobile-nav-close"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div
          className="workspace-pill"
          role="group"
          aria-label="Current workspace"
        >
          <div className="workspace-avatar">
            <CalendarDays size={15} />
          </div>
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
                      changeSection(item);
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
            <span>
              {
                workSessions.filter(
                  (s) =>
                    new Date(s.starts_at) >= weekStart &&
                    new Date(s.starts_at) < weekEnd,
                ).length
              }
            </span>
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
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
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
                <small>{displayName || user?.email}</small>
              </span>
              <MoreHorizontal size={16} />
            </button>
            {accountMenuOpen && (
              <div className="account-popover" id="account-actions">
                <button
                  type="button"
                  onClick={() => {
                    changeSection("Settings");
                    setAccountMenuOpen(false);
                  }}
                >
                  Account and settings
                </button>
                <button
                  type="button"
                  className="sign-out-action"
                  onClick={signOut}
                >
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
                ref={searchInput}
                aria-label="Search tasks"
                placeholder="Search tasks… (⌘K)"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (section !== "Tasks") changeSection("Tasks", "replace");
                }}
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
              onClick={() => changeSection("Notifications")}
            >
              <Bell size={17} />
            </button>
            <button
              className="icon-button theme-toggle"
              aria-label={
                resolvedTheme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              title={
                resolvedTheme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              onClick={toggleTheme}
            >
              {resolvedTheme === "dark" ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </button>
            <button
              className="user-avatar top-avatar"
              aria-label="Account settings"
              onClick={() => changeSection("Settings")}
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
          {dataLoading && (
            <div className="notice neutral page-notice">
              Loading your workspace data…
            </div>
          )}
          {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
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
                  onClick={() => changeSection("Calendar")}
                >
                  <CalendarDays size={15} /> Open calendar
                </button>
              </div>
              <div className="metric-row">
                <Metric
                  label="Overdue"
                  value={String(overdueTasks.length).padStart(2, "0")}
                  detail="past-due tasks"
                  icon={AlarmClock}
                />
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
              {suggestedNextTask && (
                <section className="panel suggested-next-panel">
                  <div>
                    <div className="eyebrow">A GOOD NEXT STEP</div>
                    <h2>{suggestedNextTask.title}</h2>
                    <p>
                      {suggestedNextTask.due_at &&
                      new Date(suggestedNextTask.due_at) < new Date() &&
                      !sameZonedDay(
                        suggestedNextTask.due_at,
                        new Date(),
                        timezone,
                      )
                        ? "This task is overdue, so it is first in your list."
                        : suggestedNextTask.due_at &&
                            sameZonedDay(
                              suggestedNextTask.due_at,
                              new Date(),
                              timezone,
                            )
                          ? "This task is due today."
                          : suggestedNextTask.due_at
                            ? `It is your next upcoming deadline, ${format(new Date(suggestedNextTask.due_at), "MMM d")}.`
                            : `It is your highest-priority task without an earlier deadline.`}
                      {suggestedTaskFitsAvailableTime
                        ? ` It fits the largest open work block today (${maxFreeMinutesToday} minutes).`
                        : ` The largest open block today is ${maxFreeMinutesToday} minutes; this task’s estimated duration is ${suggestedNextTask.estimated_minutes || 60} minutes, so consider a shorter task or another time.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button subtle small-button"
                    onClick={() => setEditingTask(suggestedNextTask)}
                  >
                    Open task
                  </button>
                </section>
              )}
              <div className="dashboard-grid">
                <section className="panel schedule-panel">
                  <PanelTitle
                    title="Today’s schedule"
                    action="View calendar"
                    onClick={() => changeSection("Calendar")}
                  />
                  <div className="schedule-explanation-control">
                    <label>
                      <input
                        type="checkbox"
                        checked={allowExternalTodayExplanation}
                        onChange={(event) =>
                          setAllowExternalTodayExplanation(event.target.checked)
                        }
                      />
                      Share today’s task titles, priorities, and schedule with
                      the configured AI provider
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      disabled={todayExplainBusy}
                      onClick={() => void explainTodayPlan()}
                    >
                      {todayExplainBusy ? "Explaining…" : "Why this plan?"}
                    </button>
                  </div>
                  {todayExplanation && (
                    <p className="muted" role="status">
                      {todayExplanation}
                    </p>
                  )}
                  {todayEvents.length === 0 &&
                  todayTasks.length === 0 &&
                  todaySessions.length === 0 ? (
                    <Empty
                      compact
                      icon={Clock3}
                      title="A little breathing room"
                      text="No events or deadlines today."
                    />
                  ) : (
                    <div className="timeline">
                      {[
                        ...todayEvents.map((e) => ({
                          title: e.title,
                          time: e.starts_at,
                          color: e.color,
                          type: "Calendar event",
                        })),
                        ...todaySessions.map((s) => ({
                          title:
                            tasks.find((t) => t.id === s.task_id)?.title ||
                            "Planned work",
                          time: s.starts_at,
                          color: "var(--accent)",
                          type: "Work session",
                        })),
                        ...todayTasks.map((t) => ({
                          title: t.title,
                          time: t.due_at!,
                          color: "var(--warning)",
                          type: "Task deadline",
                        })),
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
                              <small>{item.type}</small>
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
                    title="Overdue & upcoming"
                    action="All tasks"
                    onClick={() => changeSection("Tasks")}
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
                          onClick={() => setEditingTask(t)}
                        >
                          <span className={`priority-mark ${t.priority}`} />
                          <span className="deadline-copy">
                            <b>{t.title}</b>
                            <small>
                              {projects.find((p) => p.id === t.project_id)
                                ?.name || "Personal"}
                            </small>
                          </span>
                          <time>
                            {new Date(t.due_at!) < new Date()
                              ? "Overdue · "
                              : ""}
                            {format(new Date(t.due_at!), "MMM d")}
                          </time>
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
                    onClick={() => changeSection("AI Planner")}
                  />
                  <div className="week-chart">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = addDays(
                        startOfWeek(new Date(), { weekStartsOn }),
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
                      onClick={() => changeSection("AI Planner")}
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
                  <select
                    aria-label="Filter tasks by project"
                    value={taskProjectFilter}
                    onChange={(event) =>
                      setTaskProjectFilter(event.target.value)
                    }
                  >
                    <option value="">All projects</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter tasks by status"
                    value={taskStatusFilter}
                    onChange={(event) =>
                      setTaskStatusFilter(event.target.value)
                    }
                  >
                    <option value="">All statuses</option>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {label(status)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Sort tasks"
                    value={taskSort}
                    onChange={(event) =>
                      setTaskSort(event.target.value as typeof taskSort)
                    }
                  >
                    <option value="due">Due date</option>
                    <option value="priority">Priority</option>
                    <option value="title">Title</option>
                  </select>
                  <div className="view-switch" aria-label="Task view">
                    {(["Board", "List"] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        className={taskView === view ? "selected" : ""}
                        aria-pressed={taskView === view}
                        onClick={() => setTaskView(view)}
                      >
                        {view}
                      </button>
                    ))}
                  </div>
                  <button
                    className="button primary"
                    onClick={() => setModal("task")}
                  >
                    <Plus size={15} /> Add task
                  </button>
                </div>
              </div>
              {taskView === "Board" ? (
                <div className="task-board">
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
                                  t.status === "completed"
                                    ? "todo"
                                    : "completed",
                              })
                            }
                            onDelete={() =>
                              setPendingDeletion({ kind: "task", id: t.id })
                            }
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
                </div>
              ) : (
                <div className="panel task-list-view">
                  {filtered.length === 0 ? (
                    <Empty
                      icon={ListTodo}
                      title="No tasks match"
                      text="Add a task or adjust your search."
                    />
                  ) : (
                    filtered.map((task) => (
                      <div className="task-list-row" key={task.id}>
                        <button
                          className={`status-dot ${task.status}`}
                          aria-label={
                            task.status === "completed"
                              ? `Reopen ${task.title}`
                              : `Mark ${task.title} complete`
                          }
                          onClick={() =>
                            updateTask(task.id, {
                              status:
                                task.status === "completed"
                                  ? "todo"
                                  : "completed",
                            })
                          }
                        />
                        <button
                          className="task-list-title"
                          onClick={() => setEditingTask(task)}
                        >
                          {task.title}
                        </button>
                        <span className={`priority ${task.priority}`}>
                          {label(task.priority)}
                        </span>
                        <span className="task-context-cell">
                          {taskContext(task) || "—"}
                        </span>
                        <span>
                          {task.due_at
                            ? format(new Date(task.due_at), "MMM d")
                            : "No deadline"}
                        </span>
                        <select
                          aria-label={`Status for ${task.title}`}
                          value={task.status}
                          onChange={(event) =>
                            updateTask(task.id, { status: event.target.value })
                          }
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>
                              {label(status)}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon-button mini"
                          onClick={() => removeTask(task.id)}
                          aria-label={`Delete ${task.title}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
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
                    const upcomingMilestones = related
                      .filter((t) => t.due_at && t.status !== "completed")
                      .sort(
                        (a, b) => +new Date(a.due_at!) - +new Date(b.due_at!),
                      );
                    const overdueMilestones = upcomingMilestones.filter(
                      (t) => new Date(t.due_at!) < new Date(),
                    );
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
                              setPendingDeletion({ kind: "project", id: p.id });
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
                          <span>
                            {p.status} · {completed}/{related.length} tasks
                            complete
                          </span>
                          {p.target_date && (
                            <span>
                              Target {format(new Date(p.target_date), "MMM d")}
                            </span>
                          )}
                        </div>
                        <div className="project-milestones">
                          {p.updated_at && (
                            <small>
                              Updated {format(new Date(p.updated_at), "MMM d")}
                            </small>
                          )}
                          {overdueMilestones.length > 0 && (
                            <span className="state error">
                              {overdueMilestones.length} overdue
                            </span>
                          )}
                          {upcomingMilestones.length > 0 ? (
                            <small>
                              Next: {upcomingMilestones[0].title} ·{" "}
                              {format(
                                new Date(upcomingMilestones[0].due_at!),
                                "MMM d",
                              )}
                            </small>
                          ) : (
                            <small>No upcoming task deadlines</small>
                          )}
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setTaskProjectFilter(p.id);
                              changeSection("Tasks");
                            }}
                          >
                            View project tasks
                          </button>
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
              events={calendarEvents}
              workSessions={calendarWorkSessions}
              tasks={tasks}
              assignments={assignments.filter(
                (assignment) => !assignment.ignored_at,
              )}
              timezone={timezone}
              weekStartsOn={weekStartsOn}
              loadRange={loadCalendarRange}
              loading={calendarLoading}
              addEvent={() => setModal("event")}
              onSelectEvent={(event) =>
                setEditingEvent(
                  calendarEvents.find(
                    (candidate) => candidate.id === event.id,
                  ) || null,
                )
              }
              onSessionStatus={(id, status) =>
                void updateWorkSessionStatus(id, status)
              }
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
                  <select
                    aria-label="Filter assignments by course"
                    value={assignmentCourseFilter}
                    onChange={(event) =>
                      setAssignmentCourseFilter(event.target.value)
                    }
                  >
                    <option value="">All courses</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button subtle"
                    aria-pressed={showIgnoredAssignments}
                    onClick={() => setShowIgnoredAssignments((shown) => !shown)}
                  >
                    {showIgnoredAssignments
                      ? "Show active"
                      : "Ignored coursework"}
                  </button>
                  <button
                    className="button subtle"
                    onClick={() => changeSection("Courses")}
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
                  onAction={() => changeSection("Settings")}
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
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments
                        .filter((assignment) =>
                          showIgnoredAssignments
                            ? Boolean(assignment.ignored_at)
                            : !assignment.ignored_at,
                        )
                        .filter(
                          (assignment) =>
                            !assignmentCourseFilter ||
                            assignment.course_id === assignmentCourseFilter,
                        )
                        .map((a) => (
                          <AssignmentRow
                            key={a.id}
                            assignment={a}
                            course={
                              courses.find((c) => c.id === a.course_id)?.name ||
                              "—"
                            }
                            imported={tasks.some(
                              (t) => t.assignment_id === a.id,
                            )}
                            importTask={() => importAssignment(a)}
                            onError={setError}
                            onRefresh={reload}
                            timezone={timezone}
                            ignored={Boolean(a.ignored_at)}
                          />
                        ))}
                      {assignments.filter((assignment) =>
                        showIgnoredAssignments
                          ? Boolean(assignment.ignored_at)
                          : !assignment.ignored_at,
                      ).length === 0 && (
                        <tr>
                          <td colSpan={7} className="muted">
                            {showIgnoredAssignments
                              ? "No ignored coursework. Ignored items can be restored here."
                              : "No active coursework. Use Ignored coursework to review archived items."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {section === "Courses" && (
            <CoursesView
              courses={courses}
              integration={
                integrations.find((item) => item.provider === "schoology") ||
                null
              }
              onRefresh={reload}
              error={setError}
              onSettings={() => changeSection("Settings")}
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
                <label className="ai-consent">
                  <input
                    type="checkbox"
                    checked={allowExternalPlanner}
                    onChange={(event) =>
                      setAllowExternalPlanner(event.target.checked)
                    }
                  />
                  Allow the configured AI provider to receive my task names,
                  deadlines, calendar commitments, and this note to write the
                  plan explanation. The schedule remains deterministic.
                </label>
                <button className="button primary" onClick={generatePlan}>
                  <Sparkles size={15} />{" "}
                  {planning ? "Building plan…" : "Generate a week plan"}
                </button>
                <div className="provider-note">
                  With permission unchecked, Daymark uses the deterministic
                  scheduler and explanation only. Nothing is sent to an AI
                  provider.
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
                    [...proposal.slots]
                      .sort((a, b) => +a.start - +b.start)
                      .map((s) => (
                        <div
                          className={`proposal-row ${s.selected ? "" : "proposal-rejected"}`}
                          key={s.id}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Include ${s.title} on ${format(s.start, "MMM d")}`}
                            checked={s.selected}
                            onChange={(event) =>
                              setProposal((current) =>
                                current
                                  ? {
                                      ...current,
                                      slots: current.slots.map((slot) =>
                                        slot.id === s.id
                                          ? {
                                              ...slot,
                                              selected: event.target.checked,
                                            }
                                          : slot,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                          <span className="status-dot in_progress" />
                          <b>{s.title}</b>
                          <label className="proposal-time">
                            Start
                            <input
                              type="datetime-local"
                              value={zonedInputValue(
                                s.start.toISOString(),
                                timezone,
                              )}
                              onChange={(event) =>
                                setProposal((current) =>
                                  current
                                    ? {
                                        ...current,
                                        slots: current.slots.map((slot) =>
                                          slot.id === s.id
                                            ? {
                                                ...slot,
                                                start: wallTimeToUtc(
                                                  event.target.value,
                                                  timezone,
                                                ),
                                              }
                                            : slot,
                                        ),
                                      }
                                    : current,
                                )
                              }
                            />
                          </label>
                          <label className="proposal-time">
                            End
                            <input
                              type="datetime-local"
                              value={zonedInputValue(
                                s.end.toISOString(),
                                timezone,
                              )}
                              onChange={(event) =>
                                setProposal((current) =>
                                  current
                                    ? {
                                        ...current,
                                        slots: current.slots.map((slot) =>
                                          slot.id === s.id
                                            ? {
                                                ...slot,
                                                end: wallTimeToUtc(
                                                  event.target.value,
                                                  timezone,
                                                ),
                                              }
                                            : slot,
                                        ),
                                      }
                                    : current,
                                )
                              }
                            />
                          </label>
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
                          const {
                            data: { user: currentUser },
                          } = await supabase.auth.getUser();
                          if (!currentUser)
                            throw new Error(
                              "Your session expired. Sign in again.",
                            );
                          const { error: saveError } = await supabase
                            .from("ai_scheduling_proposals")
                            .insert({
                              id: proposal.id,
                              user_id: currentUser.id,
                              status: "rejected",
                              proposal: proposal.slots.map((slot) => ({
                                taskId: slot.taskId,
                                title: slot.title,
                                start: slot.start.toISOString(),
                                end: slot.end.toISOString(),
                              })),
                            });
                          if (saveError) throw saveError;
                          setProposal(null);
                          setToast("Proposal rejected");
                        } catch (failure) {
                          setError(
                            failure instanceof Error
                              ? failure.message
                              : "Could not reject proposal",
                          );
                        } finally {
                          setProposalBusy(false);
                        }
                      }}
                    >
                      Reject
                    </button>
                    <button
                      className="button primary"
                      disabled={
                        !proposal.slots.some((slot) => slot.selected) ||
                        proposalBusy
                      }
                      onClick={async () => {
                        if (!supabase) return;
                        setProposalBusy(true);
                        try {
                          const selectedSlots = proposal.slots.filter(
                            (slot) => slot.selected,
                          );
                          if (
                            selectedSlots.some((slot) => slot.end <= slot.start)
                          ) {
                            setError("Each session must end after it starts.");
                            return;
                          }
                          const overlaps = (
                            a: { start: Date; end: Date },
                            b: { start: Date; end: Date },
                          ) => a.start < b.end && a.end > b.start;
                          const conflict = selectedSlots.some(
                            (slot, index) =>
                              events.some((event) =>
                                overlaps(slot, {
                                  start: new Date(event.starts_at),
                                  end: new Date(event.ends_at),
                                }),
                              ) ||
                              workSessions.some((session) =>
                                overlaps(slot, {
                                  start: new Date(session.starts_at),
                                  end: new Date(session.ends_at),
                                }),
                              ) ||
                              selectedSlots
                                .slice(index + 1)
                                .some((other) => overlaps(slot, other)),
                          );
                          if (conflict) {
                            setError(
                              "Selected sessions overlap each other or an existing calendar item. Adjust the times and try again.",
                            );
                            return;
                          }
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
                              proposal: proposal.slots
                                .filter((slot) => slot.selected)
                                .map((slot) => ({
                                  taskId: slot.taskId,
                                  title: slot.title,
                                  start: slot.start.toISOString(),
                                  end: slot.end.toISOString(),
                                })),
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
                              proposal.slots
                                .filter((slot) => slot.selected)
                                .map((s) => ({
                                  user_id: u.id,
                                  task_id: s.taskId,
                                  starts_at: s.start.toISOString(),
                                  ends_at: s.end.toISOString(),
                                  proposal_id: proposal.id,
                                })),
                            );
                          if (result.error) {
                            await supabase
                              .from("ai_scheduling_proposals")
                              .delete()
                              .eq("id", proposal.id);
                            setError(result.error.message);
                          } else {
                            setToast(
                              `${proposal.slots.filter((slot) => slot.selected).length} sessions approved; ${proposal.slots.filter((slot) => !slot.selected).length} excluded`,
                            );
                            setProposal(null);
                            await reload();
                          }
                        } catch (failure) {
                          setError(
                            failure instanceof Error
                              ? failure.message
                              : "Could not approve schedule",
                          );
                        } finally {
                          setProposalBusy(false);
                        }
                      }}
                    >
                      {proposalBusy
                        ? "Saving…"
                        : `Approve ${proposal.slots.filter((slot) => slot.selected).length} sessions`}
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
            <SettingsView
              user={user}
              integrations={integrations}
              onTimezoneChange={setTimezone}
              onWeekStartsOnChange={setWeekStartsOn}
              onDisplayNameChange={setDisplayName}
              onSignOut={signOut}
              onRefresh={reload}
            />
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
      {editingEvent && (
        <CalendarEventModal
          event={editingEvent}
          timezone={timezone}
          onClose={() => setEditingEvent(null)}
          onSaved={async (message) => {
            setEditingEvent(null);
            setToast(message);
            await reload();
          }}
        />
      )}
      {editingTask && supabase && user && (
        <TaskDetailModal
          task={editingTask}
          projects={projects}
          supabase={supabase}
          timezone={timezone}
          courseworkContext={(() => {
            const assignment = assignments.find(
              (item) => item.id === editingTask.assignment_id,
            );
            return assignment
              ? {
                  courseName: courses.find(
                    (course) => course.id === assignment.course_id,
                  )?.name,
                  dueAt:
                    assignment.personal_due_at || assignment.original_due_at,
                }
              : null;
          })()}
          userId={user?.id || ""}
          onClose={() => setEditingTask(null)}
          onSave={async (id, patch) => {
            const success = await updateTask(id, patch);
            if (success) setEditingTask(null);
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
            setPendingDeletion({ kind: "task", id });
          }}
        />
      )}
      {pendingDeletion && (
        <Modal
          titleId="confirm-delete-title"
          onClose={() => setPendingDeletion(null)}
        >
          <section className="modal" aria-describedby="confirm-delete-copy">
            <div className="modal-head">
              <div>
                <div className="eyebrow">CONFIRM ACTION</div>
                <h2 id="confirm-delete-title">
                  Delete {pendingDeletion.kind}?
                </h2>
              </div>
              <IconButton
                label="Cancel delete"
                onClick={() => setPendingDeletion(null)}
              >
                <X size={17} />
              </IconButton>
            </div>
            <p id="confirm-delete-copy">
              This removes the {pendingDeletion.kind} from Daymark. This action
              cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="button subtle"
                type="button"
                onClick={() => setPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                className="button danger-outline"
                type="button"
                onClick={() => void confirmDeletion()}
              >
                Delete {pendingDeletion.kind}
              </button>
            </div>
          </section>
        </Modal>
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
        <button
          className="icon-button mini delete-task"
          aria-label={`Delete ${task.title}`}
          onClick={onDelete}
        >
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
    Promise.all([
      c
        ?.from("notifications")
        .select("id,kind,title,body,target_url,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      c
        ?.from("notification_preferences")
        .select("in_app_enabled")
        .maybeSingle(),
    ]).then(([result, preference]) => {
      const { data, error } = result || { data: null, error: null };
      if (error) setError(error.message);
      else
        setRows(preference?.data?.in_app_enabled === false ? [] : data || []);
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
    setRows((v) => v.map((n) => (n.id === id ? { ...n, read_at: readAt } : n)));
    onUnreadCountChange((count) => Math.max(0, count - 1));
  }
  async function readAll() {
    const unread = rows.filter((row) => !row.read_at);
    if (!unread.length) return;
    const c = createClient();
    if (!c) return;
    setBusy(true);
    const readAt = new Date().toISOString();
    const { error } = await c
      .from("notifications")
      .update({ read_at: readAt })
      .is("read_at", null);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((current) =>
      current.map((row) => (row.read_at ? row : { ...row, read_at: readAt })),
    );
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
            <button
              type="button"
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={filter === "unread" ? "selected" : ""}
              onClick={() => setFilter("unread")}
            >
              Unread
            </button>
          </div>
          <button
            type="button"
            className="button subtle small-button"
            onClick={readAll}
            disabled={busy || !rows.some((row) => !row.read_at)}
          >
            {busy ? "Marking…" : "Mark all read"}
          </button>
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      <NotificationPreferences />
      <div className="panel notification-list">
        {loading ? (
          <div className="loading-inline">Loading notifications…</div>
        ) : visibleRows.length ? (
          visibleRows.map((n) => (
            <a
              className={`notification-row ${n.read_at ? "read" : "unread"}`}
              key={n.id}
              href={
                n.target_url?.startsWith("/") && !n.target_url.startsWith("//")
                  ? n.target_url
                  : "/app"
              }
              onClick={() => read(n.id)}
            >
              <span className="notification-icon">
                <NotificationKindIcon kind={n.kind} />
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
            title={
              filter === "unread"
                ? "No unread notifications"
                : "You’re all caught up"
            }
            text={
              filter === "unread"
                ? "You’ve read all recent notifications."
                : "In-app reminders and schedule updates will show up here."
            }
          />
        )}
      </div>
    </>
  );
}
function NotificationKindIcon({ kind }: { kind: string }) {
  const icons: Record<string, React.ElementType> = {
    assignment: GraduationCap,
    calendar: CalendarDays,
    event: CalendarDays,
    reminder: Clock3,
    work_session: Clock3,
    discord: DiscordIcon,
  };
  const Icon = icons[(kind || "").toLowerCase()] || Bell;
  return <Icon size={15} />;
}
