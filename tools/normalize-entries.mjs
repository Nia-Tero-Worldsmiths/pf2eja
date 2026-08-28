/*
 * Convert legacy array-format translation files to Babele's "compatible"
 * object format.
 *
 * Babele 2.9.1 cannot read the legacy format: CompendiumTranslation#merge does
 * `{...payload.entries}`, which turns an array into an object keyed by numeric
 * index before TranslationEntries gets the chance to re-key it by `entry.id`.
 * The file loads (the pack label translates, isTranslated() returns true) but
 * no document ever matches, so nothing is translated and nothing is logged.
 *
 * Legacy:      "entries": [ { "id": "Psychic", "name": "サイキック" } ]
 * Compatible:  "entries": { "Psychic": { "name": "サイキック" } }
 *
 * Usage: node tools/normalize-entries.mjs [--dry]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(repoRoot, "compendium");
const dry = process.argv.includes("--dry");

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const full = path.join(dir, file);
    const payload = JSON.parse(fs.readFileSync(full, "utf8"));

    if (!Array.isArray(payload.entries)) {
        console.log(`skip      ${file} (already compatible)`);
        continue;
    }

    const entries = {};
    let dropped = 0;
    let overwritten = 0;

    for (const entry of payload.entries) {
        if (!entry?.id) {
            dropped++;
            continue;
        }
        const { id, ...rest } = entry;
        if (id in entries) overwritten++;
        entries[id] = rest; // last one wins, matching Babele's own normalize()
    }

    payload.entries = entries;

    const notes = [
        `${Object.keys(entries).length} entries`,
        dropped ? `${dropped} dropped (no id)` : null,
        overwritten ? `${overwritten} duplicate ids collapsed` : null,
    ].filter(Boolean).join(", ");

    console.log(`converted ${file.padEnd(40)} ${notes}`);

    if (!dry) {
        fs.writeFileSync(full, JSON.stringify(payload, null, "\t") + "\n");
    }
}

if (dry) console.log("\n(dry run -- nothing written)");
