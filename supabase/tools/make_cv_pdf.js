// Builds public/Vicson-Yaris-CV.pdf from supabase/tools/cv.html (run: node supabase/tools/make_cv_pdf.js)
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(__dirname, "cv.html"));
  await page.pdf({ path: path.join(__dirname, "../../public/Vicson-Yaris-CV.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await browser.close();
})();
