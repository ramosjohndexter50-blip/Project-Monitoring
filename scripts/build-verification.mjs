// Build only the isolated verification target, with synthetic local credentials.
import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55440",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
      SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
      APP_ORIGIN: "http://localhost:3101",
      NEXT_BUILD_DIR: ".next-verification",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("exit", (code) => process.exit(code ?? 0));
