# AWS Public ECR mirrors Docker Hub `library/*` with no anonymous rate limit —
# avoids the "toomanyrequests" error you'd otherwise hit on shared-IP VPS.
FROM public.ecr.aws/docker/library/python:3.12-slim

# psycopg2-binary needs libpq + a compiler-free runtime. Slim images don't
# include curl by default — useful for the healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl libpq5 \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Copy requirements first so the layer caches when only source files change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-create the local uploads dir so the volume mount inherits the right
# ownership. In prod with S3 this stays empty.
RUN mkdir -p /app/uploads

EXPOSE 8000

# `--proxy-headers` makes uvicorn trust X-Forwarded-* from nginx so the
# rate-limiter sees real client IPs, not the proxy's.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips=*"]
