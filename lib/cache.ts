import fs from "node:fs";
import path from "node:path";
import type { OrgBundle } from "./bundle";

const PRECACHED_DIR = path.join(process.cwd(), "data", "precached");

interface PrecachedEntry {
  bundle: OrgBundle;
}

export function loadPrecachedBundle(ein: number): OrgBundle | null {
  const file = path.join(PRECACHED_DIR, `${ein}.json`);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed: PrecachedEntry = JSON.parse(raw);
    return parsed.bundle;
  } catch {
    return null;
  }
}

export interface PrecachedListItem {
  ein: number;
  name: string;
  city: string | null;
  state: string | null;
}

export function listPrecachedOrgs(): PrecachedListItem[] {
  try {
    const files = fs.readdirSync(PRECACHED_DIR).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        const raw = fs.readFileSync(path.join(PRECACHED_DIR, f), "utf8");
        const parsed: PrecachedEntry = JSON.parse(raw);
        return {
          ein: parsed.bundle.ein,
          name: parsed.bundle.name,
          city: parsed.bundle.city,
          state: parsed.bundle.state,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
