import json
import threading
import time
import uuid
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_core.messages import BaseMessage

from server.schemas import JobCreateRequest
from cli.stats_handler import StatsCallbackHandler
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph


REPORT_FILES = {
    "market_report": "market_report.md",
    "sentiment_report": "sentiment_report.md",
    "news_report": "news_report.md",
    "fundamentals_report": "fundamentals_report.md",
    "quant_report": "quant_report.md",
    "investment_plan": "investment_plan.md",
    "trader_investment_plan": "trader_investment_plan.md",
    "final_trade_decision": "final_trade_decision.md",
}


def _now() -> float:
    return time.time()


def _message_to_text(message: Any) -> str:
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
                else:
                    parts.append(str(item))
            else:
                parts.append(str(item))
        return "\n".join([p for p in parts if p]).strip()
    if isinstance(content, dict):
        text = content.get("text")
        if isinstance(text, str):
            return text
        return str(content)
    return str(content)


def _coerce_text(value: Any) -> str:
    """Best-effort conversion of structured content into plain text."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [_coerce_text(item) for item in value]
        return "\n".join([p for p in parts if p]).strip()
    if isinstance(value, dict):
        text = value.get("text")
        if isinstance(text, str):
            return text
        content = value.get("content")
        if content is not None:
            return _coerce_text(content)
        return json.dumps(value, ensure_ascii=False)
    return str(value)


@dataclass
class JobRecord:
    job_id: str
    payload: JobCreateRequest
    status: str = "queued"
    created_at: float = field(default_factory=_now)
    updated_at: float = field(default_factory=_now)
    error: Optional[str] = None
    reports: List[str] = field(default_factory=list)
    artifacts: List[str] = field(default_factory=list)
    archive_dir: Optional[str] = None
    archive_files: List[str] = field(default_factory=list)
    llm_calls: int = 0
    tool_calls: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    events: List[Dict[str, Any]] = field(default_factory=list)
    event_seq: int = 0

    def append_event(self, event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        self.event_seq += 1
        payload = {
            "seq": self.event_seq,
            "type": event_type,
            "timestamp": _now(),
            "data": data,
        }
        self.events.append(payload)
        self.updated_at = _now()
        return payload


class JobManager:
    def __init__(self, max_workers: int = 2):
        self._jobs: Dict[str, JobRecord] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="ta-web")

    def create_job(self, payload: JobCreateRequest) -> JobRecord:
        job_id = uuid.uuid4().hex
        record = JobRecord(job_id=job_id, payload=payload)
        record.append_event("status", {"status": "queued"})
        with self._lock:
            self._jobs[job_id] = record
        self._executor.submit(self._run_job, job_id)
        return record

    def get_job(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_events_since(self, job_id: str, after_seq: int) -> List[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return []
            return [e for e in job.events if e["seq"] > after_seq]

    def _update_status(self, record: JobRecord, status: str, error: Optional[str] = None) -> None:
        record.status = status
        if error:
            record.error = error
        record.updated_at = _now()
        payload: Dict[str, Any] = {"status": status}
        if error:
            payload["error"] = error
        record.append_event("status", payload)

    def _run_job(self, job_id: str) -> None:
        record = self.get_job(job_id)
        if record is None:
            return

        try:
            self._update_status(record, "running")
            payload = record.payload
            stats_handler = StatsCallbackHandler()
            config = DEFAULT_CONFIG.copy()
            config["llm_provider"] = payload.llm_provider
            config["max_debate_rounds"] = payload.max_debate_rounds
            config["max_risk_discuss_rounds"] = payload.max_risk_discuss_rounds
            if payload.backend_url:
                config["backend_url"] = payload.backend_url
            if payload.quick_think_llm:
                config["quick_think_llm"] = payload.quick_think_llm
            if payload.deep_think_llm:
                config["deep_think_llm"] = payload.deep_think_llm

            graph = TradingAgentsGraph(
                selected_analysts=list(payload.analysts),
                debug=False,
                config=config,
                callbacks=[stats_handler],
            )
            init_state = graph.propagator.create_initial_state(
                company_name=payload.ticker.upper(),
                trade_date=payload.end_date or payload.analysis_date,
                timeframe=payload.timeframe,
                start_date=payload.start_date or "",
                end_date=payload.end_date or payload.analysis_date,
            )
            args = graph.propagator.get_graph_args(callbacks=[stats_handler])

            previous_reports: Dict[str, str] = {key: "" for key in REPORT_FILES.keys()}
            final_state: Dict[str, Any] = {}
            live_report_dir = (
                Path(__file__).resolve().parents[1]
                / "results"
                / payload.ticker.upper()
                / str(payload.end_date or payload.analysis_date)
                / "reports"
            )
            live_report_dir.mkdir(parents=True, exist_ok=True)

            for chunk in graph.graph.stream(init_state, **args):
                final_state = chunk
                stats = stats_handler.get_stats()
                record.llm_calls = int(stats.get("llm_calls", 0))
                record.tool_calls = int(stats.get("tool_calls", 0))
                record.tokens_in = int(stats.get("tokens_in", 0))
                record.tokens_out = int(stats.get("tokens_out", 0))
                messages = chunk.get("messages") or []
                if messages:
                    last_message = messages[-1]
                    if isinstance(last_message, BaseMessage):
                        text = _message_to_text(last_message)
                        if text:
                            record.append_event(
                                "message",
                                {
                                    "agent": getattr(last_message, "name", None),
                                    "content": text[-2000:],
                                },
                            )

                for report_key in REPORT_FILES.keys():
                    report_value = chunk.get(report_key)
                    if isinstance(report_value, str) and report_value.strip():
                        if previous_reports[report_key] != report_value:
                            previous_reports[report_key] = report_value
                            report_file_name = REPORT_FILES[report_key]
                            (live_report_dir / report_file_name).write_text(report_value, encoding="utf-8")
                            if report_file_name not in record.reports:
                                record.reports = sorted([*record.reports, report_file_name])
                            record.append_event(
                                "report_ready",
                                {
                                    "report_key": report_key,
                                    "length": len(report_value),
                                },
                            )

            report_dir = self._write_reports(
                ticker=payload.ticker.upper(),
                trade_date=payload.end_date or payload.analysis_date,
                final_state=final_state,
            )
            archive_dir = self._write_archive(
                ticker=payload.ticker.upper(),
                trade_date=payload.end_date or payload.analysis_date,
                final_state=final_state,
                report_dir=report_dir,
            )

            reports = []
            artifacts = []
            for path in sorted(report_dir.glob("*")):
                if path.suffix.lower() == ".md":
                    reports.append(path.name)
                elif path.suffix.lower() in {".png", ".csv"}:
                    artifacts.append(path.name)
            archive_files = sorted(
                [str(p.relative_to(archive_dir)).replace("\\", "/") for p in archive_dir.rglob("*") if p.is_file()]
            )

            record.reports = reports
            record.artifacts = artifacts
            record.archive_dir = str(archive_dir)
            record.archive_files = archive_files
            record.append_event(
                "completed",
                {
                    "report_dir": str(report_dir),
                    "reports": reports,
                    "artifacts": artifacts,
                    "archive_dir": str(archive_dir),
                    "archive_files": archive_files,
                    "llm_calls": record.llm_calls,
                    "tool_calls": record.tool_calls,
                    "tokens_in": record.tokens_in,
                    "tokens_out": record.tokens_out,
                    "decision": final_state.get("final_trade_decision", ""),
                },
            )
            self._update_status(record, "succeeded")
        except Exception as exc:
            self._update_status(record, "failed", error=str(exc))
            record.append_event("error", {"message": str(exc)})

    def _write_reports(self, ticker: str, trade_date: str, final_state: Dict[str, Any]) -> Path:
        root_dir = Path(__file__).resolve().parents[1]
        report_dir = root_dir / "results" / ticker / str(trade_date) / "reports"
        report_dir.mkdir(parents=True, exist_ok=True)

        for state_key, file_name in REPORT_FILES.items():
            content = _coerce_text(final_state.get(state_key, ""))
            if content.strip():
                (report_dir / file_name).write_text(content, encoding="utf-8")

        return report_dir

    def _write_archive(
        self,
        ticker: str,
        trade_date: str,
        final_state: Dict[str, Any],
        report_dir: Path,
    ) -> Path:
        """Persist a CLI-style report bundle under ./reports/<ticker>_<timestamp>/."""
        root_dir = Path(__file__).resolve().parents[1]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_dir = root_dir / "reports" / f"{ticker}_{timestamp}"
        archive_dir.mkdir(parents=True, exist_ok=True)

        sections: List[str] = []

        # 1) Analysts
        analysts_dir = archive_dir / "1_analysts"
        analysts_parts: List[tuple[str, str]] = []
        analyst_map = [
            ("Market Analyst", "market_report", "market.md"),
            ("Social Analyst", "sentiment_report", "sentiment.md"),
            ("News Analyst", "news_report", "news.md"),
            ("Fundamentals Analyst", "fundamentals_report", "fundamentals.md"),
            ("Quant Analyst", "quant_report", "quant.md"),
        ]
        for title, key, file_name in analyst_map:
            content = _coerce_text(final_state.get(key, ""))
            if content.strip():
                analysts_dir.mkdir(exist_ok=True)
                (analysts_dir / file_name).write_text(content, encoding="utf-8")
                analysts_parts.append((title, content))
        if analysts_parts:
            content = "\n\n".join([f"### {name}\n{text}" for name, text in analysts_parts])
            sections.append(f"## I. Analyst Team Reports\n\n{content}")

        # 2) Research
        debate_state = final_state.get("investment_debate_state", {}) or {}
        if isinstance(debate_state, dict):
            research_dir = archive_dir / "2_research"
            research_parts: List[tuple[str, str]] = []
            for title, key, file_name in [
                ("Bull Researcher", "bull_history", "bull.md"),
                ("Bear Researcher", "bear_history", "bear.md"),
                ("Research Manager", "judge_decision", "manager.md"),
            ]:
                content = _coerce_text(debate_state.get(key, ""))
                if content.strip():
                    research_dir.mkdir(exist_ok=True)
                    (research_dir / file_name).write_text(content, encoding="utf-8")
                    research_parts.append((title, content))
            if research_parts:
                content = "\n\n".join([f"### {name}\n{text}" for name, text in research_parts])
                sections.append(f"## II. Research Team Decision\n\n{content}")

        # 3) Trading
        trader_plan = _coerce_text(final_state.get("trader_investment_plan", ""))
        if trader_plan.strip():
            trading_dir = archive_dir / "3_trading"
            trading_dir.mkdir(exist_ok=True)
            (trading_dir / "trader.md").write_text(trader_plan, encoding="utf-8")
            sections.append(f"## III. Trading Team Plan\n\n### Trader\n{trader_plan}")

        # 4) Risk & 5) Portfolio
        risk_state = final_state.get("risk_debate_state", {}) or {}
        if isinstance(risk_state, dict):
            risk_dir = archive_dir / "4_risk"
            risk_parts: List[tuple[str, str]] = []
            for title, key, file_name in [
                ("Aggressive Analyst", "aggressive_history", "aggressive.md"),
                ("Conservative Analyst", "conservative_history", "conservative.md"),
                ("Neutral Analyst", "neutral_history", "neutral.md"),
            ]:
                content = _coerce_text(risk_state.get(key, ""))
                if content.strip():
                    risk_dir.mkdir(exist_ok=True)
                    (risk_dir / file_name).write_text(content, encoding="utf-8")
                    risk_parts.append((title, content))
            if risk_parts:
                content = "\n\n".join([f"### {name}\n{text}" for name, text in risk_parts])
                sections.append(f"## IV. Risk Management Team Decision\n\n{content}")

            judge = _coerce_text(risk_state.get("judge_decision", ""))
            if judge.strip():
                portfolio_dir = archive_dir / "5_portfolio"
                portfolio_dir.mkdir(exist_ok=True)
                (portfolio_dir / "decision.md").write_text(judge, encoding="utf-8")
                sections.append(f"## V. Portfolio Manager Decision\n\n### Portfolio Manager\n{judge}")

        # Include result artifacts in archive as well.
        artifacts_dir = archive_dir / "6_artifacts"
        copied = 0
        for src in report_dir.glob("*"):
            if src.suffix.lower() in {".png", ".csv"}:
                artifacts_dir.mkdir(exist_ok=True)
                dst = artifacts_dir / src.name
                dst.write_bytes(src.read_bytes())
                copied += 1
        if copied:
            sections.append("## VI. Artifacts\n\nSaved under `6_artifacts/`.")

        header = (
            f"# Trading Analysis Report: {ticker}\n\n"
            f"Trade Date: {trade_date}\n\n"
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        )
        (archive_dir / "complete_report.md").write_text(header + "\n\n".join(sections), encoding="utf-8")
        return archive_dir


job_manager = JobManager()
