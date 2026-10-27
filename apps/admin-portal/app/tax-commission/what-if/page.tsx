import { redirect } from "next/navigation";

/** Retired: the Rate card preview uses the live payout math. */
export default function WhatIfRedirectPage() {
  redirect("/tax-commission/rate-card");
}
