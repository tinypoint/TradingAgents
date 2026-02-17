import json
import os
from pathlib import Path
from typing import Any, Optional, Tuple

from .base_client import BaseLLMClient
from .openai_client import UnifiedChatOpenAI
from .validators import validate_model


def _flatten_content(content: Any) -> str:
    """Convert structured model content blocks into plain text."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        text = content.get("text")
        if isinstance(text, str):
            return text
        nested = content.get("content")
        if nested is not None:
            return _flatten_content(nested)
        return str(content)
    if isinstance(content, list):
        parts = [_flatten_content(item) for item in content]
        return "\n".join([p for p in parts if p])
    return str(content)


def _normalize_message_content(message: Any) -> Any:
    """Normalize message.content to string when possible."""
    if message is None or not hasattr(message, "content"):
        return message
    flattened = _flatten_content(getattr(message, "content", ""))
    try:
        message.content = flattened
        return message
    except Exception:
        # Some message objects may be immutable.
        pass
    try:
        return message.model_copy(update={"content": flattened})
    except Exception:
        return message


class CodexUnifiedChatOpenAI(UnifiedChatOpenAI):
    """Runnable-compatible ChatOpenAI that flattens Codex structured content."""

    def invoke(self, *args, **kwargs):
        result = super().invoke(*args, **kwargs)
        return _normalize_message_content(result)

    async def ainvoke(self, *args, **kwargs):
        result = await super().ainvoke(*args, **kwargs)
        return _normalize_message_content(result)

    def stream(self, *args, **kwargs):
        for chunk in super().stream(*args, **kwargs):
            yield _normalize_message_content(chunk)

    async def astream(self, *args, **kwargs):
        async for chunk in super().astream(*args, **kwargs):
            yield _normalize_message_content(chunk)


class OpenAICodexClient(BaseLLMClient):
    """Dedicated client for OpenAI Codex OAuth authentication."""

    def __init__(
        self,
        model: str,
        base_url: Optional[str] = None,
        provider: str = "openai-codex",
        **kwargs,
    ):
        super().__init__(model, base_url, **kwargs)
        self.provider = provider.lower()
        if self.provider != "openai-codex":
            raise ValueError("OpenAICodexClient only supports provider='openai-codex'.")

    def get_llm(self) -> Any:
        if "api_key" in self.kwargs:
            raise ValueError(
                "Do not pass api_key when provider='openai-codex'. "
                "Use CODEX_HOME/auth.json (tokens.access_token) instead."
            )

        api_key, account_id = self._read_codex_credentials()
        if not api_key:
            raise ValueError(
                "OpenAI-Codex requires CODEX_HOME/auth.json with tokens.access_token."
            )

        required_extra_body = {
            "instructions": os.environ.get(
                "OPENAI_CODEX_INSTRUCTIONS",
                "You are a helpful trading analysis assistant.",
            ),
            "store": False,
        }
        required_headers = {
            "origin": "https://chatgpt.com",
            "referer": "https://chatgpt.com/",
        }

        llm_kwargs = {
            "model": self.model,
            "base_url": "https://chatgpt.com/backend-api/codex",
            "api_key": api_key,
            "streaming": True,
            "extra_body": required_extra_body,
            "default_headers": required_headers,
        }
        if account_id:
            llm_kwargs["default_headers"]["chatgpt-account-id"] = account_id

        for key in ("timeout", "max_retries", "reasoning_effort", "callbacks"):
            if key in self.kwargs:
                llm_kwargs[key] = self.kwargs[key]

        # Merge caller-provided payload/headers but keep Codex-required fields.
        if isinstance(self.kwargs.get("extra_body"), dict):
            merged_extra_body = {**required_extra_body, **self.kwargs["extra_body"]}
            merged_extra_body["instructions"] = required_extra_body["instructions"]
            llm_kwargs["extra_body"] = merged_extra_body

        if isinstance(self.kwargs.get("default_headers"), dict):
            merged_headers = {**required_headers, **self.kwargs["default_headers"]}
            llm_kwargs["default_headers"] = merged_headers

        # Codex backend requires streaming=true.
        llm_kwargs["streaming"] = True

        return CodexUnifiedChatOpenAI(**llm_kwargs)

    def validate_model(self) -> bool:
        return validate_model(self.provider, self.model)

    @staticmethod
    def _read_codex_credentials() -> Tuple[Optional[str], Optional[str]]:
        """Read Codex OAuth credentials from CODEX_HOME/auth.json (or ~/.codex/auth.json)."""
        auth_file = os.environ.get("CODEX_AUTH_FILE")
        auth_path: Optional[Path] = None
        if auth_file:
            candidate = Path(auth_file).expanduser()
            if candidate.exists():
                auth_path = candidate

        if auth_path is None:
            codex_home = os.environ.get("CODEX_HOME", "~/.codex")
            auth_path = Path(codex_home).expanduser() / "auth.json"
        if not auth_path.exists():
            return None, None

        try:
            raw = json.loads(auth_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None, None

        tokens = raw.get("tokens", {})
        if not isinstance(tokens, dict):
            return None, None

        access_token = tokens.get("access_token")
        account_id = tokens.get("account_id")
        if isinstance(access_token, str) and access_token.strip():
            normalized_account_id = (
                account_id.strip()
                if isinstance(account_id, str) and account_id.strip()
                else None
            )
            return access_token.strip(), normalized_account_id
        return None, None
