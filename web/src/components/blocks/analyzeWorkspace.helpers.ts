import type { JobEvent } from "../../types/api";
import type { ProcessItem, ProcessStage } from "./analyzeWorkspace.types";

export function parseDate(value: string): Date {
  const [y, m, d] = value.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDateDisplay(value: string): string {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${y}/${m}/${d}`;
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
  if (source.includes("buffett") || source.includes("larry") || source.includes("livermore") || source.includes("style_report") || source.includes("style manager")) return "research";
  if (source.includes("bull") || source.includes("bear") || source.includes("research")) return "research";
  return "analysts";
}

export function normalizeAgentName(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "market") return "Market Analyst";
  if (s === "social") return "Social Analyst";
  if (s === "news") return "News Analyst";
  if (s === "fundamentals") return "Fundamentals Analyst";
  if (s === "quant") return "Quant Analyst";
  if (s === "buffett") return "Buffett Advisor";
  if (s === "larry_williams") return "Larry Williams Advisor";
  if (s === "livermore") return "Livermore Advisor";
  if (s === "style_manager") return "Style Manager";
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
  if (s.includes("buffett advisor")) return "Buffett Advisor";
  if (s.includes("larry williams advisor")) return "Larry Williams Advisor";
  if (s.includes("livermore advisor")) return "Livermore Advisor";
  if (s.includes("style manager")) return "Style Manager";
  return raw;
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
  if (source.includes("buffett")) return "Buffett Advisor";
  if (source.includes("larry")) return "Larry Williams Advisor";
  if (source.includes("livermore")) return "Livermore Advisor";
  if (source.includes("style manager") || source.includes("style_report")) return "Style Manager";
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

export function toProcessItem(event: JobEvent): ProcessItem {
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
    content: compactText(content || JSON.stringify(event.data)),
  };
}

export function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((line) => line.split(","));
}

export function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = `${Math.floor(s / 60)}`.padStart(2, "0");
  const ss = `${s % 60}`.padStart(2, "0");
  return `${mm}:${ss}`;
}
