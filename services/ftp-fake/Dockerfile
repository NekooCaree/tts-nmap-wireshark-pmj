FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && mkdir -p /data/ftp && chown -R 10001:10001 /data
COPY server.py .
EXPOSE 21 30000-30009
CMD ["python", "server.py"]
