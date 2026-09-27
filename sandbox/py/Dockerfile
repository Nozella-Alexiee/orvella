# Orvella sandbox: Python 3.13 (+ SQL lewat sqlite3, Flask, FastAPI)
FROM python:3.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 \
    PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 HOME=/tmp
RUN pip install flask fastapi "uvicorn[standard]" jinja2 pymysql python-multipart \
 && useradd -u 10001 -M -d /tmp orv && mkdir /box
WORKDIR /box
