import { EmailJobRow } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { DataTable, Column } from "./ui/DataTable";

const columns: Column<EmailJobRow>[] = [
  { header: "Email", render: (row) => row.recipient },
  { header: "Subject", render: (row) => <span className="text-slate-600">{row.subject}</span> },
  {
    header: "Sent time",
    render: (row) => (
      <span className="text-slate-600">{row.sentAt ? new Date(row.sentAt).toLocaleString() : "—"}</span>
    ),
  },
  { header: "Status", render: (row) => <StatusBadge status={row.status} /> },
];

export function SentTable({ rows, loading }: { rows: EmailJobRow[]; loading: boolean }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={loading}
      loadingLabel="Loading sent emails…"
      emptyTitle="No sent emails yet"
      emptySubtitle="Sent and failed emails will show up here."
    />
  );
}
