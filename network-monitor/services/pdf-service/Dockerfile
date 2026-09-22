FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip "setuptools>=84.0.0" "wheel>=0.48.0" "msgpack>=1.2.2" "jaraco.context>=6.1.2" \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --upgrade "setuptools>=84.0.0" "wheel>=0.48.0" "msgpack>=1.2.2" "jaraco.context>=6.1.2" \
    && rm -rf /usr/local/lib/python3.11/ensurepip \
    && (find / -name "*setuptools*70*" -exec rm -rf {} + 2>/dev/null || true) \
    && (find / -name "*msgpack*1.1*" -exec rm -rf {} + 2>/dev/null || true)

# Create storage directories and non-root app user
RUN mkdir -p /storage/pdf-temp /storage/pdf-output \
    && groupadd -r appuser && useradd -r -g appuser -d /app appuser \
    && chown -R appuser:appuser /storage /app

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
