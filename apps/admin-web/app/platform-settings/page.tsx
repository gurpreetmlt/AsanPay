import { redirect } from "next/navigation";

/** Old path — keep bookmark/deploy links working. */
export default function PlatformSettingsRedirect() {
  redirect("/treasury-settings");
}
