import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LOGIN_PATH, loginRedirectPath, safeNextPath, toClubUser } from './auth-session';
import { SEED_USERS } from '@/core/infrastructure/mocks/seed-data';

const NOW = new Date('2026-10-30T18:00:00.000Z');

describe('toClubUser (S10.8)', () => {
  it('takes name and role from the server for a known user', () => {
    const known = SEED_USERS[0];
    const user = toClubUser({ id: known.id, email: known.email, name: 'Nombre Servidor', role: 'ADMIN' }, SEED_USERS, NOW);
    assert.strictEqual(user.id, known.id);
    assert.strictEqual(user.name, 'Nombre Servidor');
    assert.strictEqual(user.role, 'ADMIN');
    assert.strictEqual(user.createdAt, known.createdAt);
  });

  it('builds a full club user for an account the club data does not know', () => {
    const user = toClubUser({ id: 'u-new', email: 'nuevo@camg.com.ar', name: 'Nuevo', role: 'ASSISTANT_STATISTICIAN' }, [], NOW);
    assert.deepStrictEqual(user, {
      id: 'u-new',
      email: 'nuevo@camg.com.ar',
      name: 'Nuevo',
      role: 'ASSISTANT_STATISTICIAN',
      createdAt: '2026-10-30T18:00:00.000Z',
      updatedAt: '2026-10-30T18:00:00.000Z',
    });
  });
});

describe('safeNextPath', () => {
  it('accepts same-origin app paths', () => {
    assert.strictEqual(safeNextPath('/matches/m-1/live'), '/matches/m-1/live');
    assert.strictEqual(safeNextPath('/players?division=u19'), '/players?division=u19');
  });

  it('falls back to the dashboard for missing, external or login targets', () => {
    for (const value of [null, '', 'https://evil.example', '//evil.example', '/\\evil', 'matches', LOGIN_PATH, '/login?next=/']) {
      assert.strictEqual(safeNextPath(value), '/', String(value));
    }
  });

  it('rejects control characters and backslashes that browsers strip or normalize (open redirect)', () => {
    const attacks = ['/\t/evil.com', '/\n/evil.com', '/\r//evil.com', '//evil.com', '/\\evil.com', 'https://evil.com', '/\x00/evil.com', '/\x7f/evil.com', '/players\\..\\evil'];
    for (const value of attacks) {
      assert.strictEqual(safeNextPath(value), '/', JSON.stringify(value));
    }
    assert.strictEqual(safeNextPath('/players?x=1'), '/players?x=1');
  });
});

describe('loginRedirectPath', () => {
  it('keeps the requested page as `next`', () => {
    assert.strictEqual(loginRedirectPath('/matches/m-1/live'), '/login?next=%2Fmatches%2Fm-1%2Flive');
    assert.strictEqual(loginRedirectPath('/'), '/login');
  });
});
