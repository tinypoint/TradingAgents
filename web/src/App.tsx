import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Calendar } from "./components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

type JobStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
type Analyst = "market" | "social" | "news" | "fundamentals" | "quant";
type Provider = "openai" | "openai-codex" | "anthropic" | "google" | "xai" | "openrouter" | "ollama";
type ProcessStage = "analysts" | "research" | "trader" | "risk" | "final";
type ResultTab = "reports" | "images" | "csv";
type ArchiveTab = "md" | "images" | "csv";

type JobEvent = {
  seq: number;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
};

type CreateJobResponse = {
  job_id: string;
  status: JobStatus;
};

type JobResponse = {
  job_id: string;
  status: JobStatus;
  ticker: string;
  analysis_date: string;
  created_at: number;
  updated_at: number;
  error?: string;
  reports: string[];
  artifacts: string[];
  archive_dir?: string;
  archive_files: string[];
  llm_calls: number;
  tool_calls: number;
  tokens_in: number;
  tokens_out: number;
};

type FormState = {
  ticker: string;
  timeframe: string;
  range_preset: "1M" | "3M" | "6M" | "1Y" | "YTD" | "Custom";
  start_date: string;
  end_date: string;
  analysts: Analyst[];
  llm_provider: Provider;
  quick_think_llm: string;
  deep_think_llm: string;
  research_depth: 1 | 3 | 5;
};

type ProcessItem = {
  seq: number;
  time: string;
  stage: ProcessStage;
  agent: string;
  kind: "message" | "tool" | "status" | "report" | "event";
  content: string;
};
type AgentStatus = "pending" | "in_progress" | "completed";
type AgentStateItem = {
  agent: string;
  status: AgentStatus;
};
type RunSummary = {
  ticker: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  analysts: Analyst[];
  llm_provider: Provider;
  quick_think_llm: string;
  deep_think_llm: string;
  research_depth: 1 | 3 | 5;
};

const providerBackend: Record<Provider, string> = {
  "openai-codex": "https://chatgpt.com/backend-api/codex",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/",
  google: "https://generativelanguage.googleapis.com/v1",
  xai: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1"
};

const modelsByProvider: Record<Provider, string[]> = {
  "openai-codex": ["gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2-codex", "gpt-5.1-codex"],
  openai: ["gpt-5.2", "gpt-5-mini", "gpt-5.1", "gpt-4.1"],
  anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  google: ["gemini-2.5-flash", "gemini-3-pro-preview"],
  xai: ["grok-4-fast-reasoning", "grok-4-1-fast-reasoning"],
  openrouter: ["z-ai/glm-4.5-air:free", "nvidia/nemotron-3-nano-30b-a3b:free"],
  ollama: ["qwen3:latest", "gpt-oss:latest", "glm-4.7-flash:latest"]
};

const resultTabs: { key: ResultTab; label: string }[] = [
  { key: "reports", label: "Reports" },
  { key: "images", label: "PNG" },
  { key: "csv", label: "CSV" }
];
const archiveTabs: { key: ArchiveTab; label: string }[] = [
  { key: "md", label: "Markdown" },
  { key: "images", label: "PNG" },
  { key: "csv", label: "CSV" }
];

const analystCards: Record<Analyst, { title: string; desc: string; cls: string; icon: string }> = {
  market: {
    title: "Market Analyst",
    desc: "Price action and momentum context.",
    cls: "market",
    icon: "MK"
  },
  social: {
    title: "Social Analyst",
    desc: "Social flow and sentiment drift.",
    cls: "social",
    icon: "SO"
  },
  news: {
    title: "News Analyst",
    desc: "Headlines into trade implications.",
    cls: "news",
    icon: "NW"
  },
  fundamentals: {
    title: "Fundamentals Analyst",
    desc: "Valuation and earnings quality.",
    cls: "fundamentals",
    icon: "FD"
  },
  quant: {
    title: "Quant Analyst",
    desc: "Pattern + trendline + indicator composite.",
    cls: "quant",
    icon: "QT"
  }
};
const analystAgentName: Record<Analyst, string> = {
  market: "Market Analyst",
  social: "Social Analyst",
  news: "News Analyst",
  fundamentals: "Fundamentals Analyst",
  quant: "Quant Analyst"
};
const fixedAgentOrder = [
  "Bull Researcher",
  "Bear Researcher",
  "Research Manager",
  "Trader",
  "Aggressive Analyst",
  "Neutral Analyst",
  "Conservative Analyst",
  "Portfolio Manager"
];
const reportFileByAgent: Record<string, string> = {
  "Market Analyst": "market_report.md",
  "Social Analyst": "sentiment_report.md",
  "News Analyst": "news_report.md",
  "Fundamentals Analyst": "fundamentals_report.md",
  "Quant Analyst": "quant_report.md",
  "Research Manager": "investment_plan.md",
  Trader: "trader_investment_plan.md",
  "Portfolio Manager": "final_trade_decision.md"
};
const reportFileByKey: Record<string, string> = {
  market_report: "market_report.md",
  sentiment_report: "sentiment_report.md",
  news_report: "news_report.md",
  fundamentals_report: "fundamentals_report.md",
  quant_report: "quant_report.md",
  investment_plan: "investment_plan.md",
  trader_investment_plan: "trader_investment_plan.md",
  final_trade_decision: "final_trade_decision.md"
};

