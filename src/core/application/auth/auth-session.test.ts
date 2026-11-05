import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  afterPasswordChangePath,
  LOGIN_PATH,
  loginRedirectPath,
  mustChangePasswordAt,
  PASSWORD_CHANGE_PATH,
  passwordChangeRedirectPath,
  safeNextPath,
  toClubUser,
  type AuthUser,
} from './auth-session';
import { SEED_USERS } from '@/core/infrastructure/mocks/seed-data';

const NOW = new Date('2026-10-30T18:00:00.000Z');

describe('toClubUser (S10.8)', () => {
  it('takes name and role from the server for a known user', () => {
    const known = SEED_USERS[0];
    const user = toClubUser(
      { id: known.id, email: known.email, name: 'Nombre Servidor', role: 'ADMIN', mustChangePassword: false },
      SEED_USERS,
      NOW
    );
    assert.strictEqual(user.id, known.id);
    assert.strictEqual(user.name, 'Nombre Servidor');
    assert.strictEqual(user.role, 'ADMIN');
    assert.strictEqual(user.createdAt, known.createdAt);
  });

  it('builds a full club user for an account the club data does not know', () => {
    const user = toClubUser(
      { id: 'u-new', email: 'nuevo@camg.com.ar', name: 'Nuevo', role: 'ASSISTANT_STATISTICIAN', mustChangePassword: false },
      [],
      NOW
    );
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

  it('rejects paths that the URL parser normalizes into a protocol-relative URL', () => {
    for (const value of ['/.//evil.com', '/./' + '/evil.com', '/a/..//evil.com', '/%2e//evil.com']) {
      assert.strictEqual(safeNextPath(value), '/', JSON.stringify(value));
    }
    const accepted = ['/players', '/matches/m-1/live', '/players?next=//x', '/%09/evil.com', '/\uFF0F\uFF0Fevil.com'];
    for (const value of accepted) {
      const resolved = new URL(safeNextPath(value), 'https://o.example');
      assert.strictEqual(resolved.origin, 'https://o.example', value);
      assert.ok(!resolved.pathname.startsWith('//'), value);
    }
  });
});

describe('loginRedirectPath', () => {
  it('keeps the requested page as `next`', () => {
    assert.strictEqual(loginRedirectPath('/matches/m-1/live'), '/login?next=%2Fmatches%2Fm-1%2Flive');
    assert.strictEqual(loginRedirectPath('/'), '/login');
  });
});

const FLAGGED: AuthUser = { id: 'u-1', email: 'nuevo@camg.com.ar', name: 'Nuevo', role: 'HEAD_COACH', mustChangePassword: true };

describe('mustChangePasswordAt (S3)', () => {
  it('sends a flagged user away from every screen except login and the change-password screen', () => {
    for (const pathname of ['/', '/players', '/matches/m-1/live', '/users', '/help', '/account']) {
      assert.strictEqual(mustChangePasswordAt(FLAGGED, pathname), true, pathname);
    }
    assert.strictEqual(mustChangePasswordAt(FLAGGED, LOGIN_PATH), false);
    assert.strictEqual(mustChangePasswordAt(FLAGGED, PASSWORD_CHANGE_PATH), false);
  });

  it('never redirects without a user or once the flag is clear', () => {
    assert.strictEqual(mustChangePasswordAt(null, '/players'), false);
    assert.strictEqual(mustChangePasswordAt({ ...FLAGGED, mustChangePassword: false }, '/players'), false);
  });
});

describe('passwordChangeRedirectPath (S3)', () => {
  it('keeps the requested page as a safe `next`', () => {
    assert.strictEqual(PASSWORD_CHANGE_PATH, '/account/password');
    assert.strictEqual(passwordChangeRedirectPath('/matches/m-1/live?tab=x'), '/account/password?next=%2Fmatches%2Fm-1%2Flive%3Ftab%3Dx');
    assert.strictEqual(passwordChangeRedirectPath('/'), '/account/password');
  });

  it('drops external, login and change-password targets', () => {
    for (const value of ['//evil.example', '/\t/evil.com', LOGIN_PATH, PASSWORD_CHANGE_PATH, '/account/password?next=/players']) {
      assert.strictEqual(passwordChangeRedirectPath(value), PASSWORD_CHANGE_PATH, JSON.stringify(value));
    }
  });
});

describe('afterPasswordChangePath (S3)', () => {
  it('continues to a safe `next` or the dashboard, never back to the change-password screen', () => {
    assert.strictEqual(afterPasswordChangePath('/players?division=u19'), '/players?division=u19');
    for (const value of [null, undefined, '', 'https://evil.example', '//evil.example', LOGIN_PATH, PASSWORD_CHANGE_PATH, '/account/password?x=1']) {
      assert.strictEqual(afterPasswordChangePath(value), '/', String(value));
    }
  });
});
