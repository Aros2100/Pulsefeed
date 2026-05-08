export function Footer() {
  return (
    <footer style={{
      background: "#334155",
      color: "rgba(255, 255, 255, 0.75)",
      padding: "28px 0",
      marginTop: "60px",
    }}>
      <div className="pf-page-container" style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "baseline",
        gap: "14px",
        fontSize: "12px",
        flexWrap: "wrap",
      }}>
        <span>© {new Date().getFullYear()} PulseFeeds</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <a href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</a>
        <span style={{ opacity: 0.4 }}>·</span>
        <a href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms</a>
        <span style={{ opacity: 0.4 }}>·</span>
        <a href="mailto:support@pulsefeeds.com" style={{ color: "inherit", textDecoration: "none" }}>support@pulsefeeds.com</a>
      </div>
    </footer>
  );
}
