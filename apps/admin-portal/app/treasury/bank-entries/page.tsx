import { redirect } from "next/navigation";

export default function BankEntriesRedirect() {
  redirect("/treasury/bank?tab=bank-entries");
}
