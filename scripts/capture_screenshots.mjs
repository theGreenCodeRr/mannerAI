import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_URL = process.env.MANNER_AI_URL || 'http://127.0.0.1:5173';
const OUTPUT_DIR = path.resolve(__dirname, '../docs/screenshots');

async function launchBrowser() {
  const systemChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(systemChromePath)) {
    return chromium.launch({
      headless: true,
      executablePath: systemChromePath,
    });
  }
  return chromium.launch({ headless: true });
}

async function captureScreenshots() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

    // Wait briefly so the 30 FPS simulated skeleton reaches an informative bow angle on the canvas
    await page.waitForTimeout(2100);

    const livePracticePath = path.join(OUTPUT_DIR, 'live_practice_view.png');
    const practiceStudioPath = path.join(OUTPUT_DIR, 'practice_studio.png');
    await page.screenshot({ path: livePracticePath, fullPage: false });
    fs.copyFileSync(livePracticePath, practiceStudioPath);
    console.log(`Captured: ${livePracticePath}`);

    // Trigger View B: Post-Session Diagnostic Dashboard by clicking the sample loader button
    const loadSampleBtn = page.getByTestId('load-sample-btn');
    await loadSampleBtn.click();

    await page.getByTestId('diagnostic-dashboard').waitFor({ state: 'visible' });
    await page.waitForTimeout(400);

    const diagnosticSplitPath = path.join(OUTPUT_DIR, 'diagnostic_split_view.png');
    const diagnosticDashboardPath = path.join(OUTPUT_DIR, 'diagnostic_dashboard.png');
    await page.screenshot({ path: diagnosticSplitPath, fullPage: false });
    fs.copyFileSync(diagnosticSplitPath, diagnosticDashboardPath);
    console.log(`Captured: ${diagnosticSplitPath}`);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
