export type JobStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type Analyst = "market" | "social" | "news" | "fundamentals" | "quant";
export type Master = "buffett" | "larry_williams" | "livermore";
export type Provider = "openai" | "openai-codex" | "anthropic" | "google" | "xai" | "openrouter" | "ollama";

export type JobEvent = {
  seq: number;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
};

export type JobCreateRequest = {
  ticker: string;
  analysis_date: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  analysts: Analyst[];
  selected_masters: Master[];
  llm_provider: Provider;
  backend_url: string;
  quick_think_llm: string;
  deep_think_llm: string;
  max_debate_rounds: number;
  max_risk_discuss_rounds: number;
};

export type JobCreateResponse = {
  job_id: string;
  status: JobStatus;
};

export type JobResponse = {
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
