// V2 layout — navigation is handled by the root AppShell (UserHeader + main wrapper).
// This layout is a passthrough; it exists to mark the (v2) route group boundary.
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
