"use client";

import { useState } from "react";
import ProfileEditClient from "./ProfileEditClient";
import ProfilePrivacyClient from "./ProfilePrivacyClient";

interface Props {
  email:                     string;
  initialName:               string;
  initialSpecialtySlugs:     string[];
  initialIsPublic:           boolean;
  initialEmailNotifications: boolean;
  articleCount:              number;
  specialtyLabels:           Record<string, string>;
  // Read-only info fields
  roleType:    string | null;
  authorCity:  string | null;
  authorCountry: string | null;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
      {children}
    </div>
  );
}

function CardHeader({ label }: { label: string }) {
  return (
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 24px", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ fontSize: "12px", color: "#888", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>{value}</div>
    </div>
  );
}

function roleLabel(roleType: string | null): string | null {
  if (roleType === "clinician")  return "Clinician";
  if (roleType === "researcher") return "Researcher";
  if (roleType === "both")       return "Clinician & Researcher";
  return null;
}

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "28px",
};

export default function ProfileClient({
  email,
  initialName,
  initialSpecialtySlugs,
  initialIsPublic,
  initialEmailNotifications,
  articleCount,
  specialtyLabels,
  roleType,
  authorCity,
  authorCountry,
}: Props) {
  const [name,          setName]          = useState(initialName);
  const [specialtySlugs, setSpecialtySlugs] = useState(initialSpecialtySlugs);

  const role = roleLabel(roleType);

  return (
    <>
      {/* ── Account card ─────────────────────────────────── */}
      <SectionLabel>Account</SectionLabel>
      <div style={card}>
        <CardHeader label="Personal information" />
        <div style={{ padding: "4px 0 0" }}>
          <InfoRow label="Email" value={email} />
          {role           && <InfoRow label="Role"    value={role} />}
          {authorCity     && <InfoRow label="City"    value={authorCity} />}
          {authorCountry  && <InfoRow label="Country" value={authorCountry} />}
          <ProfileEditClient
            initialName={name}
            initialSpecialtySlugs={specialtySlugs}
            onNameSaved={setName}
            onSpecialtiesSaved={setSpecialtySlugs}
          />
        </div>
      </div>

      {/* ── Privacy & Notifications card ─────────────────── */}
      <SectionLabel>Privacy & Notifications</SectionLabel>
      <div style={card}>
        <CardHeader label="Profile visibility" />
        <ProfilePrivacyClient
          initialIsPublic={initialIsPublic}
          initialEmailNotifications={initialEmailNotifications}
          name={name}
          specialtySlugs={specialtySlugs}
          articleCount={articleCount}
          specialtyLabels={specialtyLabels}
        />
      </div>
    </>
  );
}
