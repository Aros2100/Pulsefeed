export default function AccountDeletedPage() {
  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      minHeight: "100vh", background: "#EDF5F8",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "2rem",
    }}>
      <div style={{ maxWidth: "480px", textAlign: "center" }}>
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "28px", lineHeight: 1.3, color: "#1a1a1a", marginBottom: "16px",
        }}>
          Your account has been deleted
        </div>
        <div style={{ fontSize: "15px", color: "#64748b", lineHeight: 1.6, marginBottom: "32px" }}>
          Your personal data has been permanently removed. Thank you for being part of PulseFeeds.
        </div>
        <a
          href="/register"
          style={{
            fontSize: "13px", fontWeight: 500, color: "#D94A43",
            textDecoration: "underline",
          }}
        >
          Sign up again →
        </a>
      </div>
    </div>
  );
}
