export default function PriceChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-slate-500">No price history available for this address.</p>
    );
  }

  const sorted = [...history]
    .filter((h) => h.price && h.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (sorted.length === 0) {
    return <p className="text-sm text-slate-500">No price history available.</p>;
  }

  const w = 520;
  const h = 140;
  const padX = 16;
  const padY = 18;

  const xs = sorted.map((s) => new Date(s.date).getTime());
  const ys = sorted.map((s) => Number(s.price));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = Math.max(xMax - xMin, 1);
  const yRange = Math.max(yMax - yMin, 1);

  const scaleX = (t) => padX + ((t - xMin) / xRange) * (w - padX * 2);
  const scaleY = (v) => h - padY - ((v - yMin) / yRange) * (h - padY * 2);

  const linePath = sorted
    .map((s, i) => `${i === 0 ? 'M' : 'L'}${scaleX(new Date(s.date).getTime()).toFixed(1)},${scaleY(s.price).toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L${scaleX(xMax).toFixed(1)},${(h - padY).toFixed(1)} L${scaleX(xMin).toFixed(1)},${(h - padY).toFixed(1)} Z`;

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full">
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#185FA5" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#185FA5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#priceFill)" />
        <path d={linePath} fill="none" stroke="#185FA5" strokeWidth="2" />
        {sorted.map((s) => {
          const cx = scaleX(new Date(s.date).getTime());
          const cy = scaleY(s.price);
          return <circle key={`${s.date}-${s.price}`} cx={cx} cy={cy} r="3" fill="#185FA5" />;
        })}
      </svg>

      <ul className="grid gap-1 text-xs text-slate-600">
        {sorted.slice(-4).reverse().map((s) => (
          <li key={`${s.date}-${s.price}`} className="flex items-center justify-between">
            <span>{new Date(s.date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })}</span>
            <span className="font-semibold text-ink tabular-nums">
              {formatGBP(s.price)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatGBP(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}
