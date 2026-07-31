# ── Base image: Python 3.11 slim (Debian Bookworm) ───────────────────────────
FROM python:3.11-slim

# Sane Python defaults for containers
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ── System libraries ──────────────────────────────────────────────────────────
# opencv-python-headless needs:  libgl1, libglib2.0-0, libsm6, libxext6,
#                                libxrender1, libxcb1
# onnxruntime needs:             libgomp1, libgcc-s1
# ultralytics model download:   ca-certificates (HTTPS)
# uvicorn[standard] build:      gcc (for compiled C extensions like websockets)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # OpenCV runtime deps
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libxcb1 \
    # ONNX Runtime runtime deps
    libgomp1 \
    libgcc-s1 \
    # HTTPS support for ultralytics auto-downloads
    ca-certificates \
    # Compiler needed for uvicorn[standard] C extensions
    gcc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ─────────────────────────────────────────────────────────
WORKDIR /app

# ── Install Python deps (cached layer — only rebuilds if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ─────────────────────────────────────────────────────
COPY . .

# ── Port ──────────────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Start (Railway injects $PORT at runtime) ──────────────────────────────────
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
