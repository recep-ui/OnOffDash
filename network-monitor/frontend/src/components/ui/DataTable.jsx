import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import EmptyState from './EmptyState';

export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  onRowClick,
  emptyTitle = 'Kayıt bulunamadı',
  emptyDescription = 'Görüntülenecek veri bulunmuyor.',
  emptyIcon,
  pagination = true,
  pageSize = 15,
  initialSortField,
  initialSortDirection = 'asc',
  toolbarLeft,
  toolbarRight,
  className = ''
}) {
  const [sortField, setSortField] = useState(initialSortField || (columns[0]?.key || ''));
  const [sortDir, setSortDir] = useState(initialSortDirection);
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (key, sortable) => {
    if (!sortable) return;
    if (sortField === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(key);
      setSortDir('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortField) return 0;
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (aVal === null || aVal === undefined) aVal = '';
    if (bVal === null || bVal === undefined) bVal = '';

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal, 'tr') : bVal.localeCompare(aVal, 'tr');
    }
    return sortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const totalPages = pagination ? Math.max(1, Math.ceil(sortedData.length / pageSize)) : 1;
  const paginatedData = pagination
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData;

  return (
    <div className={`table-wrapper ${className}`}>
      {(toolbarLeft || toolbarRight) && (
        <div className="table-toolbar">
          <div className="table-toolbar-left">{toolbarLeft}</div>
          <div className="table-toolbar-right">{toolbarRight}</div>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    style={{ width: col.width, textAlign: col.align || 'left' }}
                    className={col.sortable !== false ? 'sortable' : ''}
                    onClick={() => handleSort(col.key, col.sortable !== false)}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {col.label}
                      {col.sortable !== false && sortField === col.key && (
                        sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, idx) => (
                <tr
                  key={row[keyField] || idx}
                  className={onRowClick ? 'row-clickable' : ''}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map(col => (
                    <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                      {col.render ? col.render(row[col.key], row, idx) : (row[col.key] !== null && row[col.key] !== undefined ? row[col.key] : '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && data.length > pageSize && (
        <div className="table-pagination">
          <div>
            Toplam <strong>{data.length}</strong> kayıt • Sayfa <strong>{currentPage}</strong> / {totalPages}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-secondary btn-xs"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            >
              <ChevronLeft size={14} /> Önceki
            </button>
            <button
              className="btn btn-secondary btn-xs"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              Sonraki <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
