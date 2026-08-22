"use client";

import { useState } from "react";
import { uploadLeadsFile, createBatch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export function ComposeModal({
  idToken,
  senders,
  onClose,
  onScheduled,
}: {
  idToken: string;
  senders: string[];
  onClose: () => void;
  onScheduled: () => void;
}) {
  const { showError, showSuccess } = useToast();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderEmail, setSenderEmail] = useState(senders[0] ?? "");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000); // default: 5 min from now
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const emails = await uploadLeadsFile(idToken, file);
      setRecipients(emails);
      if (emails.length === 0) {
        setFormError("No email addresses were found in that file.");
      } else {
        setFormError(null);
      }
    } catch (err) {
      showError("Could not parse that file for email addresses.");
    }
  }

  async function handleSubmit() {
    if (!subject || !body || recipients.length === 0 || !senderEmail) {
      setFormError("Subject, body, sender, and at least one recipient are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await createBatch(idToken, {
        subject,
        body,
        senderEmail,
        recipients,
        startTime: new Date(startTime).toISOString(),
        delayMs: delaySeconds * 1000,
        hourlyLimit,
      });
      showSuccess(`Scheduled ${result.scheduled} email(s).`);
      onScheduled();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to schedule batch");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Compose New Email</h2>

        <div className="flex flex-col gap-4">
          <Field label="Sender">
            <Select value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)}>
              {senders.length === 0 && <option value="">No senders configured</option>}
              {senders.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick question about {{company}}"
            />
          </Field>

          <Field label="Body">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Hi there, ..." />
          </Field>

          <Field label="Leads (CSV or TXT of emails)">
            <input type="file" accept=".csv,.txt" onChange={handleFile} className="text-sm" />
            {fileName && (
              <p className="mt-1 text-xs text-slate-500">
                {fileName} — {recipients.length} email address{recipients.length === 1 ? "" : "es"} detected
              </p>
            )}
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Start time">
              <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="Delay (sec)">
              <Input
                type="number"
                min={0}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
              />
            </Field>
            <Field label="Hourly limit">
              <Input
                type="number"
                min={1}
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
              />
            </Field>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Scheduling…" : "Schedule"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
