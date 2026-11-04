'use client';

import { useCallback, useState } from 'react';

/** Open state of a create/edit sheet; `item` is kept while the sheet animates out. */
export function useEditModal<T>() {
  const [state, setState] = useState<{ isOpen: boolean; item: T | null }>({ isOpen: false, item: null });

  /** Opens the sheet to edit `item`, or to create when null. */
  const open = useCallback((item: T | null) => setState({ isOpen: true, item }), []);
  const close = useCallback(() => setState((current) => ({ ...current, isOpen: false })), []);

  return { isOpen: state.isOpen, item: state.item, open, close };
}
