/*
 * Every tab opens the same way: a firm sans title with a quiet line
 * under it on the left, the view's one main action on the right.
 */
export default function PageHeader({ title, subtitle, action, children, figuresBeside = false, titleOnlyOnPhone = false }) {
  // figuresBeside: on desktop the figures sit to the right of the title (saves height)
  // titleOnlyOnPhone: on phones the subtitle and figures are shown by the page further down
  return (
    <div className={`on-scene ${figuresBeside ? 'lg:flex lg:items-end lg:justify-between lg:gap-10' : ''}`}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] sm:text-[36px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink">{title}</h1>
          {subtitle && <p className={`mt-2 text-sm text-ink-2 ${titleOnlyOnPhone ? 'max-sm:hidden' : ''}`}>{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {titleOnlyOnPhone ? <div className="max-sm:hidden lg:flex-shrink-0">{children}</div> : children}
    </div>
  );
}

/* a row of headline figures under a page title */
export function StatRow({ items, layout = 'row', className = '' }) {
  return (
    <dl className={`mt-6 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-10 gap-y-4 ${layout === 'row' ? 'sm:flex sm:flex-wrap' : 'sm:flex sm:flex-wrap lg:grid lg:gap-x-6 lg:gap-y-5'} ${className}`}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0 max-w-full">
          <dt className="eyebrow">{it.label}</dt>
          <dd className={`mt-1 text-lg sm:text-[22px] sm:leading-7 font-medium tracking-[-0.02em] tnum ${it.tone || 'text-ink'}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
