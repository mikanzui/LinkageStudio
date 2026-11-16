// Domain glyphs recovered from the pre-rebuild v16 toolbar (9954fca).
type IconProps = { size?: number };

export function DrawIcon({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <polygon points="8,1 14,5 12,13 4,13 2,5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>;
}

export function OutlineIcon({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <line x1="2.5" y1="11.5" x2="13.5" y2="4.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
  </svg>;
}

export function RectangleIcon({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="3" width="12" height="10" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>;
}

export function CircleIcon({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
  </svg>;
}

export function NgonIcon({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <polygon points="8,1.5 14,5 13,12 3,12 2,5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>;
}

export function TrimIcon({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <line x1="2" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <line x1="14" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="5" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="11" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>;
}

export function SpringIcon({ size = 17 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 8c0-1 1-1.5 2-1.5s2 1 2 2 1 2 2 2 2-1 2-2 1-2 2-2 2 0.5 2 1.5" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="2" cy="8" r="1.1" fill="currentColor" />
    <circle cx="14" cy="8" r="1.1" fill="currentColor" />
  </svg>;
}

export function DamperIcon({ size = 17 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <line x1="1.5" y1="8" x2="4.5" y2="8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    <rect x="4.5" y="5" width="7" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
    <line x1="11.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
  </svg>;
}

export function TorsionIcon({ size = 17 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <line x1="8" y1="2.5" x2="8" y2="7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <line x1="8" y1="7" x2="12.5" y2="11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <line x1="8" y1="7" x2="3.5" y2="11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <path d="M 9.8 5.2 A 2.2 2.2 0 0 1 6.2 5.2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>;
}

export function ForceSensorIcon({ size = 17 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.4" />
    <polyline points="3,12 5,8 7,10 9,4 11,9 13,6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="2" cy="8" r="1.5" fill="currentColor" />
    <circle cx="14" cy="8" r="1.5" fill="currentColor" />
  </svg>;
}
