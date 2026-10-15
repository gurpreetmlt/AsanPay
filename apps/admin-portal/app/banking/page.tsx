import { redirect } from "next/navigation";

export default function BankingRedirect() {
  redirect("/treasury/bank?tab=bank-accounts");
}
