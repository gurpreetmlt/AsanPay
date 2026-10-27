"use client";

import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { CommissionWorkbench } from "@/components/commission/CommissionWorkbench";

export default function TaxCommissionTaxPage() {
  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="tax" />
        <CommissionWorkbench tab="tax" />
      </div>
    </AdminShell>
  );
}
