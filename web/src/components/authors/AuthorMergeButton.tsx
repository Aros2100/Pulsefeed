"use client";

import { useRouter } from "next/navigation";

interface Props {
  authorId: string;
  userAuthorId: string | null;
}

export default function AuthorMergeButton({ authorId, userAuthorId }: Props) {
  const router = useRouter();

  if (!userAuthorId || userAuthorId === authorId) return null;

  return (
    <button
      type="button"
      onClick={() => router.push(`/profile/merge?candidate=${authorId}`)}
      style={{
        fontSize: "12px",
        color: "#5a6a85",
        border: "1px solid #dde3ed",
        borderRadius: "6px",
        padding: "4px 10px",
        background: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        fontWeight: 500,
      }}
    >
      Det er mig
    </button>
  );
}
