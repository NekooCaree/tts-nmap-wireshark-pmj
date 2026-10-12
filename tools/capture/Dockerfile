FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends tcpdump && rm -rf /var/lib/apt/lists/*
CMD ["tcpdump", "--version"]
