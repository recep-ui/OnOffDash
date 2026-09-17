import React from 'react';

export default function Button({
  children,
  variant = 'primary', // primary, secondary, ghost, danger, outline-danger
  size = 'md', // sm, md, lg, xs, icon
  icon: Icon,
  className = '',
  disabled = false,
  onClick,
  type = 'button',
  style,
  title,
  id
}) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'xs' ? 'btn-xs' : size === 'icon' ? 'btn-icon' : '';
  const variantClass = `btn-${variant}`;

  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) return Icon;
    const Comp = Icon;
    return <Comp size={size === 'sm' || size === 'xs' ? 14 : 16} />;
  };

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
      title={title}
      id={id}
    >
      {renderIcon()}
      {children}
    </button>
  );
}
