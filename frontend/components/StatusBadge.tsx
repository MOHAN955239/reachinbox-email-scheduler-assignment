import { EmailStatus } from "@/types";

const STYLES: Record<EmailStatus, string> = {
  SCHEDULED: "bg-slate-100 text-slate-600",
  QUEUED: "bg-blue-50 text-blue-600",
  PROCESSING: "bg-amber-50 text-amber-700",
  RESCHEDULED: "bg-purple-50 text-purple-700",
  SENT: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {status}
    </span>
  );
}
