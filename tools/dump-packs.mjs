/*
 * Dump the *current* shape of the pf2e system's compendium packs, and report
 * how much of each pack this module actually translates.
 *
 * Packs are LevelDB directories. Foundry holds a lock on them while a world is
 * open, so each pack is copied to a temporary directory before being read --
 * this makes the script safe to run with Foundry running, and it never writes
 * to the Foundry installation.
 *
 * Usage:
 *   node tools/dump-packs.mjs [--data <foundry data dir>] [--out <dir>] [--pack <collection>]
 *
 * Outputs, under --out (default: build/packs):
 *   <collection>.json   current entries, keyed the way Babele matches them
 *   _coverage.json      per-pack translated / missing / stale key report
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
    const args = { data: "D:/Foundry VTT/v14/LocalData/Data", out: path.join(repoRoot, "build/packs"), pack: null };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, "");
        if (key in args) args[key] = argv[i + 1];
    }
    return args;
}

const args = parseArgs(process.argv.slice(2));
const dataDir = path.resolve(args.data);
const outDir = path.resolve(args.out);

// classic-level ships with Foundry; borrow it rather than adding a dependency.
// The install root sits above the user data dir, but how far up varies by
// install layout, so walk upward looking for the bundled node_modules.
function findClassicLevel(from) {
    for (let dir = from; ; dir = path.dirname(dir)) {
        const candidate = path.join(dir, "System/node_modules/classic-level");
        if (fs.existsSync(candidate)) return candidate;
        if (dir === path.dirname(dir)) {
            throw new Error(`could not locate Foundry's bundled classic-level above ${from}`);
        }
    }
}

const require = createRequire(import.meta.url);
const { ClassicLevel } = require(findClassicLevel(dataDir));

const systemJsonPath = path.join(dataDir, "systems/pf2e/system.json");
const system = JSON.parse(fs.readFileSync(systemJsonPath, "utf8"));

/** Copy a LevelDB directory to temp so Foundry's lock does not block us. */
function snapshot(srcDir) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf2eja-pack-"));
    for (const entry of fs.readdirSync(srcDir)) {
        if (entry === "LOCK") continue;
        fs.copyFileSync(path.join(srcDir, entry), path.join(tmp, entry));
    }
    return tmp;
}

/**
 * Babele's default key order: an explicit `_id`, then the document `name`.
 * This module's files are keyed by name, so name is what matters here.
 */
function readPack(packDir) {
    const tmp = snapshot(packDir);
    const db = new ClassicLevel(tmp, { valueEncoding: "json" });
    return db
        .values()
        .all()
        .then((values) => values.filter((v) => v && typeof v === "object" && v.name))
        .finally(async () => {
            await db.close();
            fs.rmSync(tmp, { recursive: true, force: true });
        });
}

function existingTranslationKeys(collection) {
    const file = path.join(repoRoot, "compendium", `${collection}.json`);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const entries = parsed.entries ?? {};
    // Legacy array form is keyed by `id`; compatible form is keyed directly.
    return new Set(Array.isArray(entries) ? entries.map((e) => e.id).filter(Boolean) : Object.keys(entries));
}

fs.mkdirSync(outDir, { recursive: true });

const coverage = [];
const packs = system.packs.filter((p) => !args.pack || p.name === args.pack);

for (const pack of packs) {
    const packDir = path.join(dataDir, "systems/pf2e", pack.path);
    if (!fs.existsSync(packDir)) continue;

    let documents;
    try {
        documents = await readPack(packDir);
    } catch (error) {
        console.error(`SKIP ${pack.name}: ${error.message}`);
        continue;
    }

    const entries = {};
    for (const doc of documents) {
        entries[doc.name] = {
            _id: doc._id,
            name: doc.name,
            ...(doc.system?.description?.value ? { description: doc.system.description.value } : {}),
        };
    }

    fs.writeFileSync(
        path.join(outDir, `${pack.name}.json`),
        JSON.stringify({ label: pack.label, collection: `pf2e.${pack.name}`, entries }, null, "\t"),
    );

    const translated = existingTranslationKeys(`pf2e.${pack.name}`);
    const current = new Set(Object.keys(entries));
    coverage.push({
        collection: `pf2e.${pack.name}`,
        hasFile: translated !== null,
        current: current.size,
        matched: translated ? [...current].filter((k) => translated.has(k)).length : 0,
        missing: translated ? [...current].filter((k) => !translated.has(k)) : [...current],
        stale: translated ? [...translated].filter((k) => !current.has(k)) : [],
    });
}

fs.writeFileSync(path.join(outDir, "_coverage.json"), JSON.stringify(coverage, null, "\t"));

const withFiles = coverage.filter((c) => c.hasFile);
console.log(`packs dumped: ${coverage.length}  (translation files present: ${withFiles.length})\n`);
console.log("collection".padEnd(42), "cur".padStart(6), "hit".padStart(6), "miss".padStart(6), "stale".padStart(6));
for (const c of withFiles.sort((a, b) => a.matched / a.current - b.matched / b.current)) {
    console.log(
        c.collection.padEnd(42),
        String(c.current).padStart(6),
        String(c.matched).padStart(6),
        String(c.missing.length).padStart(6),
        String(c.stale.length).padStart(6),
    );
}
console.log(`\nfull report: ${path.join(outDir, "_coverage.json")}`);
