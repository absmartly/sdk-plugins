import { DOMChange } from '../types';

/**
 * Whether a change is switched off. `disabled` is the canonical flag (written by
 * the browser extension); `enabled: false` is the deprecated form. When both are
 * set, `disabled` wins.
 */
export function isChangeDisabled(change: Pick<DOMChange, 'disabled' | 'enabled'>): boolean {
  return change.disabled ?? change.enabled === false;
}
