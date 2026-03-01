import { redirect } from "next/navigation";

export default function AdminArticlesRedirect() {
  redirect("/articles");
}
