import type { Analyst, Master, Provider } from "../../types/api";
import type { ArchiveTab, FormState, ResultTab } from "./analyzeWorkspace.types";

export const providerBackend: Record<Provider, string> = {
  "openai-codex": "https://chatgpt.com/backend-api/codex",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/",
  google: "https://generativelanguage.googleapis.com/v1",
  xai: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};

export const modelsByProvider: Record<Provider, string[]> = {
  "openai-codex": ["gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2-codex", "gpt-5.1-codex"],
  openai: ["gpt-5.2", "gpt-5-mini", "gpt-5.1", "gpt-4.1"],
  anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  google: ["gemini-2.5-flash", "gemini-3-pro-preview"],
  xai: ["grok-4-fast-reasoning", "grok-4-1-fast-reasoning"],
  openrouter: ["z-ai/glm-4.5-air:free", "nvidia/nemotron-3-nano-30b-a3b:free"],
  ollama: ["qwen3:latest", "gpt-oss:latest", "glm-4.7-flash:latest"],
};

export const resultTabs: { key: ResultTab; label: string }[] = [
  { key: "reports", label: "Reports" },
  { key: "images", label: "PNG" },
  { key: "csv", label: "CSV" },
];

export const archiveTabs: { key: ArchiveTab; label: string }[] = [
  { key: "md", label: "Markdown" },
  { key: "images", label: "PNG" },
  { key: "csv", label: "CSV" },
];

export const analystCards: Record<Analyst, { title: string; desc: string; cls: string; icon: string }> = {
  market: { title: "Market Analyst", desc: "Price action and momentum context.", cls: "market", icon: "MK" },
  social: { title: "Social Analyst", desc: "Social flow and sentiment drift.", cls: "social", icon: "SO" },
  news: { title: "News Analyst", desc: "Headlines into trade implications.", cls: "news", icon: "NW" },
  fundamentals: { title: "Fundamentals Analyst", desc: "Valuation and earnings quality.", cls: "fundamentals", icon: "FD" },
  quant: { title: "Quant Analyst", desc: "Pattern + trendline + indicator composite.", cls: "quant", icon: "QT" },
};

export const analystAgentName: Record<Analyst, string> = {
  market: "Market Analyst",
  social: "Social Analyst",
  news: "News Analyst",
  fundamentals: "Fundamentals Analyst",
  quant: "Quant Analyst",
};

export const masterCards: Record<Master, { title: string; desc: string; cls: string }> = {
  buffett: { title: "Buffett Advisor", desc: "Moat + valuation + long-term business quality lens.", cls: "master-buffett" },
  larry_williams: { title: "Larry Williams Advisor", desc: "Timing, momentum, seasonality, and tactical setup.", cls: "master-larry" },
  livermore: { title: "Livermore Advisor", desc: "Trend-following, pivots, and strict risk discipline.", cls: "master-livermore" },
};

export const masterAgentName: Record<Master, string> = {
  buffett: "Buffett Advisor",
  larry_williams: "Larry Williams Advisor",
  livermore: "Livermore Advisor",
};

export const fixedAgentOrder = [
  "Bull Researcher",
  "Bear Researcher",
  "Research Manager",
  "Trader",
  "Aggressive Analyst",
  "Neutral Analyst",
  "Conservative Analyst",
  "Portfolio Manager",
];

export const reportFileByAgent: Record<string, string> = {
  "Market Analyst": "market_report.md",
  "Social Analyst": "sentiment_report.md",
  "News Analyst": "news_report.md",
  "Fundamentals Analyst": "fundamentals_report.md",
  "Quant Analyst": "quant_report.md",
  "Buffett Advisor": "buffett_report.md",
  "Larry Williams Advisor": "larry_williams_report.md",
  "Livermore Advisor": "livermore_report.md",
  "Style Manager": "style_report.md",
  "Research Manager": "investment_plan.md",
  Trader: "trader_investment_plan.md",
  "Portfolio Manager": "final_trade_decision.md",
};

export const reportFileByKey: Record<string, string> = {
  market_report: "market_report.md",
  sentiment_report: "sentiment_report.md",
  news_report: "news_report.md",
  fundamentals_report: "fundamentals_report.md",
  quant_report: "quant_report.md",
  buffett_report: "buffett_report.md",
  larry_williams_report: "larry_williams_report.md",
  livermore_report: "livermore_report.md",
  style_report: "style_report.md",
  investment_plan: "investment_plan.md",
  trader_investment_plan: "trader_investment_plan.md",
  final_trade_decision: "final_trade_decision.md",
};

export const timeframeOptions = ["1d", "1wk", "1mo", "1h", "15m"];

export const depthCards: { value: 1 | 3 | 5; title: string; desc: string }[] = [
  { value: 1, title: "Shallow", desc: "Fast pass. Lower token/tool budget, quickest turnaround." },
  { value: 3, title: "Medium", desc: "Balanced depth and speed for most routine analysis runs." },
  { value: 5, title: "Deep", desc: "Full debate and richer reasoning. Highest latency and cost." },
];

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getRangeDates(endDate: string, preset: FormState["range_preset"]) {
  const end = new Date(`${endDate}T00:00:00`);
  const start = new Date(end);
  if (preset === "1M") start.setDate(start.getDate() - 30);
  if (preset === "3M") start.setDate(start.getDate() - 90);
  if (preset === "6M") start.setDate(start.getDate() - 180);
  if (preset === "1Y") start.setDate(start.getDate() - 365);
  if (preset === "YTD") start.setMonth(0, 1);
  return { start: formatDate(start), end: formatDate(end) };
}

const today = formatDate(new Date());
const defaultRange = getRangeDates(today, "6M");

export const defaultForm: FormState = {
  ticker: "AAPL",
  timeframe: "1d",
  range_preset: "6M",
  start_date: defaultRange.start,
  end_date: defaultRange.end,
  analysts: ["market", "social", "news", "fundamentals", "quant"],
  selected_masters: [],
  llm_provider: "openai-codex",
  quick_think_llm: "gpt-5.3-codex",
  deep_think_llm: "gpt-5.3-codex",
  research_depth: 1,
};
