FROM python:3.11-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (cache layer)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create storage directories
RUN mkdir -p storage/audio storage/transcripts

EXPOSE 5000

# Run with gunicorn — timeout 600s for long Whisper transcriptions
# Workers=1 because Whisper is not thread-safe and uses lots of RAM
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "600", "--workers", "1", "app:app"]
