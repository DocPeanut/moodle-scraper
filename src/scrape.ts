import * as fs from "fs";
import { chromium } from "playwright";

interface ScrapeResult {
  url: string;
  title: string;
  iframes: string[];
}

async function run() {
  const userDataDir = "./moodle_session";

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: false,
    });
  } catch (e) {
    console.error("Failed to launch Chrome:", e);
    process.exit(1);
  }

  const page = await context.newPage();

  const startUrl = process.argv.slice(2)[0];

  if (!startUrl) {
    console.error("Usage: pnpm scrape <moodle_page_url>");
    console.error("Example: pnpm scrape https://moodle.example.com/mod/page/view.php?id=12345");
    process.exit(1);
  }

  console.log(`Navigating to ${startUrl}`);
  await page.goto(startUrl);

  console.log("\n=======================================================");
  console.log(
    "Waiting for Moodle login... Please log in via the opened browser window if prompted.",
  );
  console.log("If you are already logged in, the script will continue automatically.");
  console.log("=======================================================\n");

  await page.waitForURL("**/mod/page/view.php*", { timeout: 0 });

  console.log("Authenticated! Starting to scrape...");

  const results: ScrapeResult[] = [];
  let hasNext = true;

  while (hasNext) {
    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch {}

    const currentUrl = page.url();
    console.log(`\nScraping: ${currentUrl}`);

    await page.waitForLoadState("domcontentloaded");

    let title = await page.title();

    // Try to extract title from h2 under #region-main
    const h2Locator = page.locator("#region-main h2").first();
    const countH2 = await h2Locator.count();
    if (countH2 > 0) {
      try {
        const h2Text = await h2Locator.innerText({ timeout: 1000 });
        if (h2Text && h2Text.trim() !== "") {
          title = h2Text.trim();
        }
      } catch {}
    }

    const iframes = await page.$$eval("iframe", (frames) => {
      return frames.map((f) => (f as HTMLIFrameElement).src);
    });

    results.push({
      url: currentUrl,
      title,
      iframes,
    });

    console.log(` -> Title: ${title}`);
    console.log(` -> Found ${iframes.length} iframes`);
    iframes.forEach((src) => console.log(`    - ${src}`));

    const nextLink = page.locator("#next-activity-link");

    const count = await nextLink.count();
    if (count > 0) {
      console.log(" -> Clicking '#next-activity-link' to go to the next page...");
      try {
        // Click and explicitly let the loop continue and wait for load states on next iteration
        await nextLink.click();
      } catch (e) {
        console.log("Navigation error, trying to continue...", (e as Error).message);
      }
    } else {
      console.log(" -> No '#next-activity-link' found. Scraping finished.");
      hasNext = false;
    }
  }

  const finalResults = results.filter((item) => item.iframes && item.iframes.length > 0);

  const outputPath = "output.jsonc";
  fs.writeFileSync(outputPath, JSON.stringify(finalResults, null, 2));
  console.log(`\n=======================================================`);
  console.log(`Scraping complete. Results successfully saved to ${outputPath}`);
  console.log(`=======================================================`);

  await context.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error during scraping:", err);
  process.exit(1);
});
