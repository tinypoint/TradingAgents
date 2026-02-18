from typing import List, Literal, Optional

from pydantic import BaseModel, Field


AnalystName = Literal["market", "social", "news", "fundamentals", "quant"]
MasterName = Literal["buffett", "larry_williams", "livermore"]
ProviderName = Literal[
    "openai",
    "openai-codex",
    "anthropic",
    "google",
    "xai",
    "openrouter",
    "ollama",
]


class JobCreateRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=16)
    analysis_date: str = Field(..., description="YYYY-MM-DD")
    timeframe: str = Field(default="1d")
    start_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    analysts: List[AnalystName] = Field(
        default_factory=lambda: ["market", "social", "news", "fundamentals", "quant"]
    )
    selected_masters: List[MasterName] = Field(default_factory=list)
    llm_provider: ProviderName = Field(default="openai")
    backend_url: Optional[str] = Field(default=None)
    quick_think_llm: Optional[str] = Field(default=None)
    deep_think_llm: Optional[str] = Field(default=None)
    max_debate_rounds: int = Field(default=1, ge=1, le=10)
    max_risk_discuss_rounds: int = Field(default=1, ge=1, le=10)


class JobCreateResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    ticker: str
    analysis_date: str
    created_at: float
    updated_at: float
    error: Optional[str] = None
    reports: List[str] = Field(default_factory=list)
    artifacts: List[str] = Field(default_factory=list)
    archive_dir: Optional[str] = None
    archive_files: List[str] = Field(default_factory=list)
    llm_calls: int = 0
    tool_calls: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
