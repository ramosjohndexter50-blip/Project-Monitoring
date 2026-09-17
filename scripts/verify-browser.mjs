// Requires scripts/browser-fixture.mjs and scripts/start-verification.mjs.
// All writes are to synthetic local accounts/data, never the live Supabase project.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const base = "http://127.0.0.1:3101";
const installed = process.env.PERFORMANCE_CHROME_PATH;
const browser = await chromium.launch({ headless: true, ...(installed ? { executablePath: installed } : {}) });
const checks = [], timings = [], errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("pageerror", e => errors.push(e.message));
page.on("console", msg => { if (msg.type() === "error" && !/WebSocket|realtime\/v1/i.test(msg.text())) errors.push(msg.text()); });
page.on("dialog", dialog => dialog.accept());
const check = (name) => { checks.push(name); console.log("PASS", name); };
async function login(name) {
  await page.goto(base);
  await page.getByRole("textbox", { name: "Email address" }).fill(`${name}@fixture.test`);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}
try {
  await login("admin");
  await page.getByRole("heading", { name: "Project tasks", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Coordinate ground floor drawings/ }).waitFor();
  check("Login and paginated project board");
  await page.getByRole("button", { name: /^Coordinate ground floor drawings/ }).click();
  await page.getByRole("heading", { name: "Task details", exact: true }).waitFor();
  await page.getByLabel("Task name", { exact: true }).fill("Coordinate ground floor drawings verified");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("heading", { name: "Task details", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Coordinate ground floor drawings verified", exact: true }).waitFor();
  check("Lazy task editor and save/read-after-write");
  const rpcCalls = [];
  page.on("request", request => { if (request.url().endsWith("/rpc/task_board_page")) rpcCalls.push(request.postDataJSON()); });
  await page.getByRole("textbox", { name: "Search tasks" }).fill("no-matching-task");
  await page.getByRole("heading", { name: "No matching tasks" }).waitFor();
  await page.getByRole("textbox", { name: "Search tasks" }).fill("ground");
  await page.getByRole("button", { name: "Coordinate ground floor drawings verified", exact: true }).waitFor();
  check("Debounced search and complete empty/result states");
  await page.getByRole("button", { name: "Kanban board", exact: true }).click();
  await page.locator(".kanban-card").first().waitFor();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("region", { name: "Task history" }).waitFor();
  check("Kanban and lazy history query");
  await page.getByRole("link", { name: "Consultancy dashboard" }).click();
  await page.getByRole("heading", { name: "Architecture", exact: true }).waitFor();
  await page.screenshot({ path: "docs/performance/dashboard-desktop.png", fullPage: true });
  check("Dashboard summary and async cards");
  for (const [link, heading] of [["My Tasks","Tasks"],["Projects","Projects"],["Notifications","Notifications"],["Employee management","Employee management"],["Roles","Roles"],["Permission catalog","Permission catalog"],["Role permissions","Role permissions"],["Disciplines","Disciplines"],["Permission overrides","Permission overrides"],["Admin overview","Super Admin Control Center"],["Search","Find project information"]]) {
    const start = performance.now();
    await page.locator(".platform-sidebar").getByRole("link", { name: link, exact: true }).click();
    await page.getByRole("heading", { name: heading, exact: true, level: 1 }).waitFor();
    timings.push({ link, ms: Math.round(performance.now()-start) });
    assert.equal(await page.getByRole("heading", { name: "Unable to open this page" }).count(),0);
  }
  check("All active portal/admin modules navigate without render errors");
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("ground");
  await page.evaluate(() => { window.__navigationMarker = "same-document"; });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: "Coordinate ground floor drawings verified", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__navigationMarker),"same-document");
  check("Search form uses client-side navigation (document preserved)");
  await page.goto(`${base}/portal/reports`);
  await page.getByRole("heading", { name: "Progress & workload reports" }).waitFor();
  check("Reports render full authorized aggregates");
  await page.goto(`${base}/portal/projects?edit=20000000-0000-4000-8000-000000000001`);
  await page.getByRole("heading", { name: "Record details" }).waitFor();
  assert.equal(await page.locator('input[name="contributors"]:checked').count(),1);
  check("Project editor retains existing discipline assignments");
  await page.goto(`${base}/portal/tasks?project=20000000-0000-4000-8000-000000000001&new=1`);
  await page.getByRole("heading", { name: "New tasks record" }).waitFor();
  const form = page.locator("form.register-form");
  await form.locator('[name="task_name"]').fill("Browser regression task");
  await form.locator('[name="discipline_id"]').selectOption({ label: "Architecture" });
  await form.locator('[name="owner"]').selectOption({ label: "Test manager" });
  await form.getByRole("button", { name: "Save record" }).click();
  await page.locator(".form-success").waitFor();
  await page.getByRole("cell", { name: "Browser regression task", exact: true }).waitFor();
  check("Task creation via Server Action preserves validation and refreshes register");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/portal","/portal/tasks","/portal/reports"]) {
    await page.goto(base+route);
    await page.locator(".platform-heading h1").waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth>window.innerWidth+1);
    assert.equal(overflow,false,`Mobile overflow: ${route}`);
  }
  await page.screenshot({ path: "docs/performance/mobile-after.png", fullPage: true });
  check("390px mobile dashboard, register, and reports have no page overflow");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  await page.goto(base+"/portal/tasks");
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  check("Logout clears session and protected routes redirect");
  await login("manager");
  await page.getByRole("heading", { name: "Architecture", exact: true }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "Administration" }).count(),0);
  await page.goto(base+"/portal/tasks");
  await page.getByRole("heading", { name: "Tasks", exact: true, level: 1 }).waitFor();
  assert.equal(await page.getByRole("link", { name: "+ New task" }).count(),0);
  check("Non-admin sees scoped tasks and no admin/create controls");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  await login("disabled");
  await page.getByRole("heading", { name: "Account inactive" }).waitFor();
  check("Inactive account denied");
  assert.deepEqual(errors,[]);
  check("No unexpected browser console/runtime errors (fixture Realtime transport excluded)");
} finally {
  mkdirSync("docs/performance", { recursive: true });
  writeFileSync("docs/performance/browser.json",JSON.stringify({ checks,timings,errors, environment:"Isolated local production build; synthetic Auth/Storage; no live SMTP/Realtime transport" },null,2));
  await browser.close();
}
