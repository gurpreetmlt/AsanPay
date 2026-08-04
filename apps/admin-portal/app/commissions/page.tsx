"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy path — scheme builder lives at /commission. */
export default function CommissionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/commission");
  }, [router]);
  return null;
}
