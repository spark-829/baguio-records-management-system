// Design check: automated half of docs/design/checklist.md.
//
// Loads each page once per viewport (phone 375 and desktop 1280), runs
// axe-core (Deque's open source WCAG engine, tags WCAG 2.0 to 2.2 A/AA) and
// the house checks below, and prints one line per problem.
//
//   node scripts/design-check/check.mjs                       # public pages
//   RMS_EMAIL=records@rms-demo.test RMS_PASSWORD=... \
//     node scripts/design-check/check.mjs                     # + signed-in pages
//   options: --url <base> --only /records,/reports --out report.json
//
// Needs Playwright with Chromium (preinstalled in Claude cloud sessions;
// elsewhere: npm i -g playwright && npx playwright install chromium).
// Signing in writes the normal login and record-view audit rows. A wrong
// password counts toward the account lockout, so double-check it.
// Gentle on purpose: pages load one at a time (the live site is on
// Cloudflare's free plan). About 2 loads per page.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axeSource = require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const BASE = (arg("url") ?? process.env.RMS_URL ?? "https://baguio-rms.vicsonyaris29.workers.dev").replace(/\/$/, "");
const OUT = arg("out");
const ONLY = arg("only")?.split(",");

const PUBLIC = ["/login", "/track", "/developer", "/terms", "/privacy"];
const SIGNED_IN = ["/", "/records", "/records/new", "/reports", "/map", "/assistant", "/help", "@record", "/admin/analytics", "/boxes", "/reports/released"];
const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
];

