FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip "setuptools>=84.0.0" "wheel>=0.48.0" \
    && pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y pip setuptools wheel \
    && rm -rf /usr/local/lib/python3.11/site-packages/pip* /usr/local/bin/pip* \
    && rm -rf /usr/local/lib/python3.11/ensurepip /usr/lib/python3/dist-packages/* \
    && rm -rf /root/.cache /tmp/* \
    && (find /usr/local/lib/python3.11/site-packages -type d -name "sboms" -exec rm -rf {} + 2>/dev/null || true)

# Create storage directories and non-root app user
RUN mkdir -p /storage/pdf-temp /storage/pdf-output \
    && groupadd -r appuser && useradd -r -g appuser -d /app appuser \
    && chown -R appuser:appuser /storage /app

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
