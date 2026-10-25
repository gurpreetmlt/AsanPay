import { redirect } from "next/navigation";

/** Old bookmark path — UPI QR and UPI Cash Point are the same service. */
export default function UpiQrPage() {
  redirect("/upi-cash-point");
}
