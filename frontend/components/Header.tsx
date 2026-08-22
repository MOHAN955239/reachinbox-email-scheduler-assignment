"use client";

import { signOut } from "next-auth/react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

export function Header({
  name,
  email,
  image,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-brand-600" />
        <span className="font-semibold">ReachInbox Scheduler</span>
      </div>

      <div className="flex items-center gap-3">
        {image ? (
          <Image src={image} alt={name ?? "avatar"} width={32} height={32} className="rounded-full" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-slate-200" />
        )}
        <div className="text-right leading-tight">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-slate-500">{email}</div>
        </div>
        <Button variant="secondary" className="ml-2" onClick={() => signOut({ callbackUrl: "/" })}>
          Logout
        </Button>
      </div>
    </header>
  );
}
