import type { Analyst, Master, Provider } from "../../types/api";

export type ProcessStage = "analysts" | "research" | "trader" | "risk" | "final";
export type ResultTab = "reports" | "images" | "csv";
export type ArchiveTab = "md" | "images" | "csv";

export type FormState = {
  ticker: string;
  timeframe: string;
  range_preset: "1M" | "3M" | "6M" | "1Y" | "YTD" | "Custom";
  start_date: string;
  end_date: string;
  analysts: Analyst[];
  selected_masters: Master[];
  llm_provider: Provider;
  quick_think_llm: string;
  deep_think_llm: string;
  research_depth: 1 | 3 | 5;
};

export type ProcessItem = {
  seq: number;
  time: string;
  stage: ProcessStage;
  agent: string;
  kind: "message" | "tool" | "status" | "report" | "event";
  content: string;
};

export type AgentStatus = "pending" | "in_progress" | "completed";

export type AgentStateItem = {
  agent: string;
  status: AgentStatus;
};

export type RunSummary = {
  ticker: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  analysts: Analyst[];
  selected_masters: Master[];
  llm_provider: Provider;
  quick_think_llm: string;
  deep_think_llm: string;
  research_depth: 1 | 3 | 5;
};
