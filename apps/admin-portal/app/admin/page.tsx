import { redirect } from "next/navigation";

/** Convenience: /admin → login (people often type this URL). */
export default function AdminAliasPage() {
  redirect("/login");
}
