import Header from "@/components/Header";
import AlertBanner from "@/components/AlertBanner";

export default function DatarensLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <AlertBanner />
      {children}
    </>
  );
}
