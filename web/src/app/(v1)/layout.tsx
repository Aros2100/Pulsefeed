import { Footer } from "@/components/layout/Footer";

export default function V1Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  );
}
