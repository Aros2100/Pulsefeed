import 'flag-icons/css/flag-icons.min.css';
import Header from "@/components/Header";
import AlertBanner from "@/components/AlertBanner";

export default function AdminWithHeaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <AlertBanner />
      {children}
    </>
  );
}
