/*
 * Every tab opens the same way: a firm sans title with a quiet line
 * under it on the left, the view's one main action on the right.
 */
export default function PageHeader({ title, subtitle, action, children }) {
  return (
    <div className="on-scene">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] sm:text-[36px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/* a row of headline figures under a page title */
export function StatRow({ items, layout = 'row' }) {
  return (
    <dl className={`mt-6 grid grid-cols-2 gap-x-10 gap-y-4 ${layout === 'row' ? 'sm:flex sm:flex-wrap' : 'sm:flex sm:flex-wrap lg:grid lg:gap-x-6 lg:gap-y-5'}`}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="eyebrow">{it.label}</dt>
          <dd className={`mt-1 text-lg sm:text-[22px] sm:leading-7 font-medium tracking-[-0.02em] tnum ${it.tone || 'text-ink'}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
