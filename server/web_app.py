import json
import time
from pathlib import Path
from typing import Generator, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, StreamingResponse

from server.job_manager import job_manager
from server.schemas import JobCreateRequest, JobCreateResponse, JobStatusResponse


app = FastAPI(title="TradingAgents Web API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _report_dir(job_id: str) -> Path:
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    trade_date = job.payload.end_date or job.payload.analysis_date
    return _project_root() / "results" / job.payload.ticker.upper() / str(trade_date) / "reports"


def _resolve_archive_root(job_id: str) -> Path | None:
    """Resolve archive root with a filesystem fallback.

    Primary source is in-memory job.archive_dir. If missing (e.g. process reload),
    fallback to newest reports bundle under ./reports/<TICKER>_<timestamp>.
    """
    job = job_manager.get_job(job_id)
    if job is None:
        return None

    if job.archive_dir:
        p = Path(job.archive_dir)
        if p.exists() and p.is_dir():
            return p

    ticker = job.payload.ticker.upper()
    archive_base = _project_root() / "reports"
    if not archive_base.exists():
        return None

    candidates = [p for p in archive_base.glob(f"{ticker}_*") if p.is_dir()]
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def _list_output_files(report_dir: Path) -> tuple[list[str], list[str]]:
    """Recursively collect markdown and artifact files under report_dir."""
    reports: list[str] = []
    artifacts: list[str] = []
    if not report_dir.exists():
        return reports, artifacts

    for p in sorted(report_dir.rglob("*")):
        if not p.is_file():
            continue
        rel = str(p.relative_to(report_dir)).replace("\\", "/")
        suffix = p.suffix.lower()
        if suffix == ".md":
            reports.append(rel)
        elif suffix in {".png", ".csv"}:
            artifacts.append(rel)
    return reports, artifacts


@app.get("/api/health")
def health() -> JSONResponse:
    return JSONResponse({"ok": True})


@app.post("/api/jobs", response_model=JobCreateResponse)
def create_job(payload: JobCreateRequest) -> JobCreateResponse:
    record = job_manager.create_job(payload)
    return JobCreateResponse(job_id=record.job_id, status=record.status)


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str) -> JobStatusResponse:
    record = job_manager.get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")
    report_dir = _report_dir(job_id)
    fs_reports, fs_artifacts = _list_output_files(report_dir)
    archive_root = _resolve_archive_root(job_id)
    archive_files = (
        sorted([str(p.relative_to(archive_root)).replace("\\", "/") for p in archive_root.rglob("*") if p.is_file()])
        if archive_root
        else []
    )

    merged_reports = sorted(set(record.reports) | set(fs_reports))
    merged_artifacts = sorted(set(record.artifacts) | set(fs_artifacts))
    merged_archive_files = sorted(set(record.archive_files) | set(archive_files))

    return JobStatusResponse(
        job_id=record.job_id,
        status=record.status,
        ticker=record.payload.ticker.upper(),
        analysis_date=record.payload.analysis_date,
        created_at=record.created_at,
        updated_at=record.updated_at,
        error=record.error,
        reports=merged_reports,
        artifacts=merged_artifacts,
        archive_dir=str(archive_root) if archive_root else record.archive_dir,
        archive_files=merged_archive_files,
        llm_calls=record.llm_calls,
        tool_calls=record.tool_calls,
        tokens_in=record.tokens_in,
        tokens_out=record.tokens_out,
    )


@app.get("/api/jobs/{job_id}/reports")
def list_reports(job_id: str) -> JSONResponse:
    report_dir = _report_dir(job_id)
    reports, _ = _list_output_files(report_dir)
    return JSONResponse({"reports": reports})


@app.get("/api/jobs/{job_id}/reports/{report_name}")
def get_report(job_id: str, report_name: str) -> PlainTextResponse:
    if "/" in report_name or "\\" in report_name:
        raise HTTPException(status_code=400, detail="Invalid report name")
    report_dir = _report_dir(job_id)
    report_path = report_dir / report_name
    if not report_path.exists() or report_path.suffix.lower() != ".md" or not report_path.is_file():
        raise HTTPException(status_code=404, detail="Report not found")
    return PlainTextResponse(report_path.read_text(encoding="utf-8"))


@app.get("/api/jobs/{job_id}/artifacts")
def list_artifacts(job_id: str) -> JSONResponse:
    report_dir = _report_dir(job_id)
    _, artifacts = _list_output_files(report_dir)
    return JSONResponse({"artifacts": artifacts})


@app.get("/api/jobs/{job_id}/artifacts/{artifact_name}")
def get_artifact(job_id: str, artifact_name: str):
    if "/" in artifact_name or "\\" in artifact_name:
        raise HTTPException(status_code=400, detail="Invalid artifact name")
    report_dir = _report_dir(job_id)
    artifact_path = report_dir / artifact_name
    if not artifact_path.exists() or artifact_path.suffix.lower() not in {".png", ".csv"} or not artifact_path.is_file():
        # Fallback: find by file name recursively for compatibility with older UI payloads.
        matches = [p for p in report_dir.rglob(artifact_name) if p.is_file() and p.suffix.lower() in {".png", ".csv"}]
        if not matches:
            raise HTTPException(status_code=404, detail="Artifact not found")
        artifact_path = matches[0]
    media_type = "image/png" if artifact_path.suffix.lower() == ".png" else "text/csv"
    return FileResponse(path=artifact_path, media_type=media_type, filename=artifact_path.name)


@app.get("/api/jobs/{job_id}/archive")
def list_archive(job_id: str) -> JSONResponse:
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    archive_root = _resolve_archive_root(job_id)
    files = (
        sorted([str(p.relative_to(archive_root)).replace("\\", "/") for p in archive_root.rglob("*") if p.is_file()])
        if archive_root
        else job.archive_files
    )
    return JSONResponse(
        {
            "archive_dir": str(archive_root) if archive_root else job.archive_dir,
            "files": files,
        }
    )


@app.get("/api/jobs/{job_id}/archive/{file_path:path}")
def get_archive_file(job_id: str, file_path: str):
    if job_manager.get_job(job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")
    archive_root = _resolve_archive_root(job_id)
    if archive_root is None:
        raise HTTPException(status_code=404, detail="Archive not found")

    target = (archive_root / file_path).resolve()
    if archive_root.resolve() not in target.parents and archive_root.resolve() != target:
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    suffix = target.suffix.lower()
    if suffix == ".md":
        return PlainTextResponse(target.read_text(encoding="utf-8"))
    if suffix == ".csv":
        return FileResponse(path=target, media_type="text/csv", filename=target.name)
    if suffix == ".png":
        return FileResponse(path=target, media_type="image/png", filename=target.name)
    return FileResponse(path=target, filename=target.name)


def _format_sse(event_type: str, data: dict, event_id: int) -> str:
    return f"id: {event_id}\nevent: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/api/jobs/{job_id}/stream")
def stream_job_events(
    job_id: str,
    after_seq: int = Query(default=0, ge=0),
):
    record = job_manager.get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")

    def event_generator() -> Generator[str, None, None]:
        cursor = after_seq
        heartbeat_at = time.time()
        while True:
            events = job_manager.list_events_since(job_id, cursor)
            for event in events:
                cursor = event["seq"]
                yield _format_sse(event["type"], event, event["seq"])

            rec = job_manager.get_job(job_id)
            if rec is None:
                break
            if rec.status in {"succeeded", "failed", "cancelled"} and not job_manager.list_events_since(job_id, cursor):
                break

            if time.time() - heartbeat_at > 10:
                heartbeat_at = time.time()
                yield ": heartbeat\n\n"
            time.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
