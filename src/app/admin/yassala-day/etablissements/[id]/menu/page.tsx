import { redirect } from "next/navigation";
export default function Page({ params }: { params: { id: string } }) {
  redirect(`/admin/yassala-day/etablissements/${params.id}`);
}
