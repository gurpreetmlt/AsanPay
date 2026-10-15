import { redirect } from "next/navigation";

export default function FundRequestsRedirect() {
  redirect("/treasury/bank?tab=fund-requests");
}
