import { useEffect, useState } from 'react';

function expandRangeToInclude(value: number, min: number, max: number): [number, number] {
  const tol = 1e-9;
  if (value >= min - tol && value <= max + tol) return [min, max];
  const span = Math.max(max - min, 1e-9);
  const pad = Math.max(span * 0.12, Math.abs(value) * 0.08, 1e-6);
  let lo = min;
  let hi = max;
  if (value < lo) lo = value - pad;
  if (value > hi) hi = value + pad;
  if (hi <= lo) hi = lo + Math.max(1e-6, Math.abs(value) * 0.01);
  return [lo, hi];
}

export type ParamSliderRowProps = {
  axisLabel: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
  defaultMin: number;
  defaultMax: number;
  step: number;
  clamp: (v: number) => number;
  integer?: boolean;
  /** When set, number field shows this many fractional digits (full precision still stored). */
  displayDecimals?: number;
  /** Optional tooltip / context for the whole row (e.g. parameter meaning). */
  rowTitle?: string;
};

export function ParamSliderRow({
  axisLabel,
  suffix,
  value,
  onChange,
  defaultMin,
  defaultMax,
  step,
  clamp,
  integer,
  displayDecimals,
  rowTitle,
}: ParamSliderRowProps) {
  const [range, setRange] = useState(() => {
    const [a, b] = expandRangeToInclude(value, defaultMin, defaultMax);
    return { min: a, max: b };
  });

  useEffect(() => {
    setRange((prev) => {
      if (value >= prev.min && value <= prev.max) return prev;
      const [a, b] = expandRangeToInclude(value, prev.min, prev.max);
      if (a === prev.min && b === prev.max) return prev;
      return { min: a, max: b };
    });
  }, [value]);

  const apply = (raw: number) => {
    let v = integer ? Math.round(raw) : raw;
    v = clamp(v);
    setRange((prev) => {
      const [a, b] = expandRangeToInclude(v, prev.min, prev.max);
      if (a === prev.min && b === prev.max) return prev;
      return { min: a, max: b };
    });
    onChange(v);
  };

  const { min: rmin, max: rmax } = range;
  const sliderVal = Math.min(rmax, Math.max(rmin, value));

  const displayValue =
    integer || displayDecimals == null
      ? integer
        ? Math.round(value)
        : value
      : Number(value.toFixed(displayDecimals));

  return (
    <div className="panel-param-slider-row" title={rowTitle}>
      <span className="panel-num-axis">{axisLabel}</span>
      <div className="panel-param-slider-body">
        <div className="panel-param-range-cell">
          <input
            className="panel-param-range-input"
            type="range"
            min={rmin}
            max={rmax}
            step={integer ? 1 : step}
            value={Number.isFinite(sliderVal) ? sliderVal : rmin}
            aria-label={axisLabel}
            title={`Range ${rmin}–${rmax} — typing a value outside grows the slider span`}
            onChange={(e) => apply(+e.target.value)}
          />
        </div>
        <div className="panel-param-value-suffix">
          <label className="panel-param-slider-num">
            <input
              type="number"
              step={step}
              value={displayValue}
              aria-label={`${axisLabel} value`}
              title={`Range ${rmin}–${rmax}`}
              onChange={(e) => {
                const x = parseFloat(e.target.value);
                if (Number.isNaN(x)) return;
                apply(x);
              }}
            />
          </label>
          <span className="panel-param-suffix">{suffix}</span>
        </div>
      </div>
    </div>
  );
}
