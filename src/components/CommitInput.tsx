import { useRef, useState } from 'react';

export function CommitInput({ label, value, numeric = false, min, max, commit }: {
  label: string; value: string | number; numeric?: boolean; min?: number; max?: number; commit(value: string): void;
}) {
  const [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);
  return <input aria-label={label} type={numeric ? 'number' : 'text'} value={draft} min={min} max={max} step={numeric ? 'any' : undefined}
    onFocus={() => { cancelled.current = false; }} onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      const n = Number(draft);
      if (!cancelled.current && draft.trim() && (!numeric || (Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)))) commit(draft.trim());
      setDraft(String(value));
    }}
    onKeyDown={event => { if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); cancelled.current = event.key === 'Escape'; event.currentTarget.blur(); } }}/>
}
