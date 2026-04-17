export default function ComingSoonPage() {
  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      color: "#1a1a1a",
      textAlign: "center",
      padding: "40px 24px",
    }}>
      <div style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px" }}>
        Coming soon
      </div>
      <div style={{ fontSize: "14px", color: "#888", lineHeight: 1.6, maxWidth: "400px" }}>
        Your personalised PulseFeed is being prepared.
      </div>
    </div>
  );
}