// House rules that axe does not cover. Runs inside the page.
function houseChecks(viewportName) {
  const out = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.id || el.tagName)
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);

  // D-LAYOUT-1: no sideways scrolling (WCAG 1.4.10 Reflow)
  const sw = document.documentElement.scrollWidth;
  if (sw > window.innerWidth + 1) {
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => visible(el) && el.getBoundingClientRect().right > window.innerWidth + 1)
      .filter((el) => !el.closest(".overflow-x-auto, .overflow-auto, [data-scroll-x]"))
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")}`);
    out.push({ id: "D-LAYOUT-1", msg: `page is ${sw}px wide in a ${window.innerWidth}px window`, where: wide.join(", ") });
  }

  // D-TARGET-1: WCAG 2.5.8 Target Size (Minimum). Under 24px fails only if a
  // 24px circle on its centre touches another target (the spacing exception).
  // Links inside running text are exempt (the inline exception).
  const targets = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]")]
    .filter((el) => {
      if (!visible(el) || el.closest(".sr-only")) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false; // visually hidden (e.g. file input behind a label)
      if (el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) return false;
      if (el.tagName === "A" && el.closest("p, .prose")) return false;
      return true;
    })
    .map((el) => ({ el, r: el.getBoundingClientRect() }));
  const centre = (r) => [r.left + r.width / 2, r.top + r.height / 2];
  const distToRect = ([x, y], r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
  const under = (r) => Math.round(Math.min(r.width, r.height)) < 24;
  const crowded = targets.filter((a) => {
    if (!under(a.r)) return false;
    const c = centre(a.r);
    return targets.some((b) => b !== a && !a.el.contains(b.el) && !b.el.contains(a.el) &&
      (under(b.r) ? Math.hypot(c[0] - centre(b.r)[0], c[1] - centre(b.r)[1]) < 24 : distToRect(c, b.r) < 12));
  });
  if (crowded.length) out.push({ id: "D-TARGET-1", msg: `${crowded.length} targets under 24px and too close to another`, where: crowded.slice(0, 6).map((t) => `${label(t.el)} (${Math.round(t.r.width)}x${Math.round(t.r.height)})`).join("; ") });

  // D-TARGET-2 (house rule, phones): controls and menu links at least 44px
  // (Apple HIG 44pt, GOV.UK, Material 48dp). Table links and dense grids
  // marked data-dense-grid (a 7-column month calendar) are exempt.
  if (viewportName === "phone") {
    const small = targets.filter(({ el, r }) =>
      (el.matches("button, input, select, textarea, summary, [role=button]") || el.closest("nav, header")) &&
      !el.closest("td, [data-dense-grid]") && Math.round(Math.min(r.width, r.height)) < 44);
    if (small.length) out.push({ id: "D-TARGET-2", msg: `${small.length} controls under 44px on a phone`, where: small.slice(0, 6).map((t) => `${label(t.el)} (${Math.round(t.r.width)}x${Math.round(t.r.height)})`).join("; ") });
  }

  // D-TYPE-1: inputs at least 16px (stops iOS zoom), text at least 15px (house scale floor)
  const tinyInputs = [...document.querySelectorAll("input, select, textarea")].filter(
    (el) => visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16,
  );
  if (tinyInputs.length) out.push({ id: "D-TYPE-1", msg: `${tinyInputs.length} form fields under 16px text`, where: tinyInputs.slice(0, 4).map(label).join("; ") });
  const tinyText = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || !walker.currentNode.textContent.trim() || !visible(el) || el.closest("svg, .print-only, [aria-hidden=true]")) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 14.5) tinyText.add(walker.currentNode.textContent.trim().slice(0, 30));
  }
  if (tinyText.size) out.push({ id: "D-TYPE-2", msg: `${tinyText.size} text runs under 15px`, where: [...tinyText].slice(0, 4).join("; ") });

  // D-CAPS-1: sentence case. No CSS uppercase, no all-caps labels or headings
  // (short codes like CGSO or IN-2026-0001 are fine; printed letterheads are skipped).
  const caps = new Set();
  const CODE = /^(?:[\p{Lu}\d]{1,6}|[\p{Lu}\d]+(?:[-\/][\p{Lu}\d]+)+)$/u;
  const capsWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (capsWalker.nextNode()) {
    const text = capsWalker.currentNode.textContent.trim();
    const el = capsWalker.currentNode.parentElement;
    if (!text || !/\p{L}/u.test(text) || !el || !visible(el)) continue;
    if (el.closest("svg, .print-only, .sr-only, [aria-hidden=true], code, kbd, pre, .font-mono, [data-letterhead]")) continue;
    if (getComputedStyle(el).textTransform === "uppercase") { caps.add(text.slice(0, 30)); continue; }
    if (!el.closest("h2,h3,h4,h5,h6,label,legend,thead th,button,summary,dt,nav,.badge")) continue;
    const words = text.match(/[\p{L}\d][\p{L}\d\-\/]*/gu) ?? [];
    const lettered = words.filter((w) => /\p{L}/u.test(w));
    if (lettered.some((w) => w !== w.toUpperCase())) continue;
    // A short all-caps word counts as a code (CGSO, ARTA) only when it stands alone; anything with a digit,
    // dash or slash is a code (IN-2026-0001, G2C). A lone short word such as "STATUS" cannot be told apart
    // from an office code without a list, so it passes; "NEW RECORD" does not.
    const isCode = (w) => /[\d\-\/]/.test(w) || (lettered.length === 1 && CODE.test(w));
    const loud = lettered.filter((w) => !isCode(w));
    if (loud.join("").replace(/[^\p{L}]/gu, "").length >= 4) caps.add(text.slice(0, 30));
  }
  if (caps.size) out.push({ id: "D-CAPS-1", msg: `${caps.size} all-caps text runs (use sentence case)`, where: [...caps].slice(0, 4).join("; ") });

  // D-NUM-1: numbers in table cells are right aligned
  const NUM = /^[+\-−]?\d[\d,]*(\.\d+)?%?\+?$/;
  const numCells = [...document.querySelectorAll("td, th")].filter((el) => {
    if (!visible(el)) return false;
    const txt = el.textContent.trim().replace(/\s+/g, "");
    if (!NUM.test(txt) || /^(19|20)\d\d$/.test(txt)) return false;
    return !/right|end/.test(getComputedStyle(el).textAlign);
  });
  if (numCells.length) out.push({ id: "D-NUM-1", msg: `${numCells.length} number cells not right aligned`, where: numCells.slice(0, 6).map(label).join("; ") });

  // D-STRUCT-1: exactly one h1, no skipped heading levels
  const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
  const h1s = hs.filter((h) => h.tagName === "H1").length;
  if (h1s !== 1) out.push({ id: "D-STRUCT-1", msg: `${h1s} visible h1 headings (want 1)` });
  for (let i = 1; i < hs.length; i++) {
    const a = +hs[i - 1].tagName[1], b = +hs[i].tagName[1];
    if (b > a + 1) { out.push({ id: "D-STRUCT-2", msg: `heading jumps h${a} to h${b}`, where: label(hs[i]) }); break; }
  }

  // D-ZOOM-1: zoom must not be blocked (WCAG 1.4.4)
  const vp = document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "";
  if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(vp)) out.push({ id: "D-ZOOM-1", msg: `viewport blocks zoom: ${vp}` });

  // D-TITLE-1: every page has a specific <title>
  if (!document.title.trim()) out.push({ id: "D-TITLE-1", msg: "empty <title>" });
  return out;
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", process.env.RMS_EMAIL);
  await page.fill("#password", process.env.RMS_PASSWORD);
  await page.check('input[name="privacy"]');
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.locator("form button").last().click()]);
}

