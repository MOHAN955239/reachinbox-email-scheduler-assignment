import { ReactNode } from "react";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  loadingLabel,
  emptyTitle,
  emptySubtitle,
}: {
  columns: Column<T>[];
  rows: T[];
  loading: boolean;
  loadingLabel: string;
  emptyTitle: string;
  emptySubtitle: string;
}) {
  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">{loadingLabel}</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 p-12 text-center">
        <p className="text-sm font-medium text-slate-600">{emptyTitle}</p>
        <p className="text-xs text-slate-400">{emptySubtitle}</p>
      </div>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 text-xs uppercase text-slate-400">
        <tr>
          {columns.map((col) => (
            <th key={col.header} className="px-4 py-2">
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
            {columns.map((col) => (
              <td key={col.header} className="px-4 py-2">
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
