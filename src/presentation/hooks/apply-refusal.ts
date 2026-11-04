export type SaveResult<R extends string> = { ok: true } | { ok: false; reason: R };

export interface RefusalOutcome<R extends string, F extends string> {
  messages: Record<R, string>;
  /** Form field a refusal belongs to; null closes the form and warns. */
  fieldOf: (reason: R) => F | null;
  setError: (field: F, error: { message: string }) => void;
  close: () => void;
  warn: (message: string) => Promise<void>;
}

/**
 * Outcome of a form save: success closes the form, a field refusal marks that field and keeps the form open,
 * any other refusal closes the form and warns. Closing and marking happen before the first await.
 */
export async function applyRefusal<R extends string, F extends string>(
  result: SaveResult<R>,
  outcome: RefusalOutcome<R, F>
): Promise<void> {
  if (result.ok) {
    outcome.close();
    return;
  }
  const message = outcome.messages[result.reason];
  const field = outcome.fieldOf(result.reason);
  if (field) {
    outcome.setError(field, { message });
    return;
  }
  outcome.close();
  await outcome.warn(message);
}
