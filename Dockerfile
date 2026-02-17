FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

# Minimal system packages for common Python wheels/builds used by dependencies.
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ \
    && pip install -r /app/requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ \
    --extra-index-url https://pypi.org/simple

COPY . /app

# Ensure Codex auth mount target parent exists.
RUN mkdir -p /root/.codex

# Default entrypoint runs the package demo script.
# You can override at runtime, e.g.:
#   docker run --rm -it --env-file .env tradingagents-local python -m cli.main
CMD ["sleep", "9999999999999999"]
