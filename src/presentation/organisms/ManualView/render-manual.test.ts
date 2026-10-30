import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderManual, slugifyHeading } from './render-manual';

const SAMPLE = [
  '# Manual de prueba',
  '',
  '> Nota inicial.',
  '',
  '## 1. Qué es Hoop',
  '',
  'Ver [sección 2](#2-inicio-rápido).',
  '',
  '## 2. Inicio rápido',
  '',
  '### Inicio de sesión (`/login`)',
  '',
  '### Preguntas & respuestas',
  '',
  '#### Detalle',
  '',
  '### Requisitos',
  '',
  '## Requisitos',
  '',
  '| Rol | Permiso |',
  '| --- | --- |',
  '| Coach | `MANAGE_LINEUP` |',
].join('\n');

describe('slugifyHeading', () => {
  it('builds GitHub-style slugs that keep accented letters', () => {
    assert.strictEqual(slugifyHeading('7. Datos, persistencia y sincronización'), '7-datos-persistencia-y-sincronización');
    assert.strictEqual(slugifyHeading('Inicio de sesión (/login)'), 'inicio-de-sesión-login');
    assert.strictEqual(slugifyHeading('Preguntas & respuestas'), 'preguntas--respuestas');
  });
});

describe('renderManual', () => {
  it('takes the first h1 as the title and leaves it out of the body', () => {
    const manual = renderManual(SAMPLE);
    assert.strictEqual(manual.title, 'Manual de prueba');
    assert.ok(!manual.html.includes('<h1'));
    assert.ok(manual.html.includes('<blockquote>'));
  });

  it('gives every heading a stable id and lists h2/h3 in the table of contents', () => {
    const manual = renderManual(SAMPLE);
    assert.deepStrictEqual(manual.toc, [
      { id: '1-qué-es-hoop', text: '1. Qué es Hoop', depth: 2 },
      { id: '2-inicio-rápido', text: '2. Inicio rápido', depth: 2 },
      { id: 'inicio-de-sesión-login', text: 'Inicio de sesión (/login)', depth: 3 },
      { id: 'preguntas--respuestas', text: 'Preguntas & respuestas', depth: 3 },
      { id: 'requisitos', text: 'Requisitos', depth: 3 },
      { id: 'requisitos-1', text: 'Requisitos', depth: 2 },
    ]);
    assert.ok(manual.html.includes('<h3 id="inicio-de-sesión-login">Inicio de sesión (<code>/login</code>)</h3>'));
    assert.ok(manual.html.includes('<h4 id="detalle">Detalle</h4>'));
    assert.ok(manual.html.includes('<a href="#2-inicio-rápido">sección 2</a>'));
  });

  it('renders GFM tables inside a horizontal scroll wrapper', () => {
    const { html } = renderManual(SAMPLE);
    assert.match(html, /<div data-table-scroll="" tabindex="0"><table>\s*<thead>/);
    assert.ok(html.includes('<td><code>MANAGE_LINEUP</code></td>'));
  });

  it('escapes raw HTML instead of passing it through', () => {
    const { html } = renderManual('Texto con <b>negrita</b>.\n\n<div class="x">bloque</div>\n');
    assert.ok(!html.includes('<b>'));
    assert.ok(!html.includes('<div class="x">'));
    assert.ok(html.includes('&lt;b&gt;negrita&lt;/b&gt;'));
    assert.ok(html.includes('&lt;div class=&quot;x&quot;&gt;bloque&lt;/div&gt;'));
  });

  it('resolves every in-document link of docs/MANUAL.md to a heading id', () => {
    const markdown = readFileSync(join(process.cwd(), 'docs', 'MANUAL.md'), 'utf8');
    const { html, toc, title } = renderManual(markdown);
    assert.ok(title && title.length > 0);
    assert.ok(toc.length > 10);

    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    assert.ok(anchors.length > 0);
    const broken = anchors.filter((anchor) => !ids.has(anchor));
    assert.deepStrictEqual(broken, []);
  });
});
