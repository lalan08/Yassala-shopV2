import { redirect } from "next/navigation";

// Yassala Day is now unified — use /admin/commerces and /admin/catalogue
export default function YassalaDayRedirect() {
  redirect("/admin/commerces");
}
