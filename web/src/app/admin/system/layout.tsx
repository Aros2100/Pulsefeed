import SystemNav from "./SystemNav";

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SystemNav />
      {children}
    </>
  );
}
