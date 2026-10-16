"use client";

import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { CommissionWorkbench } from "@/components/commission/CommissionWorkbench";

export default function TaxCommissionPayoutsPage() {
  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="taxCommission" />
        <CommissionWorkbench tab="payouts" />
      </div>
    </AdminShell>
  );
}
