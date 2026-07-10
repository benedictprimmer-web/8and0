// Minimal, correct CSV parsing + cached fetch for the data pipeline.
// No dependency — FIFA/worldcup source CSVs quote fields containing commas and
// newlines, so a naive split() would corrupt names and clubs.

import fs from "node:fs/promises";
import path from "node:path";

// RFC-4180-ish parser: handles quoted fields, escaped "" quotes, embedded
// commas and newlines. Returns an array of objects keyed by the header row.
export function parseCsv(text) {
  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      // Ignore blank trailing lines.
      if (field !== "" || record.length > 0) {
        record.push(field);
        rows.push(record);
        record = [];
        field = "";
      }
    } else {
      field += c;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const obj = {};
    for (let j = 0; j < header.length; j += 1) obj[header[j]] = cells[j] ?? "";
    return obj;
  });
}

// Fetch a URL, caching the raw body under cacheDir. Re-runs read the cache so
// the pipeline is reproducible offline and we never re-hammer a source.
export async function fetchCached(url, cachePath, { force = false } = {}) {
  if (!force) {
    try {
      return await fs.readFile(cachePath, "utf8");
    } catch {
      /* not cached yet */
    }
  }
  const res = await fetch(url, {
    headers: {
      "user-agent": "8and0 data pipeline/1.0 (+https://8and0.app)",
      accept: "text/csv,text/plain,*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${url}`);
  }
  const body = await res.text();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, body);
  return body;
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
