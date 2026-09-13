import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function markdownFiles(directory, recursive = true) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...await markdownFiles(filename));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(filename);
    }
  }
  return files.sort();
}

// Only documentation owned by the project; research and generated output are excluded.
const files = [
  ...await markdownFiles(root, false),
  ...await markdownFiles(path.join(root, "docs")),
  ...await markdownFiles(path.join(root, ".github")),
];
const failures = [];
let checked = 0;
for (const filename of files) {
  const lines = (await readFile(filename, "utf8")).split(/\r?\n/);
  let fence = null;
  for (const [index, line] of lines.entries()) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    // Inline links/images and reference definitions; headings and remote URLs are out of scope.
    const destinations = [...line.matchAll(/\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g)]
      .map(match => match[1] ?? match[2]);
    const reference = line.match(/^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/);
    if (reference) destinations.push(reference[1] ?? reference[2]);
    for (const destination of destinations) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination)) continue;
      const location = `${path.relative(root, filename)}:${index + 1}`;
      try {
        const pathname = decodeURIComponent(destination.split(/[?#]/)[0]);
        if (!pathname) continue;
        const target = path.resolve(path.dirname(filename), pathname);
        const relative = path.relative(root, target);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error("destination is outside the repository");
        }
        await stat(target);
        checked += 1;
      } catch (error) {
        failures.push(`${location}: ${destination} (${error.message})`);
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation links: ${checked} local destinations checked in ${files.length} Markdown files.`);
}
