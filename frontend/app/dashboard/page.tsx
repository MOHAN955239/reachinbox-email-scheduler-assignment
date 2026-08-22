"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { ScheduledTable } from "@/components/ScheduledTable";
import { SentTable } from "@/components/SentTable";
import { ComposeModal } from "@/components/ComposeModal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { fetchScheduled, fetchSent, fetchSenders } from "@/lib/api";
import { EmailJobRow } from "@/types";

type Tab = "scheduled" | "sent";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showError } = useToast();

  const [tab, setTab] = useState<Tab>("scheduled");
  const [scheduled, setScheduled] = useState<EmailJobRow[]>([]);
  const [sent, setSent] = useState<EmailJobRow[]>([]);
  const [senders, setSenders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const idToken = session?.idToken;

  const refresh = useCallback(async () => {
    if (!idToken) return;
    setLoading(true);
    try {
      const [s, se] = await Promise.all([fetchScheduled(idToken), fetchSent(idToken)]);
      setScheduled(s);
      setSent(se);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }, [idToken, showError]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!idToken) return;
    refresh();
    fetchSenders(idToken)
      .then(setSenders)
      .catch(() => showError("Could not load configured senders from the backend."));

    // Light polling so the dashboard reflects worker progress without a
    // websocket layer — cheap given the modest row counts involved here.
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken]);

  if (status === "loading" || !session) {
    return <div className="p-8 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen">
      <Header name={session.user?.name} email={session.user?.email} image={session.user?.image} />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setTab("scheduled")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === "scheduled" ? "bg-white shadow-sm" : "text-slate-500"
              }`}
            >
              Scheduled Emails
            </button>
            <button
              onClick={() => setTab("sent")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === "sent" ? "bg-white shadow-sm" : "text-slate-500"
              }`}
            >
              Sent Emails
            </button>
          </div>

          <Button onClick={() => setComposeOpen(true)}>+ Compose New Email</Button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          {tab === "scheduled" ? (
            <ScheduledTable rows={scheduled} loading={loading} />
          ) : (
            <SentTable rows={sent} loading={loading} />
          )}
        </div>
      </main>

      {composeOpen && idToken && (
        <ComposeModal
          idToken={idToken}
          senders={senders}
          onClose={() => setComposeOpen(false)}
          onScheduled={refresh}
        />
      )}
    </div>
  );
}
