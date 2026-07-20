module.exports = {
  apps: [
    {
      name: "sitepulse-ingestion",
      script: "./apps/ingestion-server/dist/server.js",
      instances: 1, // Hardcode to 1 for local testing
      exec_mode: "fork", // Use fork locally to avoid cluster path bugs
      watch: false,
      env: {
        // Changed from env_production to env
        NODE_ENV: "production",
        PORT: 3001,
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
        PORT: 3002,
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
      cwd: "./apps/fastapi-server", // <-- Add this to tell PM2 where to look
      script: "./.venv/bin/uvicorn", // <-- Relative now to cwd path
      args: "app.main:app --host 127.0.0.1 --port 8000 --workers 1",
      interpreter: "none",
      watch: false,
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
