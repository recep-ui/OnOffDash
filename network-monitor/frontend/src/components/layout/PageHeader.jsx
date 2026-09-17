export default function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs = []
}) {
  return (
    <div className="page-header">
      <div className="page-title-group">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {crumb.onClick ? (
                  <span
                    onClick={crumb.onClick}
                    style={{ cursor: 'pointer', color: 'var(--primary)' }}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <span>{crumb.label}</span>
                )}
                {idx < breadcrumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </div>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div className="page-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
