import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Atom,
  BarChart3,
  BrainCircuit,
  CandlestickChart,
  Check,
  Cog,
  Layers3,
  MessageCircle,
  Newspaper,
  Scale,
  Search,
  FileSpreadsheet,
  Files,
  ImageIcon,
  Download,
  FileText,
  Wrench,
  Bot,
  BookOpenText,
  Github,
  ShieldCheck,
  Sparkles,
  Zap,
  Play,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import type { Analyst, JobCreateResponse, JobEvent, JobResponse, Master, Provider } from "../../types/api";
import { createJob, getArchiveText, getArtifactCsv, getJob, getReport, listArchiveFiles } from "../../services/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { AgentsGraph } from "./AgentsGraph";
import { DatePickerField } from "./DatePickerField";
import { ReportMarkdown } from "./ReportMarkdown";
import {
  analystAgentName,
  analystCards,
  defaultForm,
  depthCards,
  fixedAgentOrder,
  getRangeDates,
  masterAgentName,
  masterCards,
  modelsByProvider,
  providerBackend,
  reportFileByAgent,
  reportFileByKey,
  timeframeOptions,
} from "./analyzeWorkspace.constants";
import { formatElapsed, normalizeAgentName, parseCsv, toProcessItem } from "./analyzeWorkspace.helpers";
import type { AgentStateItem, AgentStatus, ArchiveTab, FormState, ProcessItem, RunSummary } from "./analyzeWorkspace.types";

