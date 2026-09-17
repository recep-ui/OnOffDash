import React from 'react';
import { FolderOpen } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  icon: Icon = FolderOpen,
  title = 'Kayıt bulunamadı',
  description = 'Görüntülenecek veri bulunmuyor.',
  actionLabel,
  onAction,
  actionIcon
}) {
  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) return Icon;
    const Comp = Icon;
    return <Comp size={28} strokeWidth={1.5} />;
  };

  return (
    <div className="empty-state-box">
      <div className="empty-state-icon">
        {renderIcon()}
      </div>
      <h4 className="empty-state-title">{title}</h4>
      <p className="empty-state-desc">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" variant="secondary" icon={actionIcon} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
