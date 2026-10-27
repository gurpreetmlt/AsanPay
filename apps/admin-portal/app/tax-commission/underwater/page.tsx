import { redirect } from "next/navigation";

/** Retired: losses and ₹0 roles are the Rate card "Loss & missing" view. */
export default function UnderwaterRedirectPage() {
  redirect("/tax-commission/rate-card?view=loss");
}
