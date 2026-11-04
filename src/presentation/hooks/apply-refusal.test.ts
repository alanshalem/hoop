import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyRefusal, type RefusalOutcome } from './apply-refusal';

type Reason = 'INVALID_NAME' | 'NOT_FOUND';

const MESSAGES: Record<Reason, string> = {
  INVALID_NAME: 'Nombre inválido.',
  NOT_FOUND: 'Ya no existe.',
};

/** Records every effect in order; `warn` settles only when `release` is called. */
function recorder() {
  const calls: string[] = [];
  let release = () => {};
  const outcome: RefusalOutcome<Reason, 'name'> = {
    messages: MESSAGES,
    fieldOf: (reason) => (reason === 'INVALID_NAME' ? 'name' : null),
    setError: (field, error) => calls.push(`setError:${field}:${error.message}`),
    close: () => calls.push('close'),
    warn: (message) =>
      new Promise<void>((resolve) => {
        calls.push(`warn:${message}`);
        release = resolve;
      }),
  };
  return { calls, outcome, release: () => release() };
}

describe('applyRefusal', () => {
  it('closes the form on success and does nothing else', async () => {
    const { calls, outcome } = recorder();
    await applyRefusal({ ok: true }, outcome);
    assert.deepStrictEqual(calls, ['close']);
  });

  it('keeps the form open and marks the field of a field refusal', async () => {
    const { calls, outcome } = recorder();
    await applyRefusal({ ok: false, reason: 'INVALID_NAME' }, outcome);
    assert.deepStrictEqual(calls, ['setError:name:Nombre inválido.']);
  });

  it('closes the form and then warns with the message of any other refusal', async () => {
    const { calls, outcome, release } = recorder();
    let settled = false;
    const done = applyRefusal({ ok: false, reason: 'NOT_FOUND' }, outcome).then(() => {
      settled = true;
    });
    assert.deepStrictEqual(calls, ['close', 'warn:Ya no existe.']);
    await Promise.resolve();
    assert.strictEqual(settled, false, 'waits until the warning is dismissed');
    release();
    await done;
    assert.strictEqual(settled, true);
  });

  it('applies the success and field outcomes synchronously, before the returned promise settles', () => {
    const ok = recorder();
    void applyRefusal({ ok: true }, ok.outcome);
    assert.deepStrictEqual(ok.calls, ['close']);

    const refused = recorder();
    void applyRefusal({ ok: false, reason: 'INVALID_NAME' }, refused.outcome);
    assert.deepStrictEqual(refused.calls, ['setError:name:Nombre inválido.']);
  });
});
