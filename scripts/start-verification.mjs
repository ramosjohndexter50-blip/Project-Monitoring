// Starts only the isolated verification build, using local fixture credentials.
import { spawn } from "node:child_process";
const processEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55440",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
  APP_ORIGIN: "http://localhost:3101",
  NEXT_BUILD_DIR: ".next-verification",
};
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--port",
    "3101",
    "--hostname",
    "127.0.0.1",
  ],
  { env: processEnv, stdio: "inherit", windowsHide: true },
);
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill());
