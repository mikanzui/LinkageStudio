import type { KeyboardEvent } from 'react';

/** Native modality owns inertness; wrap its keyboard endpoints within the app. */
export function containDialogTab(event: KeyboardEvent<HTMLDialogElement>): void {
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
  const dialog = event.currentTarget;
  const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]')]
    .filter(el => el.tabIndex >= 0 && el.getClientRects().length && el.getAttribute('aria-disabled') !== 'true');
  const first = controls[0], last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
  const current = document.activeElement;
  if (!dialog.contains(current) || (event.shiftKey ? current === first : current === last)) {
    event.preventDefault(); (event.shiftKey ? last : first).focus();
  }
}
