import { redirect } from "next/navigation";

// Admin root redirects to dashboard
export default function AdminRoot() {
  redirect("/admin/dashboard");
}
