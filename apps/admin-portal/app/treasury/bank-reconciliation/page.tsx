import { redirect } from "next/navigation";

export default function BankReconciliationRedirect() {
  redirect("/treasury/bank?tab=reconciliation");
}
