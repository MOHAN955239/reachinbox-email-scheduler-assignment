import { EmailJobRow } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { DataTable, Column } from "./ui/DataTable";

const columns: Column<EmailJobRow>[] = [
  { header: "Email", render: (row) => row.recipient },
  { header: "Subject", render: (row) => <span className="text-slate-600">{row.subject}</span> },
  {
    header: "Scheduled time",
    render: (row) => <span className="text-slate-600">{new Date(row.scheduledAt).toLocaleString()}</span>,
  },
  { header: "Status", render: (row) => <StatusBadge status={row.status} /> },
];

export function ScheduledTable({ rows, loading }: { rows: EmailJobRow[]; loading: boolean }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={loading}
      loadingLabel="Loading scheduled emails…"
      emptyTitle="No scheduled emails yet"
      emptySubtitle='Click "Compose New Email" to schedule your first batch.'
    />
  );
}
