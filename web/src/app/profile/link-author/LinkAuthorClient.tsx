"use client";

import { useRouter } from "next/navigation";
import AuthorSearch from "@/components/AuthorSearch";

export default function LinkAuthorClient() {
  const router = useRouter();

  async function handleSelect(authorId: string) {
    const res = await fetch("/api/users/author", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author_id: authorId }),
    });

    const data = (await res.json()) as { ok: boolean; error?: string };
    if (data.ok) {
      router.replace("/");
    }
  }

  return (
    <AuthorSearch
      onSelect={handleSelect}
      onSkip={() => router.replace("/")}
      skipLabel="Skip — I'm not a published author"
    />
  );
}