async function checkPage(page, path, vp) {
  const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
  const problems = [];
  if (!res || res.status() >= 400) return [{ id: "LOAD", msg: `HTTP ${res?.status()}` }];
  await page.addScriptTag({ content: axeSource });
  const axe = await page.evaluate(async () => {
    const r = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"],
    });
    // axe judges the page at one scroll position, so a full-size field that happens to sit under a sticky
    // Save bar ([data-sticky-actions]) reads as "obscured". Scrolling moves it clear, and html's
    // scroll-padding-bottom keeps a focused field above the bar, so drop only those nodes (QA-110).
    // A target that is itself under 24px is still reported.
    const bars = [...document.querySelectorAll("[data-sticky-actions]")].map((e) => e.getBoundingClientRect());
    const underBarOnly = (sel) => {
      const el = document.querySelector(sel);
      if (!el || !bars.length) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 24 && r.height >= 24 && bars.some((b) => r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right);
    };
    return r.violations
      .map((v) => (v.id === "target-size" ? { ...v, nodes: v.nodes.filter((n) => !underBarOnly(n.target.join(" "))) } : v))
      .filter((v) => v.nodes.length)
      .map((v) => ({
        id: `axe:${v.id}`,
        impact: v.impact,
        msg: `${v.help} (${v.nodes.length})`,
        where: v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("; "),
      }));
  });
  problems.push(...axe, ...(await page.evaluate(houseChecks, vp.name)));
  return problems;
}

const browser = await chromium.launch();
const results = [];
const signedIn = Boolean(process.env.RMS_EMAIL && process.env.RMS_PASSWORD);
const paths = ONLY ? ONLY.filter((p) => signedIn || PUBLIC.includes(p)) : [...PUBLIC, ...(signedIn ? SIGNED_IN : [])];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  for (const p of paths.filter((x) => PUBLIC.includes(x))) results.push({ path: p, viewport: vp.name, problems: await checkPage(page, p, vp) });
  if (signedIn) {
    await signIn(page);
    for (let p of paths.filter((x) => !PUBLIC.includes(x))) {
      if (p === "@record") {
        await page.goto(`${BASE}/records`, { waitUntil: "networkidle" });
        const href = await page.locator('a[href^="/records/"]:not([href="/records/new"])').first().getAttribute("href");
        if (!href) continue;
        p = href;
      }
      results.push({ path: p, viewport: vp.name, problems: await checkPage(page, p, vp) });
    }
  }
  await ctx.close();
}
await browser.close();

let total = 0;
for (const r of results) {
  for (const pr of r.problems) {
    total++;
    console.log(`${r.viewport.padEnd(7)} ${r.path.padEnd(22)} ${pr.id.padEnd(28)} ${pr.msg}${pr.where ? `  [${pr.where}]` : ""}`);
  }
}
console.log(`\n${total} problem(s) on ${results.length} page loads${signedIn ? "" : " (public pages only; set RMS_EMAIL and RMS_PASSWORD for the rest)"}.`);
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
process.exitCode = total ? 1 : 0;
