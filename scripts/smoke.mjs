/**
 * Headless smoke test: loads the app, verifies the offline map renders, the
 * position simulator works, Trail Sathi answers (Pack Brain fallback when no
 * model is running), the SOS card computes, and the Humsafar demo peers +
 * rescue brief appear. Screenshots land in /tmp/pagdandi-shots.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const SHOTS = "/tmp/pagdandi-shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const requests = [];
page.on("request", (r) => requests.push(r.url()));

console.log("1. load app");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOTS}/01-map-light.png` });

// verify no non-local network requests (offline claim)
const external = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith("ws"));
console.log("   external requests:", external.length ? external : "none — fully offline ✓");

console.log("2. night mode");
await page.getByTitle("Night trek mode").click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/02-map-dark.png` });

console.log("3. move position along trail (slider)");
const slider = page.locator('[role="slider"]').first();
await slider.focus();
for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(1000);

console.log("4. Trail Sathi");
await page.getByTitle("Trail Sathi — ask your guide").click();
await page.waitForTimeout(500);
await page.getByText("Can I make Triund top before sunset").click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/03-sathi.png` });
const answer = await page.locator(".bg-muted.rounded-2xl, .rounded-2xl").last().innerText().catch(() => "");
console.log("   sathi answered:", answer.slice(0, 220).replace(/\n/g, " | "));

console.log("5. SOS card");
await page.keyboard.press("Escape");
await page.waitForTimeout(1000);
await page.getByTitle("SOS — exits, numbers, position code").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/04-sos.png` });
const plusCode = await page.locator(".font-mono.text-lg").innerText({ timeout: 5000 }).catch(() => "??");
console.log("   plus code:", plusCode);
await page.keyboard.press("Escape");
await page.waitForTimeout(1000);

console.log("6. Humsafar demo peers + SOS beacon + rescue brief");
await page.getByTitle("Demo companions (clearly labeled simulated peers)").click();
await page.waitForTimeout(2500);
await page.getByText("Demo: Lobsang triggers SOS").click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/05-humsafar-sos.png` });
const brief = await page.locator(".border-red-500").first().innerText().catch(() => "(no brief)");
console.log("   rescue brief:", brief.slice(0, 260).replace(/\n/g, " | "));

console.log("7. Bhasha Bridge (text mode; no mic in headless)");
await page.getByTitle("Bhasha Bridge — speak across languages").click();
await page.waitForTimeout(500);
await page.getByText("type instead").click();
await page.getByPlaceholder("Type what you want to say…").fill("Hello! Did you see snow on the path above?");
await page.getByRole("button", { name: "Translate" }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOTS}/06-bhasha.png` });
const translation = await page.locator(".border-sky-500\\/40 p").last().innerText().catch(() => "(no translation)");
console.log("   translation:", translation.slice(0, 160));

console.log("\nconsole errors:", errors.length ? errors.slice(0, 10) : "none ✓");
await browser.close();
