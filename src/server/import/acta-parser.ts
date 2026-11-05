import 'server-only';

/**
 * =============================================================================
 * HOOP - OFFICIAL MATCH REPORT IMPORT (pure)
 * Turns the CSV extracted from the official match reports (one row per listed
 * player) and the text of each report PDF (`pdftotext -layout`, for the points
 * per period) into club records. Nothing is invented: players keep the name,
 * license and number of the reports, and matches get no plays. Any
 * inconsistency fails the whole import with every problem found.
 * The data is personal: it is read at import time and never committed (L6).
 * =============================================================================
 *
 * Entry point of the import: acta-csv (CSV rows), acta-report-text (report
 * PDFs), acta-records (club records, with acta-rosters and acta-values) and
 * acta-summary (what the import writes).
 */

export { ActaImportError } from './acta-import-error';
export { parseActaCsv, type ActaCsvRow } from './acta-csv';
export { parseActaReportText, type ActaReport, type ReportPeriod, type ReportPlayer } from './acta-report-text';
export type {
  ActaImport,
  ActaImportOptions,
  ActaMatchSummary,
  CompletedName,
  NumberVariant,
  ReassignedDorsal,
  SharedDorsal,
} from './acta-import-types';
export { buildActaImport } from './acta-records';
export { formatActaImportSummary } from './acta-summary';
