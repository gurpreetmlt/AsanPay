"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — Tax & Commission workbench lives under /tax-commission. */
export default function CommissionRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tax-commission/schemes");
  }, [router]);
  return null;
}
