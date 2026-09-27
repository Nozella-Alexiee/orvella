# Orvella preview proxy: serves learners' running web projects on a separate origin
# (so their code can never read Orvella's session). No docker socket, no database.
FROM python:3.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv
COPY requirements.txt ./
RUN pip install -r requirements.txt && useradd -u 10002 -M preview
COPY proxy.py ./
USER preview
EXPOSE 8301
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8301/__orv/health', timeout=2)"
CMD ["python", "proxy.py"]
