/**
 * `npm run db:import-actas -- --csv <file> --pdfs <dir> [--dry-run | --yes] [--pdftotext <path>]`
 *
 * Replaces ALL server data with the official match reports (S1, S2): deletes
 * every record, play, session and account except admin@camg.com.ar (its
 * password is kept), rotates the data epoch so no browser can push old data
 * back, and loads the division, own team, players, coaches, rival teams and
 * finished matches of the reports, in one transaction.
 *
 * --csv        CSV extracted from the reports (`;`-separated, UTF-8).
 * --pdfs       Folder with the `Acta-Partido-<number>.pdf` files (points per quarter).
 * --dry-run    Parse and validate only, print the summary; never connects to the database.
 * --yes        Required to write: the command deletes the current data.
 * --pdftotext  pdftotext executable (default: $PDFTOTEXT or `pdftotext` on PATH).
 *
 * The report data is personal: keep the files out of the repository (L6).
 */
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { createDatabase } from '@/server/db/client';
import { logServerError } from '@/server/http/log-server-error';
import {
  ActaImportError,
  buildActaImport,
  formatActaImportSummary,
  parseActaCsv,
  parseActaReportText,
  type ActaReport,
} from '@/server/import/acta-parser';
import { wipeAndImportActas } from '@/server/import/acta-wipe-import';

const REPORT_FILE = /^Acta-Partido-(\d+)\.pdf$/i;
const run = promisify(execFile);

async function readReports(dir: string, pdftotext: string): Promise<ActaReport[]> {
  const files = (await readdir(dir)).filter((name) => REPORT_FILE.test(name)).sort();
  if (files.length === 0) throw new ActaImportError([`No Acta-Partido-<number>.pdf files in ${dir}`]);

  const reports: ActaReport[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const { stdout } = await run(pdftotext, ['-layout', '-enc', 'UTF-8', path.join(dir, file), '-'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    try {
      const report = parseActaReportText(stdout);
      const numberInName = REPORT_FILE.exec(file)?.[1];
      if (report.matchId !== numberInName) {
        problems.push(`${file}: the report is match ${report.matchId}`);
        continue;
      }
      reports.push(report);
    } catch (error) {
      if (!(error instanceof ActaImportError)) throw error;
      problems.push(...error.problems.map((problem) => `${file}: ${problem}`));
    }
  }
  if (problems.length > 0) throw new ActaImportError(problems);
  return reports;
}

/** host:port/database, never the credentials. */
function describeDatabase(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      csv: { type: 'string' },
      pdfs: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      pdftotext: { type: 'string' },
    },
    strict: true,
  });
  if (!values.csv || !values.pdfs) {
    console.error('Usage: npm run db:import-actas -- --csv <file> --pdfs <dir> [--dry-run | --yes] [--pdftotext <path>]');
    process.exitCode = 1;
    return;
  }
  const dryRun = values['dry-run'];
  if (!dryRun && !values.yes) {
    console.error('This deletes all current data. Run with --dry-run to check the import, or --yes to write it.');
    process.exitCode = 1;
    return;
  }

  const pdftotext = values.pdftotext || process.env.PDFTOTEXT || 'pdftotext';
  const reports = await readReports(path.resolve(values.pdfs), pdftotext);
  const rows = parseActaCsv(await readFile(path.resolve(values.csv), 'utf8'));
  const data = buildActaImport(rows, reports);
  console.log(`Read ${rows.length} CSV rows and ${reports.length} match reports.`);
  console.log(formatActaImportSummary(data));

  if (dryRun) {
    console.log('Dry run: nothing was written.');
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local, then run `npm run db:up`.');
    process.exitCode = 1;
    return;
  }
  console.log(`Replacing all data in ${describeDatabase(url)}...`);
  const { db, pool } = createDatabase(url);
  try {
    const summary = await wipeAndImportActas(db, data, { now: new Date() });
    console.log(`Kept account: ${summary.keptAccount} (password unchanged).`);
    console.log(
      `Deleted: ${summary.deleted.users} accounts, ${summary.deleted.sessions} sessions, ${summary.deleted.records} records, ${summary.deleted.events} plays.`
    );
    console.log(
      `Inserted: ${Object.entries(summary.inserted)
        .map(([kind, count]) => `${count} ${kind}`)
        .join(', ')}.`
    );
    console.log(`New data epoch: ${summary.epoch}; cursor ${summary.cursor}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ActaImportError) {
    console.error(error.message);
  } else {
    logServerError('db:import-actas', error);
  }
  process.exitCode = 1;
});
