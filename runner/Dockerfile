# Orvella runner: satu-satunya layanan yang memegang docker socket.
# Hanya menjalankan image orvella-sbx-* dan hanya menyentuh container berlabel orvella.sandbox=1.
# Build context = root repo (lihat docker-compose.yml) supaya harness JS lama ikut tersalin.
FROM python:3.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv
COPY runner/requirements.txt ./
RUN pip install -r requirements.txt
COPY runner/orv_runner ./orv_runner
COPY runner/helpers ./helpers
COPY runner/tests ./tests
COPY backend/runner/sandbox.mjs ./helpers/sandbox.mjs
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2)"
CMD ["uvicorn", "orv_runner.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
