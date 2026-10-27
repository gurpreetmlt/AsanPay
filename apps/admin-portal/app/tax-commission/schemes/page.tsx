"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { CommissionWorkbench } from "@/components/commission/CommissionWorkbench";
import { SchemesCsvPanel } from "@/components/commission/SchemesCsvPanel";

function SchemesWorkbench() {
  const searchParams = useSearchParams();
  const serviceId = searchParams.get("serviceId")?.trim() || "";
  return <CommissionWorkbench tab="schemes" initialServiceId={serviceId} />;
}

export default function TaxCommissionSchemesPage() {
  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="commission" />
        <SchemesCsvPanel />
        <Suspense fallback={<p className="text-sm text-slate-500">Loading schemes…</p>}>
          <SchemesWorkbench />
        </Suspense>
      </div>
    </AdminShell>
  );
}
