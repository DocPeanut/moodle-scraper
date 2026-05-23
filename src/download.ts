import concurrently from "concurrently";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: pnpm download <target_directory>");
  console.error('Example: pnpm download "~/Desktop/Vimeo Downloads"');
  process.exit(1);
}

let targetDir = args[0];
if (targetDir.startsWith("~/")) {
  targetDir = path.join(process.env.HOME || "", targetDir.slice(2));
} else {
  targetDir = path.resolve(targetDir);
}

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log(`Saving videos to: ${targetDir}`);

const dataPath = path.join(__dirname, "../output.jsonc");
if (!fs.existsSync(dataPath)) {
  console.error("output.json not found! Please run the scraper first.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const commands: { command: string; name: string }[] = [];

for (const item of data) {
  if (!item.iframes || item.iframes.length === 0) continue;

  for (let i = 0; i < item.iframes.length; i++) {
    const vimeoUrl = item.iframes[i];

    const baseName = item.title;
    const titleSuffix = item.iframes.length > 1 ? `_part${i + 1}` : "";
    let safeTitle = `${baseName}${titleSuffix}`.replace(/[/\\?%*:|"<>]/g, "-");

    const referer = item.url;
    const outputTemplate = path.join(targetDir, `${safeTitle}.%(ext)s`);

    const cmd = `yt-dlp -o "${outputTemplate}" --referer "${referer}" "${vimeoUrl}"`;
    commands.push({ command: cmd, name: safeTitle });
  }
}

console.log(`\n======================================================`);
console.log(`Starting ${commands.length} downloads simultaneously...`);
console.log(`======================================================\n`);

concurrently(commands, {
  maxProcesses: 10,
  prefix: "name",
  prefixColors: "auto",
})
  .result.then(() => {
    console.log("\n======================================================");
    console.log("All downloads successfully processed!");
    console.log("======================================================");
  })
  .catch(() => {
    console.error("\n[!] Finished fetching queue, but some downloads might have failed.");
  });
