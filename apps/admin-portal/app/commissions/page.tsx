"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — Tax & Commission workbench lives under /tax-commission. */
export default function CommissionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tax-commission/rate-card");
  }, [router]);
  return null;
}
