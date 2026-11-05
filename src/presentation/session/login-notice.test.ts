import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OFFLINE_LOGIN_MESSAGE, loginFailureNotice } from './login-notice';
import { SERVER_FALLBACK_MESSAGE } from './account-messages';

const TOO_MANY = 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.';

describe('loginFailureNotice (S1)', () => {
  it('shows the server message of a blocked login as a warning', () => {
    assert.deepStrictEqual(
      loginFailureNotice({ ok: false, error: 'HTTP', status: 429, message: TOO_MANY, reason: 'TOO_MANY_ATTEMPTS' }),
      { title: 'Demasiados intentos', message: TOO_MANY, tone: 'warning' }
    );
  });

  it('falls back to the same Spanish text when a blocked login carries no message', () => {
    assert.deepStrictEqual(loginFailureNotice({ ok: false, error: 'HTTP', status: 429, reason: 'TOO_MANY_ATTEMPTS' }), {
      title: 'Demasiados intentos',
      message: TOO_MANY,
      tone: 'warning',
    });
  });

  it('keeps the wrong credentials, offline and server error notices', () => {
    assert.deepStrictEqual(
      loginFailureNotice({ ok: false, error: 'UNAUTHORIZED', status: 401, message: 'Email o contraseña incorrectos' }),
      { title: 'No pudimos iniciar sesión', message: 'Email o contraseña incorrectos', tone: 'danger' }
    );
    assert.deepStrictEqual(loginFailureNotice({ ok: false, error: 'UNAUTHORIZED', status: 401 }), {
      title: 'No pudimos iniciar sesión',
      message: 'Email o contraseña incorrectos',
      tone: 'danger',
    });
    assert.deepStrictEqual(loginFailureNotice({ ok: false, error: 'NETWORK' }), {
      title: 'Sin conexión',
      message: OFFLINE_LOGIN_MESSAGE,
      tone: 'warning',
    });
    assert.deepStrictEqual(loginFailureNotice({ ok: false, error: 'HTTP', status: 500, message: 'Error interno.' }), {
      title: 'Error del servidor',
      message: 'Error interno.',
      tone: 'danger',
    });
    assert.deepStrictEqual(loginFailureNotice({ ok: false, error: 'INVALID_RESPONSE', status: 200 }), {
      title: 'Error del servidor',
      message: SERVER_FALLBACK_MESSAGE,
      tone: 'danger',
    });
  });
});