type AnalyzeWorkspaceProps = {
  initialTicker?: string;
};
function AnalyzeWorkspace({ initialTicker }: AnalyzeWorkspaceProps) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<JobResponse | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  // compatibility state for stale hot-reload bundles that may still reference archiveTab
  const [archiveTab] = useState<ArchiveTab>("md");
  const [processTab, setProcessTab] = useState<"messages" | "tools" | "reports" | "params">("messages");
  const [selectedReport, setSelectedReport] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedCsv, setSelectedCsv] = useState("");
  const [selectedArchiveMd, setSelectedArchiveMd] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [archiveMdContent, setArchiveMdContent] = useState("");
  const [currentReportContent, setCurrentReportContent] = useState("");
  const [archiveFilesState, setArchiveFilesState] = useState<string[]>([]);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const processItems = useMemo(() => events.map((event) => toProcessItem(event)), [events]);

  const currentItem = useMemo(() => {
    if (processItems.length === 0) return null;
    return processItems[processItems.length - 1];
  }, [processItems]);
  const messageRows = useMemo(
    () => processItems.filter((item) => item.kind === "message").slice(-24).reverse(),
    [processItems]
  );
  const toolRows = useMemo(
    () => processItems.filter((item) => item.kind === "tool").slice(-24).reverse(),
    [processItems]
  );
  const reportRows = useMemo(
    () => processItems.filter((item) => item.kind === "report").slice(-24).reverse(),
    [processItems]
  );
  const eventLogRows = useMemo(
    () => (showAllEvents ? [...processItems].reverse() : processItems.slice(-30).reverse()),
    [processItems, showAllEvents]
  );
  const agentOutputs = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of processItems) {
      if (item.agent && item.agent !== "System" && item.kind === "message") {
        map[item.agent] = item.content;
      }
    }
    return map;
  }, [processItems]);

  const reportFiles = job?.reports ?? [];
  const artifactFiles = job?.artifacts ?? [];
  const imageFiles = artifactFiles.filter((name) => name.toLowerCase().endsWith(".png"));
  const csvFiles = artifactFiles.filter((name) => name.toLowerCase().endsWith(".csv"));
  const archiveFiles = archiveFilesState.length > 0 ? archiveFilesState : (job?.archive_files ?? []);
  const archiveMdFiles = archiveFiles.filter((name) => name.toLowerCase().endsWith(".md"));
  const reportDisplayItems = useMemo(() => {
    return reportFiles.map((file) => {
      const normalized = file.endsWith("_cn.md") ? file.replace("_cn.md", ".md") : file;
      const owner = Object.entries(reportFileByAgent).find(([, value]) => value === normalized)?.[0] || "Analysis";
      return { file, owner };
    });
  }, [reportFiles]);
  const reportHubFiles = archiveMdFiles.length > 0 ? archiveMdFiles : reportFiles;
  const reportHubCurrent = selectedArchiveMd || selectedReport;
  const reportHubContent = archiveMdFiles.includes(reportHubCurrent) ? archiveMdContent : reportContent;
  const reportHubItems = useMemo(() => {
    return reportHubFiles.map((file) => {
      const normalized = file.endsWith("_cn.md") ? file.replace("_cn.md", ".md") : file;
      const owner = Object.entries(reportFileByAgent).find(([, value]) => value === normalized)?.[0] || "Agent Team";
      let title = file
        .replace(".md", "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());
      if (normalized === "final_trade_decision.md") title = "Final Trading Report";
      if (normalized === "investment_plan.md") title = "Research Synthesis";
      if (normalized === "trader_investment_plan.md") title = "Trade Execution Plan";
      return { file, owner, title };
    });
  }, [reportHubFiles]);
  const reportHubCurrentMeta = reportHubItems.find((item) => item.file === reportHubCurrent);
  const reportHubDownloadHref = reportHubCurrent
    ? archiveMdFiles.includes(reportHubCurrent)
      ? `/api/jobs/${jobId}/archive/${reportHubCurrent}`
      : `/api/jobs/${jobId}/reports/${reportHubCurrent}`
    : "";
  const agentStates = useMemo<AgentStateItem[]>(() => {
    const selectedAnalystAgents = form.analysts.map((a) => analystAgentName[a]);
    const selectedMasterAgents = form.selected_masters.map((m) => masterAgentName[m]);
    const researchManagerIndex = fixedAgentOrder.indexOf("Research Manager");
    const preMasterFlow = fixedAgentOrder.slice(0, researchManagerIndex + 1);
    const postMasterFlow = fixedAgentOrder.slice(researchManagerIndex + 1);
    const order = [
      ...selectedAnalystAgents,
      ...preMasterFlow,
      ...selectedMasterAgents,
      ...(selectedMasterAgents.length ? ["Style Manager"] : []),
      ...postMasterFlow,
    ];
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
      if (source.includes("buffett_report")) stateMap.set("Buffett Advisor", "completed");
      if (source.includes("larry_williams_report")) stateMap.set("Larry Williams Advisor", "completed");
      if (source.includes("livermore_report")) stateMap.set("Livermore Advisor", "completed");
      if (source.includes("style_report")) stateMap.set("Style Manager", "completed");
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
    const mastersDone =
      selectedMasterAgents.length === 0 ||
      (selectedMasterAgents.every((m) => stateMap.get(m) === "completed") && stateMap.get("Style Manager") === "completed");
    const traderDone = stateMap.get("Trader") === "completed";
    const finalDone = stateMap.get("Portfolio Manager") === "completed";

    // Backfill upstream stages when downstream milestones exist.
    // Some nodes do not emit dedicated report files (e.g., Bear/Risk debaters),
    // so they must not stay pending after later stages have clearly completed.
    if (researchDone) {
      if (stateMap.has("Bull Researcher") && stateMap.get("Bull Researcher") !== "completed") {
        stateMap.set("Bull Researcher", "completed");
      }
      if (stateMap.has("Bear Researcher") && stateMap.get("Bear Researcher") !== "completed") {
        stateMap.set("Bear Researcher", "completed");
      }
    }
    if (finalDone) {
      for (const riskNode of ["Aggressive Analyst", "Neutral Analyst", "Conservative Analyst"]) {
        if (stateMap.has(riskNode) && stateMap.get(riskNode) !== "completed") {
          stateMap.set(riskNode, "completed");
        }
      }
    }

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
    } else if (!mastersDone) {
      const pendingMaster = selectedMasterAgents.find((m) => stateMap.get(m) !== "completed");
      stateMap.set(pendingMaster || "Style Manager", "in_progress");
    } else if (!traderDone) {
      stateMap.set("Trader", "in_progress");
    } else if (!finalDone) {
      stateMap.set("Aggressive Analyst", "in_progress");
    }

    if (job?.status === "succeeded") {
      for (const key of stateMap.keys()) stateMap.set(key, "completed");
    }

    return order.map((agent) => ({ agent, status: stateMap.get(agent) || "pending" }));
  }, [form.analysts, form.selected_masters, reportFiles, processItems, job?.status]);
  const latestReportFile = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const evt = events[i];
      if (evt.type !== "report_ready") continue;
      const reportFile = evt.data?.report_file;
      if (typeof reportFile === "string" && reportFile.trim() && reportFiles.includes(reportFile)) return reportFile;
      const reportKey = evt.data?.report_key;
      if (typeof reportKey === "string" && reportFileByKey[reportKey] && reportFiles.includes(reportFileByKey[reportKey])) {
        return reportFileByKey[reportKey];
      }
    }
    return "";
  }, [events, reportFiles]);
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
    if (!initialTicker) return;
    setForm((prev) => ({ ...prev, ticker: initialTicker.toUpperCase() }));
  }, [initialTicker]);
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
    getReport(jobId, selectedReport)
      .then((text) => setReportContent(text))
      .catch(() => setReportContent(""));
  }, [jobId, selectedReport]);

  useEffect(() => {
    if (!jobId || !selectedCsv) {
      setCsvRows([]);
      return;
    }
    getArtifactCsv(jobId, selectedCsv)
      .then((text) => setCsvRows(parseCsv(text)))
      .catch(() => setCsvRows([]));
  }, [jobId, selectedCsv]);
  useEffect(() => {
    if (!jobId || !selectedArchiveMd) {
      setArchiveMdContent("");
      return;
    }
    getArchiveText(jobId, selectedArchiveMd)
      .then((text) => setArchiveMdContent(text))
      .catch(() => setArchiveMdContent(""));
  }, [jobId, selectedArchiveMd]);
  useEffect(() => {
    if (!jobId) return;
    listArchiveFiles(jobId)
      .then((files) => setArchiveFilesState(files))
      .catch(() => undefined);
  }, [jobId]);
  useEffect(() => {
    if (!jobId || !latestReportFile) {
      setCurrentReportContent("");
      return;
    }
    getReport(jobId, latestReportFile)
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

  function toggleMaster(master: Master) {
    setForm((prev) => {
      const exists = prev.selected_masters.includes(master);
      const next = exists ? prev.selected_masters.filter((m) => m !== master) : [...prev.selected_masters, master];
      return { ...prev, selected_masters: next };
    });
  }

  async function refreshJob(currentJobId: string) {
    const data = await getJob(currentJobId);
    setJob(data);
    if (data.status === "succeeded") {
      try {
        const files = await listArchiveFiles(currentJobId);
        setArchiveFilesState(files);
      } catch {
        // ignore archive listing errors; UI falls back to job payload fields
      }
    }
    if (data.reports.length > 0 && !selectedReport) setSelectedReport(data.reports[0]);
    const images = data.artifacts.filter((name) => name.toLowerCase().endsWith(".png"));
    const csvs = data.artifacts.filter((name) => name.toLowerCase().endsWith(".csv"));
    if (images.length > 0 && !selectedImage) setSelectedImage(images[0]);
    if (csvs.length > 0 && !selectedCsv) setSelectedCsv(csvs[0]);
    const mdArchive = data.archive_files.filter((name) => name.toLowerCase().endsWith(".md"));
    if (mdArchive.length > 0 && !selectedArchiveMd) setSelectedArchiveMd(mdArchive[0]);
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
    setCurrentReportContent("");
    setArchiveFilesState([]);

    const payload = {
      ticker: form.ticker.trim().toUpperCase(),
      analysis_date: form.end_date || today,
      timeframe: form.timeframe,
      start_date: form.start_date,
      end_date: form.end_date,
      analysts: form.analysts,
      selected_masters: form.selected_masters,
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
      selected_masters: form.selected_masters,
      llm_provider: form.llm_provider,
      quick_think_llm: form.quick_think_llm,
      deep_think_llm: form.deep_think_llm,
      research_depth: form.research_depth
    });

    try {
      const data = (await createJob(payload)) as JobCreateResponse;
      setJobId(data.job_id);
      await refreshJob(data.job_id);
      startStream(data.job_id);
      toast.success(`Job started: ${data.job_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
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
        <div className="hero">
          <div className="hero-badge"><Sparkles className="h-3.5 w-3.5" /> Multi-Agent AI Trading System</div>
          <h1>Trading Agent</h1>
          <p>Orchestrate a team of specialized AI agents to analyze markets, evaluate risk, and generate actionable trading insights.</p>
          <div className="hero-agents-ready">
            <span className="hero-icons">
              <span className="hero-icon c1"><Activity className="h-3 w-3" /></span>
              <span className="hero-icon c2"><MessageCircle className="h-3 w-3" /></span>
              <span className="hero-icon c3"><Newspaper className="h-3 w-3" /></span>
              <span className="hero-icon c4"><BarChart3 className="h-3 w-3" /></span>
              <span className="hero-icon c5"><CandlestickChart className="h-3 w-3" /></span>
            </span>
            <span>{agentStates.length} agents ready</span>
          </div>
        </div>

        <form className="config-shell" onSubmit={onSubmit}>
          <Card className="config-card config-card-primary">
            <CardHeader className="config-header">
              <CardTitle>Configure Analysis</CardTitle>
            </CardHeader>
            <CardContent className="config-content">
              <div className="run-form">
                <div className="configure-block">
                  <label className="configure-label">Stock Ticker</label>
                  <div className="ticker-input-wrap">
                    <Search className="h-4 w-4 ticker-search-icon" />
                    <Input
                      value={form.ticker}
                      onChange={(e) => setForm((p) => ({ ...p, ticker: e.target.value }))}
                      placeholder="Asset Ticker"
                      className="ticker-input"
                    />
                  </div>
                </div>

                <div className="configure-block">
                  <label className="configure-label">Timeframe</label>
                  <div className="pill-row">
                    {timeframeOptions.map((t) => {
                      const active = form.timeframe === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          className={`pill-btn ${active ? "active" : ""}`}
                          onClick={() => setForm((p) => ({ ...p, timeframe: t }))}
                        >
                          {t.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="configure-block">
                  <label className="configure-label">Date Range</label>
                  <div className="pill-row">
                    {[
                      { value: "1M", label: "1 Month" },
                      { value: "6M", label: "6 Months" },
                      { value: "Custom", label: "Custom" },
                    ].map((preset) => {
                      const active = form.range_preset === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          className={`pill-btn ${active ? "active" : ""}`}
                          onClick={() => setForm((p) => ({ ...p, range_preset: preset.value as FormState["range_preset"] }))}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {form.range_preset === "Custom" && (
                  <div className="custom-date-row">
                    <DatePickerField
                      value={form.start_date}
                      onChange={(value) => setForm((p) => ({ ...p, start_date: value, range_preset: "Custom" }))}
                      placeholder="Start date"
                    />
                    <DatePickerField
                      value={form.end_date}
                      onChange={(value) => setForm((p) => ({ ...p, end_date: value, range_preset: "Custom" }))}
                      placeholder="End date"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="config-card config-card-secondary">
            <CardHeader className="config-header">
              <CardTitle>Model Configuration</CardTitle>
            </CardHeader>
            <CardContent className="config-content model-grid">
              <div className="model-field">
                <label className="model-label"><Cog className="h-3.5 w-3.5" /> Provider</label>
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
              </div>
              <div className="model-field">
                <label className="model-label"><BrainCircuit className="h-3.5 w-3.5" /> Analysis Model</label>
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
              </div>
              <div className="model-field">
                <label className="model-label"><Layers3 className="h-3.5 w-3.5" /> Deep Model</label>
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
              </div>
            </CardContent>
          </Card>

          <Card className="plain-section">
            <CardHeader className="config-header">
              <CardTitle>Thinking Depth</CardTitle>
              <p className="section-subtitle">Control the reasoning intensity and cost tradeoff</p>
            </CardHeader>
            <CardContent className="config-content">
              <div className="depth-card-grid">
          {depthCards.map((depth) => {
            const active = form.research_depth === depth.value;
            const depthTone = depth.value === 1 ? "depth-shallow" : depth.value === 3 ? "depth-medium" : "depth-deep";
            return (
              <Card
                key={depth.value}
                className={`depth-card ${depthTone} ${active ? "active" : ""}`}
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
                  <div className="depth-icon">
                    {depth.value === 1 && <Zap className="h-5 w-5" />}
                    {depth.value === 3 && <Scale className="h-5 w-5" />}
                    {depth.value === 5 && <Atom className="h-5 w-5" />}
                  </div>
                  <div className="card-check">{active && <Check className="h-3.5 w-3.5" />}</div>
                  <CardTitle className="text-base">{depth.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p>{depth.desc}</p>
                </CardContent>
              </Card>
            );
          })}
              </div>
            </CardContent>
          </Card>

          <Card className="plain-section">
            <CardHeader className="config-header">
              <CardTitle>Analysis Agents</CardTitle>
              <p className="section-subtitle">Select the AI analysts to deploy on this run</p>
            </CardHeader>
            <CardContent className="config-content">
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
                  <div className="card-check">{active && <Check className="h-3.5 w-3.5" />}</div>
                  <div className="agent-icon-box">
                    {name === "market" && <Activity className="h-5 w-5" />}
                    {name === "social" && <MessageCircle className="h-5 w-5" />}
                    {name === "news" && <Newspaper className="h-5 w-5" />}
                    {name === "fundamentals" && <BarChart3 className="h-5 w-5" />}
                    {name === "quant" && <CandlestickChart className="h-5 w-5" />}
                  </div>
                  <h3>{meta.title}</h3>
                  <p>{meta.desc}</p>
                </CardContent>
              </Card>
            );
          })}
              </div>
            </CardContent>
          </Card>

          <Card className="plain-section">
            <CardHeader className="config-header">
              <CardTitle>Classic Masters</CardTitle>
              <p className="section-subtitle">Legendary trading wisdom as AI advisory personas</p>
            </CardHeader>
            <CardContent className="config-content">
              <div className="master-card-grid">
          {(Object.keys(masterCards) as Master[]).map((name) => {
            const meta = masterCards[name];
            const active = form.selected_masters.includes(name);
            const avatar =
              name === "buffett"
                ? "/avatars/buffett.svg"
                : name === "larry_williams"
                ? "/avatars/williams.svg"
                : "/avatars/livermore.svg";
            return (
              <Card
                key={name}
                className={`master-card ${meta.cls} ${active ? "active" : ""}`}
                onClick={() => toggleMaster(name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleMaster(name);
                  }
                }}
              >
                <CardContent className="analyst-content p-3">
                  <div className="card-check">{active && <Check className="h-3.5 w-3.5" />}</div>
                  <div className="master-avatar">
                    <img src={avatar} alt={meta.title} />
                  </div>
                  <h3>{meta.title}</h3>
                  <p>{meta.desc}</p>
                </CardContent>
              </Card>
            );
          })}
              </div>
              <Button type="submit" disabled={busy} className="run-submit-btn launch-btn">
                {busy ? "Starting..." : <><Play className="h-4 w-4" /> Launch Analysis <Sparkles className="h-4 w-4" /></>}
              </Button>
            </CardContent>
          </Card>
        </form>
      </header>

      {(job?.error || error) && <section className="status-strip error-strip">Error: {job?.error || error}</section>}

      <main className="long-flow">
        <div className="section-divider">
          <div className="line" />
          <span>Analysis Results</span>
          <div className="line" />
        </div>
        <section className="block progress-block">
          <div className="block-head">
            <h2>Agent Progress</h2>
            <p className="section-subtitle progress-subtitle">Real-time visualization of the multi-agent analysis pipeline</p>
          </div>

          <div className="process-overview">
            <div className="agent-pipeline progress-graph">
              <AgentsGraph nodesState={agentStates} agentOutputs={agentOutputs} />
            </div>
            <div className="agent-live progress-right">
              <Tabs value={processTab} onValueChange={(value) => setProcessTab(value as "messages" | "tools" | "reports" | "params")} className="process-tabs">
                <TabsList className="process-tab-list">
                  <TabsTrigger value="messages" className="process-tab-trigger"><MessageCircle className="h-3.5 w-3.5" /> Messages</TabsTrigger>
                  <TabsTrigger value="tools" className="process-tab-trigger"><Wrench className="h-3.5 w-3.5" /> Tool Calls</TabsTrigger>
                  <TabsTrigger value="reports" className="process-tab-trigger"><FileText className="h-3.5 w-3.5" /> Report</TabsTrigger>
                  <TabsTrigger value="params" className="process-tab-trigger"><Cog className="h-3.5 w-3.5" /> Run Parameters</TabsTrigger>
                </TabsList>

                <TabsContent value="messages" className="process-tab-content">
                  <div className="message-list">
                    {messageRows.length === 0 && <p className="empty-note">No messages yet.</p>}
                    {messageRows.map((row) => (
                      <div key={row.seq} className="message-item">
                        <div className="message-meta">
                          <span className="message-agent">{row.agent}</span>
                          <span className="message-time">{row.time}</span>
                        </div>
                        <p>{row.content}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="tools" className="process-tab-content">
                  <div className="message-list">
                    {toolRows.length === 0 && <p className="empty-note">No tool calls yet.</p>}
                    {toolRows.map((row) => (
                      <div key={row.seq} className="message-item">
                        <div className="message-meta">
                          <span className="message-agent">{row.agent}</span>
                          <span className="message-time">{row.time}</span>
                        </div>
                        <p>{row.content}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="reports" className="process-tab-content">
                  <div className="message-list">
                    {latestReportFile ? (
                      <div className="message-item">
                        <div className="message-meta">
                          <span className="message-agent">Latest Report</span>
                          <span className="message-time">{latestReportFile}</span>
                        </div>
                        <p>{currentReportContent ? `${currentReportContent.slice(0, 420)}...` : "Report preview loading..."}</p>
                      </div>
                    ) : (
                      <p className="empty-note">No report generated yet.</p>
                    )}
                    {reportRows.map((row) => (
                      <div key={row.seq} className="message-item">
                        <div className="message-meta">
                          <span className="message-agent">{row.agent}</span>
                          <span className="message-time">{row.time}</span>
                        </div>
                        <p>{row.content}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="params" className="process-tab-content">
                  {runSummary ? (
                    <div className="param-grid">
                      <span>Ticker: {runSummary.ticker}</span>
                      <span>Timeframe: {runSummary.timeframe}</span>
                      <span>Date Range: {runSummary.start_date} &rarr; {runSummary.end_date}</span>
                      <span>Provider: {runSummary.llm_provider}</span>
                      <span>Quick/Deep: {runSummary.quick_think_llm} / {runSummary.deep_think_llm}</span>
                      <span>Depth: {runSummary.research_depth === 1 ? "Shallow" : runSummary.research_depth === 3 ? "Medium" : "Deep"}</span>
                      <span>Analysts: {runSummary.analysts.join(", ")}</span>
                      <span>
                        Masters:{" "}
                        {runSummary.selected_masters.length
                          ? runSummary.selected_masters.map((m) => masterCards[m].title).join(", ")
                          : "none"}
                      </span>
                    </div>
                  ) : (
                    <p className="empty-note">No run started yet.</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="job-id-row">
            <span className="job-id-label">Job:</span>
            <span className="job-id-chip">{jobId || "-"}</span>
          </div>
          <div className="job-stats-card">
            <div className="job-stats-row">
              <span className="job-stat"><i className="dot status" />Status: <b>{job?.status || "idle"}</b></span>
              <span className="job-stat"><i className="dot elapsed" />Elapsed: <b>{elapsedText}</b></span>
              <span className="job-stat"><i className="dot active" />Active Agent: <b>{activeAgent}</b></span>
              <span className="job-stat"><i className="dot agents" />Agents: <b>{agentsCompleted}/{agentsTotal || 0}</b></span>
              <span className="job-stat"><i className="dot llm" />LLM: <b>{job?.llm_calls ?? 0}</b></span>
              <span className="job-stat"><i className="dot tools" />Tools: <b>{job?.tool_calls ?? 0}</b></span>
              <span className="job-stat"><i className="dot tokens" />Tokens: <b>{(job?.tokens_in ?? 0).toLocaleString()} in / {(job?.tokens_out ?? 0).toLocaleString()} out</b></span>
            </div>
            <div className="job-stats-row second">
              <span className="job-stat"><i className="dot reports" />Reports: <b>{reportFiles.length}</b></span>
              <span className="job-stat"><i className="dot artifacts" />Artifacts: <b>{artifactFiles.length}</b></span>
              <span className="job-stat"><i className="dot archive" />Archive: <b>{archiveFiles.length} files</b></span>
            </div>
          </div>

        </section>

        <section className="block event-log-block">
          <div className="block-head event-log-head">
            <div className="event-log-title-wrap">
              <Waves className="h-4 w-4 event-wave-icon" />
              <h2>Event Log</h2>
              <Badge variant="outline">{eventLogRows.length}</Badge>
            </div>
            {processItems.length > 30 && (
              <button
                type="button"
                className="show-all-btn"
                onClick={() => setShowAllEvents((v) => !v)}
              >
                {showAllEvents ? "Show latest 30" : "Show all"}
              </button>
            )}
          </div>
          <div className="event-log-list">
            {eventLogRows.length === 0 && <p className="empty-note">No events yet.</p>}
            {eventLogRows.map((row) => (
              <div key={row.seq} className="event-log-item">
                <div className={`event-dot ${row.kind}`} />
                <div className="event-main">
                  <div className="event-top">
                    <strong>{row.agent}</strong>
                    <span>{row.time}</span>
                  </div>
                  <p>{row.content}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="block artifacts-block">
          <div className="output-divider">
            <span>Output Files</span>
          </div>
          <div className="block-head">
            <h2>Results &amp; Artifacts</h2>
            <p className="section-subtitle">All outputs generated during the analysis run</p>
          </div>

          <div className="result-layout artifacts-layout">
            <Card className="analysis-files-card">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="analysis-files-title"><Files className="h-4 w-4" /> Analysis Files</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <div className="analysis-files-list">
                  {reportDisplayItems.map((item) => (
                    <button
                      key={item.file}
                      type="button"
                      className={`analysis-file-item ${item.file === selectedReport ? "active" : ""}`}
                      onClick={() => setSelectedReport(item.file)}
                    >
                      <div className="analysis-file-name">{item.file}</div>
                      <div className="analysis-file-owner">{item.owner}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="analysis-preview-card">
              <CardHeader className="analysis-preview-head">
                <CardTitle className="analysis-preview-title">{selectedReport || "No report selected"}</CardTitle>
                {selectedReport && (
                  <a className="download-link" href={`/api/jobs/${jobId}/reports/${selectedReport}`} download>
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                )}
              </CardHeader>
              <CardContent className="analysis-preview-body markdown-card">
                {busy && !reportContent ? <Skeleton className="h-32 w-full" /> : <ReportMarkdown content={reportContent} emptyText="No report selected." />}
              </CardContent>
            </Card>
          </div>

          <div className="artifact-subsection">
            <h3><ImageIcon className="h-4 w-4" /> Generated Charts</h3>
            <div className="artifact-grid charts-grid">
              {imageFiles.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`chart-card ${selectedImage === name ? "active" : ""}`}
                  onClick={() => setSelectedImage(name)}
                >
                  <div className="chart-thumb">
                    <img src={`/api/jobs/${jobId}/artifacts/${name}`} alt={name} />
                  </div>
                  <div className="chart-name">{name}</div>
                </button>
              ))}
              {imageFiles.length === 0 && <p className="empty-note">No generated charts yet.</p>}
            </div>
          </div>

          <div className="artifact-subsection">
            <h3><FileSpreadsheet className="h-4 w-4" /> Data Files</h3>
            <div className="artifact-grid data-grid">
              {csvFiles.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`data-card ${selectedCsv === name ? "active" : ""}`}
                  onClick={() => setSelectedCsv(name)}
                >
                  <div className="data-name">{name}</div>
                  <div className="data-meta">{selectedCsv === name && csvRows.length > 0 ? `${csvRows.length} rows` : "Click to preview"}</div>
                </button>
              ))}
              {csvFiles.length === 0 && <p className="empty-note">No data files yet.</p>}
            </div>
            {selectedCsv && (
              <article className="result-view csv-view data-preview">
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
                  <p>No CSV preview available.</p>
                )}
              </article>
            )}
          </div>
        </section>

        <section className="block reports-block">
          <div className="block-head">
            <h2>Reports</h2>
            <p className="section-subtitle">Comprehensive analysis reports from the agent team</p>
          </div>

          <div className="result-layout reports-layout">
            <Card className="report-index-card">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="analysis-files-title">Report Index</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <div className="analysis-files-list">
                  {reportHubItems.map((item) => (
                    <button
                      key={item.file}
                      type="button"
                      className={`report-index-item ${item.file === reportHubCurrent ? "active" : ""}`}
                      onClick={() => setSelectedArchiveMd(item.file)}
                    >
                      <div className="report-index-title">{item.title}</div>
                      <div className="report-index-owner">{item.owner}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="report-preview-card">
              <CardHeader className="analysis-preview-head">
                <CardTitle className="report-preview-title">
                  {reportHubCurrentMeta?.title || "Report Preview"}
                  <Badge variant="outline" className="report-owner-badge">
                    {reportHubCurrentMeta?.owner || "Agent Team"}
                  </Badge>
                </CardTitle>
                {reportHubDownloadHref && (
                  <a className="download-link" href={reportHubDownloadHref} download>
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                )}
              </CardHeader>
              <CardContent className="analysis-preview-body markdown-card">
                <ReportMarkdown content={reportHubContent} emptyText="No report selected." />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="page-footer">
        <div className="footer-brand"><Bot className="h-5 w-5" /> Trading Agent</div>
        <p>Multi-agent AI trading analysis platform. For educational and research purposes only.</p>
        <div className="footer-links">
          <a href="#" onClick={(e) => e.preventDefault()}><Github className="h-4 w-4" /> Source Code</a>
          <a href="#" onClick={(e) => e.preventDefault()}><BookOpenText className="h-4 w-4" /> Documentation</a>
        </div>
        <div className="footer-risk"><ShieldCheck className="h-4 w-4" /> Not financial advice. Past performance does not guarantee future results.</div>
      </footer>
    </div>
  );
}

export default AnalyzeWorkspace;
























