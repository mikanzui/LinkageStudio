import { useRef, useState } from 'react';
import { numberDraft } from '../utils/number-draft';

export function CommitInput({ label, value, numeric = false, min, max, commit }: {
  label: string; value: string | number; numeric?: boolean; min?: number; max?: number; commit(value: string): void;
}) {
  const formatted = numeric && typeof value === 'number' ? numberDraft(value) : String(value);
  const [draft, setDraft] = useState(formatted);
  const cancelled = useRef(false);
  return <input aria-label={label} type={numeric ? 'number' : 'text'} value={draft} min={min} max={max} step={numeric ? 'any' : undefined}
    onFocus={() => { cancelled.current = false; }} onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      const n = Number(draft);
      if (!cancelled.current && draft.trim() !== formatted && (!numeric || (draft.trim() !== '' && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)))) commit(draft.trim());
      setDraft(formatted);
    }}
    onKeyDown={event => { if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); cancelled.current = event.key === 'Escape'; event.currentTarget.blur(); } }}/>
}
