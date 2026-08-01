import concurrently from "concurrently";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: pnpm run download <target_directory>");
  console.error('Example: pnpm run download "~/Desktop/Vimeo Downloads"');
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

function sanitizeName(value: string) {
  return value.replace(/[/\\?%*:|"<>]/g, "-").trim();
}

const dataPath = path.join(__dirname, "../output.jsonc");
if (!fs.existsSync(dataPath)) {
  console.error("output.json not found! Please run the scraper first.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const commands: { command: string; name: string }[] = [];

for (const item of data) {
  if (!item.iframes || item.iframes.length === 0) continue;

  const sectionName = item.section ? sanitizeName(item.section) : "Unsorted";
  const sectionDir = path.join(targetDir, sectionName);

  if (!fs.existsSync(sectionDir)) {
    fs.mkdirSync(sectionDir, { recursive: true });
  }

  for (let i = 0; i < item.iframes.length; i++) {
    const vimeoUrl = item.iframes[i];

    const baseName = sanitizeName(item.title);
    const titleSuffix = item.iframes.length > 1 ? `_part${i + 1}` : "";
    let safeTitle = `${baseName}${titleSuffix}`;

    const referer = item.url;
    const outputTemplate = path.join(sectionDir, `${safeTitle}.%(ext)s`);

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
  .catch((e) => {
    console.error("\n[!] Finished fetching queue, but some downloads might have failed.");
    console.error(e);
  });
