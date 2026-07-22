module.exports = {
  apps: [
    {
      name: "sitepulse-ingestion",
      script: "./apps/ingestion-server/dist/server.js",
      instances: 1, // Hardcode to 1 for local testing
      exec_mode: "fork", // Use fork locally to avoid cluster path bugs
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 4001,
        OTEL_SERVICE_NAME: "ingestion-server",
        OTEL_PROMETHEUS_PORT: 9464,
      },
    },
    {
      name: "sitepulse-dashboard-server",
      script: "./apps/dashboard-server/dist/server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 4002,
        OTEL_SERVICE_NAME: "dashboard-server",
        OTEL_PROMETHEUS_PORT: 9465,
      },
    },
    {
      name: "sitepulse-worker",
      script: "./apps/worker/dist/index.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        OTEL_SERVICE_NAME: "sitepulse-worker",
        OTEL_PROMETHEUS_PORT: 9466,
      },
    },
    {
      name: "sitepulse-frontend",
      // Go up two steps from apps/frontend to hit the root node_modules JavaScript runner
      script: "../../node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "./apps/frontend",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "sitepulse-fastapi",
      cwd: "./apps/fastapi-server",
      script: "./.venv/bin/uvicorn",
      args: "app.main:app --host 127.0.0.1 --port 8000 --workers 1",
      interpreter: "none",
      watch: false,
      env: {
        OTEL_SERVICE_NAME: "ai-agent",
        OTEL_PROMETHEUS_PORT: 9467,
      },
    },
    {
      name: "sitepulse-sdk-test-server",
      script: "python3",
      args: "-m http.server 8080",
      cwd: "./sdk",
      interpreter: "none",
      watch: false,
    },
  ],
};