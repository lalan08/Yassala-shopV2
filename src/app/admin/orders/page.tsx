"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function OrdersRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter");

  useEffect(() => {
    if (filter) {
      router.replace(`/admin?tab=orders&filter=${filter}`);
    } else {
      router.replace("/admin?tab=orders");
    }
  }, [filter, router]);

  return null;
}

export default function AdminOrdersPage() {
  return (
    <Suspense>
      <OrdersRedirect />
    </Suspense>
  );
}