const timeframeOptions = ["1d", "1wk", "1mo", "1h", "15m"];
const depthCards: { value: 1 | 3 | 5; title: string; desc: string }[] = [
  { value: 1, title: "Shallow", desc: "Fast pass. Lower token/tool budget, quickest turnaround." },
  { value: 3, title: "Medium", desc: "Balanced depth and speed for most routine analysis runs." },
  { value: 5, title: "Deep", desc: "Full debate and richer reasoning. Highest latency and cost." }
];

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseDate(value: string): Date {
  const [y, m, d] = value.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1);
}
function formatDateDisplay(value: string): string {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${y}/${m}/${d}`;
}
function getRangeDates(endDate: string, preset: FormState["range_preset"]) {
  const end = new Date(`${endDate}T00:00:00`);
  const start = new Date(end);
  if (preset === "1M") start.setDate(start.getDate() - 30);
  if (preset === "3M") start.setDate(start.getDate() - 90);
  if (preset === "6M") start.setDate(start.getDate() - 180);
  if (preset === "1Y") start.setDate(start.getDate() - 365);
  if (preset === "YTD") start.setMonth(0, 1);
  return { start: formatDate(start), end: formatDate(end) };
}

function toLocalTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => extractText(item)).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.text === "string") return rec.text;
    if (typeof rec.content === "string") return rec.content;
    return JSON.stringify(rec);
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function compactText(text: string, max = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function detectStage(event: JobEvent, content: string): ProcessStage {
  const source = `${event.type} ${content}`.toLowerCase();
  if (source.includes("final_trade_decision") || source.includes("final")) return "final";
  if (source.includes("risk") || source.includes("aggressive") || source.includes("conservative") || source.includes("neutral")) return "risk";
  if (source.includes("trader") || source.includes("investment_plan")) return "trader";
  if (source.includes("bull") || source.includes("bear") || source.includes("research")) return "research";
  return "analysts";
}

function detectAgent(event: JobEvent, content: string): string {
  const dataAgent = event.data.agent;
  if (typeof dataAgent === "string" && dataAgent.trim()) return normalizeAgentName(dataAgent);

  const source = content.toLowerCase();
  if (source.includes("market")) return "Market Analyst";
  if (source.includes("social")) return "Social Analyst";
  if (source.includes("news")) return "News Analyst";
  if (source.includes("fundamental")) return "Fundamentals Analyst";
  if (source.includes("quant")) return "Quant Analyst";
  if (source.includes("bull")) return "Bull Researcher";
  if (source.includes("bear")) return "Bear Researcher";
  if (source.includes("research manager")) return "Research Manager";
  if (source.includes("trader")) return "Trader";
  if (source.includes("aggressive")) return "Aggressive Analyst";
  if (source.includes("conservative")) return "Conservative Analyst";
  if (source.includes("neutral")) return "Neutral Analyst";
  if (source.includes("portfolio manager")) return "Portfolio Manager";
  return "System";
}

function normalizeAgentName(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "market") return "Market Analyst";
  if (s === "social") return "Social Analyst";
  if (s === "news") return "News Analyst";
  if (s === "fundamentals") return "Fundamentals Analyst";
  if (s === "quant") return "Quant Analyst";
  if (s.includes("bull")) return "Bull Researcher";
  if (s.includes("bear")) return "Bear Researcher";
  if (s.includes("research manager")) return "Research Manager";
  if (s.includes("trader")) return "Trader";
  if (s.includes("aggressive")) return "Aggressive Analyst";
  if (s.includes("neutral")) return "Neutral Analyst";
  if (s.includes("conservative")) return "Conservative Analyst";
  if (s.includes("portfolio")) return "Portfolio Manager";
  if (s.includes("market analyst")) return "Market Analyst";
  if (s.includes("social analyst")) return "Social Analyst";
  if (s.includes("news analyst")) return "News Analyst";
  if (s.includes("fundamentals analyst")) return "Fundamentals Analyst";
  if (s.includes("quant analyst")) return "Quant Analyst";
  return raw;
}

function toProcessItem(event: JobEvent): ProcessItem {
  const content = extractText(event.data.content ?? event.data.message ?? event.data);
  const lowered = content.toLowerCase();
  const isTool = lowered.includes("function_call") || lowered.includes("\"type\":\"function_call\"") || lowered.includes("tool_call");

  let kind: ProcessItem["kind"] = "event";
  if (event.type === "status") kind = "status";
  else if (event.type === "report_ready") kind = "report";
  else if (isTool) kind = "tool";
  else if (event.type === "message") kind = "message";

  const stage = detectStage(event, content);
  const agent = detectAgent(event, content);

  return {
    seq: event.seq,
    time: toLocalTime(event.timestamp),
    stage,
    agent,
    kind,
    content: compactText(content || JSON.stringify(event.data))
  };
}

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((line) => line.split(","));
}
function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = `${Math.floor(s / 60)}`.padStart(2, "0");
  const ss = `${s % 60}`.padStart(2, "0");
  return `${mm}:${ss}`;
}

const today = formatDate(new Date());
const defaultRange = getRangeDates(today, "6M");
const defaultForm: FormState = {
  ticker: "AAPL",
  timeframe: "1d",
  range_preset: "6M",
  start_date: defaultRange.start,
  end_date: defaultRange.end,
  analysts: ["market", "social", "news", "fundamentals", "quant"],
  llm_provider: "openai-codex",
  quick_think_llm: "gpt-5.3-codex",
  deep_think_llm: "gpt-5.3-codex",
  research_depth: 1
};

type DatePickerFieldProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

function DatePickerField({ value, onChange, placeholder }: DatePickerFieldProps) {
  const selected = value ? parseDate(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="form-date-trigger">
          <span>{value ? formatDateDisplay(value) : placeholder || "Select date"}</span>
          <CalendarDays className="h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatDate(date));
          }}
          initialFocus
          captionLayout="dropdown-buttons"
          fromYear={2000}
          toYear={2035}
        />
      </PopoverContent>
    </Popover>
  );
}

function App() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<JobResponse | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [resultTab, setResultTab] = useState<ResultTab>("reports");
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>("md");
  const [selectedReport, setSelectedReport] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedCsv, setSelectedCsv] = useState("");
  const [selectedArchiveMd, setSelectedArchiveMd] = useState("");
  const [selectedArchiveImage, setSelectedArchiveImage] = useState("");
  const [selectedArchiveCsv, setSelectedArchiveCsv] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [archiveMdContent, setArchiveMdContent] = useState("");
  const [archiveCsvRows, setArchiveCsvRows] = useState<string[][]>([]);
  const [currentReportContent, setCurrentReportContent] = useState("");
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const processItems = useMemo(() => events.map((event) => toProcessItem(event)), [events]);

  const currentItem = useMemo(() => {
    if (processItems.length === 0) return null;
    return processItems[processItems.length - 1];
  }, [processItems]);
  const latestMessageItem = useMemo(() => {
    for (let i = processItems.length - 1; i >= 0; i -= 1) {
      if (processItems[i].kind === "message") return processItems[i];
    }
    return null;
  }, [processItems]);
  const latestToolItem = useMemo(() => {
    for (let i = processItems.length - 1; i >= 0; i -= 1) {
      if (processItems[i].kind === "tool") return processItems[i];
    }
    return null;
  }, [processItems]);
  const timelineRows = useMemo(() => {
    return processItems
      .filter((item) => item.kind === "message" || item.kind === "tool")
      .slice(-10)
      .reverse();
  }, [processItems]);

  const reportFiles = job?.reports ?? [];
  const artifactFiles = job?.artifacts ?? [];
  const imageFiles = artifactFiles.filter((name) => name.toLowerCase().endsWith(".png"));
  const csvFiles = artifactFiles.filter((name) => name.toLowerCase().endsWith(".csv"));
  const archiveFiles = job?.archive_files ?? [];
  const archiveMdFiles = archiveFiles.filter((name) => name.toLowerCase().endsWith(".md"));
  const archiveImageFiles = archiveFiles.filter((name) => name.toLowerCase().endsWith(".png"));
  const archiveCsvFiles = archiveFiles.filter((name) => name.toLowerCase().endsWith(".csv"));
  const agentStates = useMemo<AgentStateItem[]>(() => {
    const selectedAnalystAgents = form.analysts.map((a) => analystAgentName[a]);
    const order = [...selectedAnalystAgents, ...fixedAgentOrder];
    const stateMap = new Map<string, AgentStatus>();
    for (const name of order) stateMap.set(name, "pending");

    for (const [agent, reportFile] of Object.entries(reportFileByAgent)) {
      if (reportFiles.includes(reportFile) && stateMap.has(agent)) {
        stateMap.set(agent, "completed");
      }
    }

    // Update completion eagerly from live report events (before files are fully refreshed).
    for (const item of processItems) {
      if (item.kind !== "report") continue;
      const source = item.content.toLowerCase();
      if (source.includes("market_report")) stateMap.set("Market Analyst", "completed");
      if (source.includes("sentiment_report")) stateMap.set("Social Analyst", "completed");
      if (source.includes("news_report")) stateMap.set("News Analyst", "completed");
      if (source.includes("fundamentals_report")) stateMap.set("Fundamentals Analyst", "completed");
      if (source.includes("quant_report")) stateMap.set("Quant Analyst", "completed");
      if (source.includes("investment_plan")) stateMap.set("Research Manager", "completed");
      if (source.includes("trader_investment_plan")) stateMap.set("Trader", "completed");
      if (source.includes("final_trade_decision")) stateMap.set("Portfolio Manager", "completed");
    }

    // Find latest meaningful active agent (ignore status/system-only noise).
    let activeAgent: string | null = null;
    for (let i = processItems.length - 1; i >= 0; i -= 1) {
      const item = processItems[i];
      if (item.kind !== "message" && item.kind !== "tool" && item.kind !== "report") continue;
      const normalized = normalizeAgentName(item.agent);
      if (!stateMap.has(normalized)) continue;
      if (normalized.toLowerCase() === "system") continue;
      activeAgent = normalized;
      break;
    }

    const allAnalystsDone = selectedAnalystAgents.every((a) => stateMap.get(a) === "completed");
    const researchDone = stateMap.get("Research Manager") === "completed";
    const traderDone = stateMap.get("Trader") === "completed";
    const finalDone = stateMap.get("Portfolio Manager") === "completed";

    if (activeAgent && stateMap.get(activeAgent) !== "completed") {
      stateMap.set(activeAgent, "in_progress");
    } else if (!allAnalystsDone) {
      for (const analyst of selectedAnalystAgents) {
        if (stateMap.get(analyst) !== "completed") {
          stateMap.set(analyst, "in_progress");
          break;
        }
      }
    } else if (!researchDone) {
      stateMap.set("Bull Researcher", "in_progress");
    } else if (!traderDone) {
      stateMap.set("Trader", "in_progress");
    } else if (!finalDone) {
      stateMap.set("Aggressive Analyst", "in_progress");
    }

    if (job?.status === "succeeded") {
      for (const key of stateMap.keys()) stateMap.set(key, "completed");
    }

    return order.map((agent) => ({ agent, status: stateMap.get(agent) || "pending" }));
  }, [form.analysts, reportFiles, processItems, job?.status]);
  const groupedAgentStates = useMemo(() => {
    const selected = form.analysts.map((a) => analystAgentName[a]);
    const pick = (name: string) => agentStates.find((a) => a.agent === name);
    return [
      {
        team: "Analyst Team",
        items: selected.map((name) => pick(name)).filter(Boolean) as AgentStateItem[]
      },
      {
        team: "Research Team",
        items: ["Bull Researcher", "Bear Researcher", "Research Manager"].map((name) => pick(name)).filter(Boolean) as AgentStateItem[]
      },
      {
        team: "Trading Team",
        items: ["Trader"].map((name) => pick(name)).filter(Boolean) as AgentStateItem[]
      },
      {
        team: "Risk Management",
        items: ["Aggressive Analyst", "Neutral Analyst", "Conservative Analyst"].map((name) => pick(name)).filter(Boolean) as AgentStateItem[]
      },
      {
        team: "Portfolio Management",
        items: ["Portfolio Manager"].map((name) => pick(name)).filter(Boolean) as AgentStateItem[]
      }
    ].filter((g) => g.items.length > 0);
  }, [agentStates, form.analysts]);
  const latestReportFile = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const evt = events[i];
      if (evt.type !== "report_ready") continue;
      const reportKey = evt.data?.report_key;
      if (typeof reportKey === "string" && reportFileByKey[reportKey]) return reportFileByKey[reportKey];
    }
    return "";
  }, [events]);
  const elapsedText = useMemo(() => {
    if (!job) return "00:00";
    const startMs = Math.floor(job.created_at * 1000);
    const endMs =
      job.status === "running" || job.status === "queued"
        ? nowTs
        : Math.floor((job.updated_at || job.created_at) * 1000);
    return formatElapsed((endMs - startMs) / 1000);
  }, [job, nowTs]);

  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (form.range_preset === "Custom") return;
    const dates = getRangeDates(form.end_date, form.range_preset);
    setForm((prev) => ({ ...prev, start_date: dates.start, end_date: dates.end }));
  }, [form.end_date, form.range_preset]);

  useEffect(() => {
    const models = modelsByProvider[form.llm_provider];
    if (!models.includes(form.quick_think_llm) || !models.includes(form.deep_think_llm)) {
      setForm((prev) => ({ ...prev, quick_think_llm: models[0], deep_think_llm: models[0] }));
    }
  }, [form.llm_provider, form.quick_think_llm, form.deep_think_llm]);

  useEffect(() => {
    if (!jobId || !selectedReport) {
      setReportContent("");
      return;
    }
    fetch(`/api/jobs/${jobId}/reports/${selectedReport}`)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => setReportContent(text))
      .catch(() => setReportContent(""));
  }, [jobId, selectedReport]);

  useEffect(() => {
    if (!jobId || !selectedCsv) {
      setCsvRows([]);
      return;
    }
    fetch(`/api/jobs/${jobId}/artifacts/${selectedCsv}`)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => setCsvRows(parseCsv(text)))
      .catch(() => setCsvRows([]));
  }, [jobId, selectedCsv]);
  useEffect(() => {
    if (!jobId || !selectedArchiveMd) {
      setArchiveMdContent("");
      return;
    }
    fetch(`/api/jobs/${jobId}/archive/${selectedArchiveMd}`)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => setArchiveMdContent(text))
      .catch(() => setArchiveMdContent(""));
  }, [jobId, selectedArchiveMd]);
  useEffect(() => {
    if (!jobId || !selectedArchiveCsv) {
      setArchiveCsvRows([]);
      return;
    }
    fetch(`/api/jobs/${jobId}/archive/${selectedArchiveCsv}`)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => setArchiveCsvRows(parseCsv(text)))
      .catch(() => setArchiveCsvRows([]));
  }, [jobId, selectedArchiveCsv]);
  useEffect(() => {
    if (!jobId || !latestReportFile) {
      setCurrentReportContent("");
      return;
    }
    fetch(`/api/jobs/${jobId}/reports/${latestReportFile}`)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => setCurrentReportContent(text))
      .catch(() => setCurrentReportContent(""));
  }, [jobId, latestReportFile]);

  function toggleAnalyst(analyst: Analyst) {
    setForm((prev) => {
      const exists = prev.analysts.includes(analyst);
      const next = exists ? prev.analysts.filter((a) => a !== analyst) : [...prev.analysts, analyst];
      return { ...prev, analysts: next };
    });
  }

  async function refreshJob(currentJobId: string) {
    const res = await fetch(`/api/jobs/${currentJobId}`);
    if (!res.ok) return;
    const data = (await res.json()) as JobResponse;
    setJob(data);
    if (data.reports.length > 0 && !selectedReport) setSelectedReport(data.reports[0]);
    const images = data.artifacts.filter((name) => name.toLowerCase().endsWith(".png"));
    const csvs = data.artifacts.filter((name) => name.toLowerCase().endsWith(".csv"));
    if (images.length > 0 && !selectedImage) setSelectedImage(images[0]);
    if (csvs.length > 0 && !selectedCsv) setSelectedCsv(csvs[0]);
    const mdArchive = data.archive_files.filter((name) => name.toLowerCase().endsWith(".md"));
    const imageArchive = data.archive_files.filter((name) => name.toLowerCase().endsWith(".png"));
    const csvArchive = data.archive_files.filter((name) => name.toLowerCase().endsWith(".csv"));
    if (mdArchive.length > 0 && !selectedArchiveMd) setSelectedArchiveMd(mdArchive[0]);
    if (imageArchive.length > 0 && !selectedArchiveImage) setSelectedArchiveImage(imageArchive[0]);
    if (csvArchive.length > 0 && !selectedArchiveCsv) setSelectedArchiveCsv(csvArchive[0]);
  }

  function appendEventFromPayload(raw: string) {
    try {
      const evt = JSON.parse(raw) as JobEvent;
      setEvents((prev) => (prev.some((item) => item.seq === evt.seq) ? prev : [...prev, evt]));
    } catch {
      // ignore bad payload
    }
  }

  function startStream(currentJobId: string) {
    eventSourceRef.current?.close();
    const source = new EventSource(`/api/jobs/${currentJobId}/stream`);
    eventSourceRef.current = source;

    const knownTypes = ["message", "status", "report_ready", "completed", "error"];
    for (const type of knownTypes) {
      source.addEventListener(type, (evt) => {
        appendEventFromPayload((evt as MessageEvent).data);
        refreshJob(currentJobId).catch(() => undefined);
      });
    }

    source.onmessage = (evt) => {
      appendEventFromPayload(evt.data);
    };

    source.onerror = () => {
      source.close();
      refreshJob(currentJobId).catch(() => undefined);
    };
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form.analysts.length === 0) {
      setError("Please select at least one analyst.");
      return;
    }

    setBusy(true);
    setError("");
    setEvents([]);
    setJob(null);
    setJobId("");
    setSelectedReport("");
    setSelectedImage("");
    setSelectedCsv("");
    setSelectedArchiveMd("");
    setSelectedArchiveImage("");
    setSelectedArchiveCsv("");
    setCurrentReportContent("");

    const payload = {
      ticker: form.ticker.trim().toUpperCase(),
      analysis_date: form.end_date || today,
      timeframe: form.timeframe,
      start_date: form.start_date,
      end_date: form.end_date,
      analysts: form.analysts,
      llm_provider: form.llm_provider,
      backend_url: providerBackend[form.llm_provider],
      quick_think_llm: form.quick_think_llm,
      deep_think_llm: form.deep_think_llm,
      max_debate_rounds: form.research_depth,
      max_risk_discuss_rounds: form.research_depth
    };
    setRunSummary({
      ticker: payload.ticker,
      timeframe: payload.timeframe,
      start_date: payload.start_date,
      end_date: payload.end_date,
      analysts: form.analysts,
      llm_provider: form.llm_provider,
      quick_think_llm: form.quick_think_llm,
      deep_think_llm: form.deep_think_llm,
      research_depth: form.research_depth
    });

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as CreateJobResponse;
      setJobId(data.job_id);
      await refreshJob(data.job_id);
      startStream(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const activeAgent = useMemo(() => {
    const inProgress = agentStates.find((a) => a.status === "in_progress");
    if (inProgress) return inProgress.agent;
    return currentItem?.agent || "-";
  }, [agentStates, currentItem]);
  const agentsCompleted = useMemo(() => agentStates.filter((a) => a.status === "completed").length, [agentStates]);
  const agentsTotal = agentStates.length;

  return (
    <div className="page">
      <header className="topbar">
        <h1>TradingAgents Web Console</h1>
        <form className="run-form" onSubmit={onSubmit}>
          <Input value={form.ticker} onChange={(e) => setForm((p) => ({ ...p, ticker: e.target.value }))} placeholder="Ticker" />
          <Select value={form.timeframe} onValueChange={(value) => setForm((p) => ({ ...p, timeframe: value }))}>
            <SelectTrigger className="form-select-trigger">
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              {timeframeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={form.range_preset}
            onValueChange={(value) => setForm((p) => ({ ...p, range_preset: value as FormState["range_preset"] }))}
          >
            <SelectTrigger className="form-select-trigger">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              {["1M", "3M", "6M", "1Y", "YTD", "Custom"].map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePickerField value={form.start_date} onChange={(value) => setForm((p) => ({ ...p, start_date: value, range_preset: "Custom" }))} placeholder="Start date" />
          <DatePickerField value={form.end_date} onChange={(value) => setForm((p) => ({ ...p, end_date: value, range_preset: "Custom" }))} placeholder="End date" />
          <Select value={form.llm_provider} onValueChange={(value) => setForm((p) => ({ ...p, llm_provider: value as Provider }))}>
            <SelectTrigger className="form-select-trigger">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(modelsByProvider) as Provider[]).map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={form.quick_think_llm} onValueChange={(value) => setForm((p) => ({ ...p, quick_think_llm: value }))}>
            <SelectTrigger className="form-select-trigger">
              <SelectValue placeholder="Quick model" />
            </SelectTrigger>
            <SelectContent>
              {modelsByProvider[form.llm_provider].map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={form.deep_think_llm} onValueChange={(value) => setForm((p) => ({ ...p, deep_think_llm: value }))}>
            <SelectTrigger className="form-select-trigger">
              <SelectValue placeholder="Deep model" />
            </SelectTrigger>
            <SelectContent>
              {modelsByProvider[form.llm_provider].map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={busy} className="run-submit-btn">
            {busy ? "Starting..." : "Run"}
          </Button>
        </form>

        <div className="depth-card-grid">
          {depthCards.map((depth) => {
            const active = form.research_depth === depth.value;
            return (
              <Card
                key={depth.value}
                className={`depth-card ${active ? "active" : ""}`}
                onClick={() => setForm((p) => ({ ...p, research_depth: depth.value }))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setForm((p) => ({ ...p, research_depth: depth.value }));
                  }
                }}
              >
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-base">{depth.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p>{depth.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="analyst-card-grid">
          {(Object.keys(analystCards) as Analyst[]).map((name) => {
            const meta = analystCards[name];
            const active = form.analysts.includes(name);
            return (
              <Card
                key={name}
                className={`analyst-card ${meta.cls} ${active ? "active" : ""}`}
                onClick={() => toggleAnalyst(name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleAnalyst(name);
                  }
                }}
              >
                <CardContent className="analyst-content p-3">
                  <h3>{meta.title}</h3>
                  <p>{meta.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </header>

      <section className="status-strip">
        <Badge variant="outline">Job: {jobId || "-"}</Badge>
        <Badge variant="outline">Status: {job?.status || "idle"}</Badge>
        <Badge variant="outline">Elapsed: {elapsedText}</Badge>
        <Badge variant="outline">Active Agent: {activeAgent}</Badge>
        <Badge variant="outline">Agents: {agentsCompleted}/{agentsTotal || 0}</Badge>
        <Badge variant="outline">LLM: {job?.llm_calls ?? 0}</Badge>
        <Badge variant="outline">Tools: {job?.tool_calls ?? 0}</Badge>
        <Badge variant="outline">Tokens: {(job?.tokens_in ?? 0).toLocaleString()}↑ {(job?.tokens_out ?? 0).toLocaleString()}↓</Badge>
        <Badge variant="outline">Reports: {reportFiles.length}</Badge>
        <Badge variant="outline">Artifacts: {artifactFiles.length}</Badge>
        <Badge variant="outline">Archive Files: {archiveFiles.length}</Badge>
      </section>
      {(job?.error || error) && <section className="status-strip error-strip">Error: {job?.error || error}</section>}

      <main className="long-flow">
        <section className="block">
          <div className="block-head">
            <h2>Process</h2>
          </div>

          <div className="process-overview">
            <div className="agent-pipeline">
              {groupedAgentStates.map((group) => (
                <Card key={group.team} className="team-group">
                  <CardHeader className="p-2 pb-1">
                    <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{group.team}</CardTitle>
                  </CardHeader>
                  <CardContent className="team-group-list p-2 pt-0">
                    {group.items.map((item) => (
                      <div key={item.agent} className={`agent-pill ${item.status}`}>
                        <span className="dot" />
                        <span className="name">{item.agent}</span>
                        <Badge variant="outline" className="state">
                          {item.status}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="agent-live">
              <Card className="live-card">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-base">Current Message</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                <p>{latestMessageItem ? `${latestMessageItem.agent}: ${latestMessageItem.content}` : "No message yet."}</p>
                </CardContent>
              </Card>
              <Card className="live-card">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-base">Current Tool Call</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                <p>{latestToolItem ? `${latestToolItem.agent}: ${latestToolItem.content}` : "No tool call yet."}</p>
                </CardContent>
              </Card>
              <Card className="live-card">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-base">Current Report</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                <p>{latestReportFile || "No report generated yet."}</p>
                {currentReportContent && <div className="current-report-preview">{currentReportContent.slice(0, 320)}...</div>}
                </CardContent>
              </Card>
              <Card className="live-card">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-base">Run Parameters</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                {runSummary ? (
                  <div className="param-grid">
                    <span>Ticker: {runSummary.ticker}</span>
                    <span>Timeframe: {runSummary.timeframe}</span>
                    <span>Date Range: {runSummary.start_date} &rarr; {runSummary.end_date}</span>
                    <span>Provider: {runSummary.llm_provider}</span>
                    <span>Quick/Deep: {runSummary.quick_think_llm} / {runSummary.deep_think_llm}</span>
                    <span>Depth: {runSummary.research_depth === 1 ? "Shallow" : runSummary.research_depth === 3 ? "Medium" : "Deep"}</span>
                    <span>Analysts: {runSummary.analysts.join(", ")}</span>
                  </div>
                ) : (
                  <p>No run started yet.</p>
                )}
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="timeline-table-wrap">
            <Table className="timeline-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Content</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timelineRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>No message/tool records yet.</TableCell>
                  </TableRow>
                )}
                {timelineRows.map((row) => (
                  <TableRow key={row.seq}>
                    <TableCell>{row.time}</TableCell>
                    <TableCell>{row.kind}</TableCell>
                    <TableCell>{row.agent}</TableCell>
                    <TableCell>{row.content}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        </section>

        <section className="block">
          <div className="block-head">
            <h2>Results</h2>
          </div>

          <Tabs value={resultTab} onValueChange={(value) => setResultTab(value as ResultTab)} className="result-tabs">
            <TabsList className="tab-row">
              {resultTabs.map((tab) => {
                const count = tab.key === "reports" ? reportFiles.length : tab.key === "images" ? imageFiles.length : csvFiles.length;
                return (
                  <TabsTrigger key={tab.key} value={tab.key} className="tab">
                    {tab.label}
                    <span>{count}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="reports">
              <div className="result-layout">
                <div className="file-list">
                  {reportFiles.map((name) => (
                    <Button key={name} variant="outline" size="sm" className={name === selectedReport ? "file-btn active" : "file-btn"} onClick={() => setSelectedReport(name)}>
                      {name}
                    </Button>
                  ))}
                </div>
                <article className="result-view markdown-card">
                  {reportContent ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportContent}</ReactMarkdown> : <p>No report selected.</p>}
                </article>
              </div>
            </TabsContent>

            <TabsContent value="images">
              <div className="result-layout">
                <div className="file-list">
                  {imageFiles.map((name) => (
                    <Button key={name} variant="outline" size="sm" className={name === selectedImage ? "file-btn active" : "file-btn"} onClick={() => setSelectedImage(name)}>
                      {name}
                    </Button>
                  ))}
                </div>
                <article className="result-view image-view">
                  {selectedImage ? <img src={`/api/jobs/${jobId}/artifacts/${selectedImage}`} alt={selectedImage} /> : <p>No image selected.</p>}
                </article>
              </div>
            </TabsContent>

            <TabsContent value="csv">
              <div className="result-layout">
                <div className="file-list">
                  {csvFiles.map((name) => (
                    <Button key={name} variant="outline" size="sm" className={name === selectedCsv ? "file-btn active" : "file-btn"} onClick={() => setSelectedCsv(name)}>
                      {name}
                    </Button>
                  ))}
                </div>
                <article className="result-view csv-view">
                  {csvRows.length > 0 ? (
                    <Table>
                      <TableBody>
                        {csvRows.map((row, idx) => (
                          <TableRow key={`${row.join("|")}-${idx}`}>
                            {row.map((cell, cidx) => (
                              <TableCell key={`${cell}-${cidx}`}>{cell}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p>No CSV selected.</p>
                  )}
                </article>
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <section className="block">
          <div className="block-head">
            <h2>报告</h2>
          </div>

          <Tabs value={archiveTab} onValueChange={(value) => setArchiveTab(value as ArchiveTab)} className="result-tabs">
            <TabsList className="tab-row">
              {archiveTabs.map((tab) => {
                const count = tab.key === "md" ? archiveMdFiles.length : tab.key === "images" ? archiveImageFiles.length : archiveCsvFiles.length;
                return (
                  <TabsTrigger key={tab.key} value={tab.key} className="tab">
                    {tab.label}
                    <span>{count}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="md">
              <div className="result-layout">
                <div className="file-list">
                  {archiveMdFiles.map((name) => (
                    <Button key={name} variant="outline" size="sm" className={name === selectedArchiveMd ? "file-btn active" : "file-btn"} onClick={() => setSelectedArchiveMd(name)}>
                      {name}
                    </Button>
                  ))}
                </div>
                <article className="result-view markdown-card">
                  {archiveMdContent ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{archiveMdContent}</ReactMarkdown> : <p>No archived markdown selected.</p>}
                </article>
              </div>
            </TabsContent>

            <TabsContent value="images">
              <div className="result-layout">
                <div className="file-list">
                  {archiveImageFiles.map((name) => (
                    <Button key={name} variant="outline" size="sm" className={name === selectedArchiveImage ? "file-btn active" : "file-btn"} onClick={() => setSelectedArchiveImage(name)}>
                      {name}
                    </Button>
                  ))}
                </div>
                <article className="result-view image-view">
                  {selectedArchiveImage ? <img src={`/api/jobs/${jobId}/archive/${selectedArchiveImage}`} alt={selectedArchiveImage} /> : <p>No archived image selected.</p>}
                </article>
              </div>
            </TabsContent>

            <TabsContent value="csv">
              <div className="result-layout">
                <div className="file-list">
                  {archiveCsvFiles.map((name) => (
                    <Button key={name} variant="outline" size="sm" className={name === selectedArchiveCsv ? "file-btn active" : "file-btn"} onClick={() => setSelectedArchiveCsv(name)}>
                      {name}
                    </Button>
                  ))}
                </div>
                <article className="result-view csv-view">
                  {archiveCsvRows.length > 0 ? (
                    <Table>
                      <TableBody>
                        {archiveCsvRows.map((row, idx) => (
                          <TableRow key={`${row.join("|")}-${idx}`}>
                            {row.map((cell, cidx) => (
                              <TableCell key={`${cell}-${cidx}`}>{cell}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p>No archived csv selected.</p>
                  )}
                </article>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

export default App;















