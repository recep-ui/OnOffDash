export default function Card({ children, className = '', header, title, subtitle, actions, footer, style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(header || title || actions) && (
        <div className="card-header">
          {header ? (
            header
          ) : (
            <>
              <div className="card-title-group">
                {title && <h3 className="card-title">{title}</h3>}
                {subtitle && <p className="card-subtitle">{subtitle}</p>}
              </div>
              {actions && <div className="card-actions">{actions}</div>}
            </>
          )}
        </div>
      )}
      <div className="card-body">
        {children}
      </div>
      {footer && (
        <div className="card-footer">
          {footer}
        </div>
      )}
    </div>
  );
}
