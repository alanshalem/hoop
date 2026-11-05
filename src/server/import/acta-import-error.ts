import 'server-only';

export class ActaImportError extends Error {
  constructor(readonly problems: string[]) {
    super(`The match reports cannot be imported:\n- ${problems.join('\n- ')}`);
    this.name = 'ActaImportError';
  }
}
