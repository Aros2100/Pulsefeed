"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toggle } from "@/app/(v2)/profile/ProfileEditClient";
import { createClient } from "@/lib/supabase/client";

interface Props {
  email: string;
  initialNewEmail: string | null;
  initialFirstName: string | null;
  initialLastName: string | null;
  initialTitle: string | null;
  initialSubspecialties: string[];
  initialEmailNotifications: boolean;
  subspecialties: string[];
}

const HAIRLINE = "0.5px solid #e5e9f0";

async function patchProfile(data: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

function Card({ children, mb = true }: { children: React.ReactNode; mb?: boolean }) {
  return (
    <div style={{
      background: "#fff", border: HAIRLINE,
      borderRadius: "12px", marginBottom: mb ? "28px" : 0,
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      marginBottom: "10px",
    }}>
      <div style={{
        fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
        color: "#94a3b8", fontWeight: 500,
      }}>
        {label}
      </div>
      {right}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "11px", letterSpacing: "0.04em", textTransform: "uppercase",
      color: "#94a3b8", fontWeight: 500, marginBottom: "4px",
    }}>
      {children}
    </div>
  );
}

function EditLink({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} style={{
      fontSize: "12px", fontWeight: 500, color: "#D94A43",
      background: "none", border: "none", cursor: "pointer",
      padding: 0, fontFamily: "inherit",
    }}>
      {label}
    </button>
  );
}

function EditingTag() {
  return <span style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>Editing</span>;
}

function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "14px 24px", borderTop: HAIRLINE,
      background: "#FAFBFC", borderRadius: "0 0 12px 12px",
      display: "flex", flexDirection: "column", gap: "8px",
    }}>
      {children}
    </div>
  );
}

function FooterButtons({
  onCancel, onSave, saving, saveLabel = "Save",
}: {
  onCancel: () => void; onSave: () => void;
  saving?: boolean; saveLabel?: string;
}) {
  return (
    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
      <button onClick={onCancel} style={{
        fontSize: "12px", padding: "8px 16px", borderRadius: "8px",
        background: "transparent", color: "#64748b", border: HAIRLINE,
        cursor: "pointer", fontFamily: "inherit",
      }}>
        Cancel
      </button>
      <button onClick={onSave} disabled={saving} style={{
        fontSize: "12px", padding: "8px 18px", borderRadius: "8px",
        background: "#1A1A1A", color: "#fff", border: "none",
        cursor: saving ? "default" : "pointer",
        fontWeight: 500, fontFamily: "inherit",
      }}>
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function minutesAgoText(since: Date): string {
  const mins = Math.round((Date.now() - since.getTime()) / 60000);
  if (mins < 1) return "Sent just now.";
  if (mins === 1) return "Sent 1 minute ago.";
  return `Sent ${mins} minutes ago.`;
}

export default function ProfileV1({
  email, initialNewEmail,
  initialFirstName, initialLastName, initialTitle,
  initialSubspecialties, initialEmailNotifications, subspecialties,
}: Props) {
  // ── Account ──────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName,  setLastName]  = useState(initialLastName  ?? "");
  const [title,     setTitle]     = useState(initialTitle     ?? "");
  const [editingAccount, setEditingAccount] = useState(false);
  const [draftFn, setDraftFn] = useState("");
  const [draftLn, setDraftLn] = useState("");
  const [draftTi, setDraftTi] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // ── Email ─────────────────────────────────────────────────────────────────
  type EmailMode = "view" | "editing" | "pending";
  const [emailMode, setEmailMode] = useState<EmailMode>(initialNewEmail ? "pending" : "view");
  const [pendingEmail, setPendingEmail] = useState<string | null>(initialNewEmail);
  const [emailChangeTime, setEmailChangeTime] = useState<Date | null>(null);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // ── Subspecialties ────────────────────────────────────────────────────────
  const validSubNames = new Set(subspecialties);
  const [subs,        setSubs]        = useState<string[]>(initialSubspecialties.filter(s => validSubNames.has(s)));
  const [editingSubs, setEditingSubs] = useState(false);
  const [draftSubs,   setDraftSubs]   = useState<string[]>(initialSubspecialties);
  const [savingSubs,  setSavingSubs]  = useState(false);

  // ── Notifications ─────────────────────────────────────────────────────────
  const [emailNotifications, setEmailNotifications] = useState(initialEmailNotifications);

  // ── Delete account ────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const router = useRouter();

  const displayName = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];

  // ── Account handlers ──────────────────────────────────────────────────────
  function startAccountEdit() {
    setDraftFn(firstName); setDraftLn(lastName); setDraftTi(title);
    setAccountError(null); setEditingAccount(true);
  }
  function cancelAccountEdit() { setEditingAccount(false); setAccountError(null); }
  async function saveAccount() {
    const fn = draftFn.trim(); const ln = draftLn.trim();
    if (!fn && !ln) { setAccountError("At least one of First name or Last name must be set."); return; }
    setSavingAccount(true); setAccountError(null);
    const res = await patchProfile({ first_name: fn || null, last_name: ln || null, title: draftTi.trim() || null });
    setSavingAccount(false);
    if (!res.ok) { setAccountError(res.error ?? "Save failed"); return; }
    setFirstName(fn); setLastName(ln); setTitle(draftTi.trim());
    setEditingAccount(false); router.refresh();
    const newName = [fn, ln].filter(Boolean).join(" ");
    if (newName) await createClient().auth.updateUser({ data: { name: newName } });
  }

  // ── Email handlers ────────────────────────────────────────────────────────
  async function sendEmailChange() {
    const trimmed = newEmailInput.trim();
    if (!isValidEmail(trimmed)) { setEmailError("Please enter a valid email address."); return; }
    if (trimmed === email) { setEmailError("This is already your current email."); return; }
    setSendingEmail(true); setEmailError(null);
    const { error } = await createClient().auth.updateUser({ email: trimmed });
    setSendingEmail(false);
    if (error) { setEmailError(error.message); return; }
    setPendingEmail(trimmed);
    setEmailChangeTime(new Date());
    setEmailMode("pending");
  }

  async function cancelEmailChange() {
    if (!confirm("Cancel the pending email change? The confirmation link will be invalidated.")) return;
    await createClient().auth.updateUser({ email });
    setPendingEmail(null); setEmailChangeTime(null); setEmailMode("view");
  }

  // ── Subspecialties handlers ────────────────────────────────────────────────
  async function saveSubs() {
    setSavingSubs(true);
    const res = await patchProfile({ subspecialties: draftSubs });
    setSavingSubs(false);
    if (!res.ok) return;
    setSubs(draftSubs); setEditingSubs(false); router.refresh();
  }

  // ── Notifications handler ─────────────────────────────────────────────────
  async function toggleNotifications(v: boolean) {
    setEmailNotifications(v);
    await patchProfile({ email_notifications: v });
    router.refresh();
  }

  // ── Delete handler ────────────────────────────────────────────────────────
  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch("/api/profile/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_email: deleteConfirmInput }),
    });
    const json = await res.json();
    setDeleting(false);
    if (!json.ok) { setDeleteError(json.error ?? "Deletion failed"); return; }
    await createClient().auth.signOut().catch(() => null);
    router.replace("/account-deleted");
  }

  // ── Field input helper ────────────────────────────────────────────────────
  const fieldInput = (
    value: string, onChange: (v: string) => void,
    opts?: { placeholder?: string; autoFocus?: boolean; type?: string },
  ) => (
    <input
      type={opts?.type ?? "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") { cancelAccountEdit(); setEmailMode("view"); } }}
      placeholder={opts?.placeholder}
      autoFocus={opts?.autoFocus}
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "16px", padding: "8px 12px",
        border: HAIRLINE, borderRadius: "8px",
        width: "100%", maxWidth: "360px", color: "#1a1a1a",
        outline: "none", boxSizing: "border-box",
      }}
    />
  );

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "#1a1a1a" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem 1rem 4rem" }}>

        {/* Page header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#D94A43", fontWeight: 500, marginBottom: "6px" }}>
            Your Profile
          </div>
          <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "28px", lineHeight: 1.2, color: "#1a1a1a", marginBottom: "4px" }}>
            {displayName}
          </div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>{email}</div>
        </div>

        {/* ── Section 1: Account ───────────────────────────────────────── */}
        <SectionHeader
          label="Account"
          right={editingAccount ? <EditingTag /> : <EditLink onClick={startAccountEdit} />}
        />
        <Card>
          {/* First name */}
          <div style={{ padding: "18px 24px" }}>
            <FieldLabel>First Name</FieldLabel>
            {editingAccount
              ? fieldInput(draftFn, setDraftFn, { autoFocus: true })
              : <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "16px", color: firstName ? "#1a1a1a" : "#94a3b8" }}>{firstName || "—"}</div>}
          </div>
          {/* Last name */}
          <div style={{ padding: "18px 24px", borderTop: HAIRLINE }}>
            <FieldLabel>Last Name</FieldLabel>
            {editingAccount
              ? fieldInput(draftLn, setDraftLn)
              : <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "16px", color: lastName ? "#1a1a1a" : "#94a3b8" }}>{lastName || "—"}</div>}
          </div>
          {/* Title */}
          <div style={{ padding: "18px 24px", borderTop: HAIRLINE }}>
            <FieldLabel>Title</FieldLabel>
            {editingAccount
              ? fieldInput(draftTi, setDraftTi, { placeholder: "e.g. Dr., Prof., Overlæge" })
              : <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "16px", color: title ? "#1a1a1a" : "#94a3b8" }}>{title || "—"}</div>}
          </div>
          {/* Footer */}
          {editingAccount && (
            <CardFooter>
              {accountError && <div style={{ fontSize: "12px", color: "#b91c1c" }}>{accountError}</div>}
              <FooterButtons onCancel={cancelAccountEdit} onSave={saveAccount} saving={savingAccount} />
            </CardFooter>
          )}
        </Card>

        {/* ── Section 2: Email ─────────────────────────────────────────── */}
        <SectionHeader
          label="Email"
          right={
            emailMode === "view" ? <EditLink onClick={() => { setNewEmailInput(""); setEmailError(null); setEmailMode("editing"); }} label="Change" />
            : emailMode === "editing" ? <EditingTag />
            : null
          }
        />

        {/* View state */}
        {emailMode === "view" && (
          <Card>
            <div style={{ padding: "18px 24px" }}>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "16px", color: "#1a1a1a" }}>
                {email}
              </div>
            </div>
          </Card>
        )}

        {/* Editing state */}
        {emailMode === "editing" && (
          <Card>
            {/* Current email */}
            <div style={{ padding: "18px 24px 14px" }}>
              <FieldLabel>Current</FieldLabel>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "15px", color: "#64748b" }}>{email}</div>
            </div>
            {/* New email input */}
            <div style={{ padding: "14px 24px", borderTop: HAIRLINE }}>
              <FieldLabel>New Email</FieldLabel>
              {fieldInput(newEmailInput, setNewEmailInput, { type: "email", placeholder: "new@example.com", autoFocus: true })}
            </div>
            {/* Cream explanation */}
            <div style={{ padding: "14px 24px", borderTop: HAIRLINE, background: "#F5F1E8", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "3px", background: "#D94A43" }} />
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: "13px", color: "#D94A43", marginBottom: "6px" }}>
                How this works
              </div>
              <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", fontSize: "13px", lineHeight: 1.5, color: "#1a1a1a" }}>
                When you save, we&apos;ll send a confirmation link to your new address. Your email will only change after you click that link — your current address stays active until then.
              </div>
            </div>
            {/* Footer */}
            <CardFooter>
              {emailError && <div style={{ fontSize: "12px", color: "#b91c1c" }}>{emailError}</div>}
              <FooterButtons
                onCancel={() => { setEmailMode("view"); setEmailError(null); }}
                onSave={sendEmailChange}
                saving={sendingEmail}
                saveLabel="Send confirmation link"
              />
            </CardFooter>
          </Card>
        )}

        {/* Pending state */}
        {emailMode === "pending" && (
          <Card>
            {/* Current email — active */}
            <div style={{ padding: "18px 24px" }}>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "16px", color: "#1a1a1a", marginBottom: "4px" }}>{email}</div>
              <div style={{ fontSize: "13px", color: "#64748b" }}>Currently active</div>
            </div>
            {/* Pending banner */}
            <div style={{ padding: "14px 24px", borderTop: HAIRLINE, background: "rgba(217,74,67,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "11px", letterSpacing: "0.06em", fontWeight: 500, textTransform: "uppercase", color: "#D94A43", marginBottom: "3px" }}>
                  Pending confirmation
                </div>
                <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "14px", color: "#1a1a1a" }}>
                  {pendingEmail}
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                  {emailChangeTime
                    ? `${minutesAgoText(emailChangeTime)} Check your inbox to confirm the change.`
                    : "Sent recently. Check your inbox to confirm the change."}
                </div>
              </div>
              <button
                onClick={cancelEmailChange}
                style={{
                  fontSize: "12px", color: "#64748b", background: "none", border: "none",
                  cursor: "pointer", fontFamily: "inherit", flexShrink: 0, marginLeft: "16px",
                }}
              >
                Cancel request
              </button>
            </div>
          </Card>
        )}

        {/* ── Section 3: Subspecialties ────────────────────────────────── */}
        {(() => {
          const MAX_SUBS = 3;
          const draftCount = draftSubs.length;
          const atMax = draftCount >= MAX_SUBS;
          const overMax = draftCount > MAX_SUBS;
          const saveDisabled = savingSubs || overMax;

          return (
            <>
              <SectionHeader
                label="Your Subspecialties"
                right={editingSubs
                  ? <span style={{ fontSize: "11px", color: overMax ? "#D94A43" : "#94a3b8" }}>{draftCount} of {MAX_SUBS} selected</span>
                  : <EditLink onClick={() => { setDraftSubs(subs); setEditingSubs(true); }} />
                }
              />
              <Card>
                <div style={{ padding: "18px 24px" }}>
                  <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5, marginBottom: "14px" }}>
                    Pick up to 3 areas you want to follow more closely. These shape what&apos;s surfaced for you across the platform.
                  </div>
                  {editingSubs ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: atMax ? "6px" : "16px" }}>
                        {subspecialties.map((subName) => {
                          const isChecked = draftSubs.includes(subName);
                          const isDisabled = !isChecked && atMax;
                          return (
                            <label
                              key={subName}
                              style={{
                                display: "flex", alignItems: "center", gap: "10px",
                                fontSize: "14px", color: "#1a1a1a",
                                cursor: isDisabled ? "not-allowed" : "pointer",
                                opacity: isDisabled ? 0.4 : 1,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isDisabled}
                                onChange={(e) => {
                                  if (isDisabled) return;
                                  setDraftSubs(prev =>
                                    e.target.checked ? [...prev, subName] : prev.filter(s => s !== subName)
                                  );
                                }}
                                style={{ width: "16px", height: "16px", cursor: isDisabled ? "not-allowed" : "pointer", accentColor: "#1A1A1A" }}
                              />
                              {subName}
                            </label>
                          );
                        })}
                      </div>
                      {atMax && !overMax && (
                        <div style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic", marginBottom: "16px" }}>
                          Uncheck one to choose another.
                        </div>
                      )}
                      {!atMax && <div style={{ marginBottom: "16px" }} />}
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={saveSubs} disabled={saveDisabled} style={{
                          fontSize: "12px", padding: "8px 16px", borderRadius: "8px",
                          background: saveDisabled ? "#94a3b8" : "#1A1A1A", color: "#fff", border: "none",
                          cursor: saveDisabled ? "not-allowed" : "pointer", fontWeight: 500, fontFamily: "inherit",
                        }}>
                          {savingSubs ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setEditingSubs(false)} style={{
                          fontSize: "12px", padding: "8px 16px", borderRadius: "8px",
                          background: "transparent", color: "#64748b", border: HAIRLINE,
                          cursor: "pointer", fontFamily: "inherit",
                        }}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : subs.length === 0 ? (
                    <div style={{ fontSize: "13px", color: "#94a3b8" }}>No subspecialties selected. Click Edit to choose.</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {subs.map((sub) => (
                        <span key={sub} style={{
                          background: "#EDF5F8", color: "#1a1a1a", border: HAIRLINE,
                          padding: "5px 12px", borderRadius: "999px",
                          fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "12px",
                        }}>
                          {sub}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </>
          );
        })()}

        {/* ── Section 4: Notifications ─────────────────────────────────── */}
        <SectionHeader label="Notifications" />
        <Card>
          <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "16px", color: "#1a1a1a", marginBottom: "4px" }}>
                Weekly edition email
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.4, maxWidth: "520px" }}>
                Receive our weekly summary of editors picks.
              </div>
            </div>
            <Toggle checked={emailNotifications} onChange={toggleNotifications} />
          </div>
        </Card>

        {/* ── Section 5: Danger zone ───────────────────────────────────── */}
        <SectionHeader label="Danger Zone" />
        <div style={{
          background: "#FDF6F5", border: "1px solid #D94A43",
          borderRadius: "12px",
          padding: "18px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: "24px",
        }}>
          <div>
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "16px", color: "#1a1a1a", marginBottom: "4px" }}>
              Delete account
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5, maxWidth: "480px" }}>
              Permanently remove your account and personal data. This cannot be undone.
            </div>
          </div>
          <button
            onClick={() => { setDeleteConfirmInput(""); setDeleteError(null); setShowDeleteModal(true); }}
            style={{
              fontSize: "12px", padding: "8px 18px", borderRadius: "8px",
              background: "#D94A43", color: "#fff",
              border: "none", fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}
          >
            Delete account
          </button>
        </div>

      </div>

      {/* ── Delete confirmation modal ─────────────────────────────────── */}
      {showDeleteModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: "20vh", zIndex: 100,
          }}
        >
          <div style={{
            background: "#fff", borderRadius: "12px",
            padding: "24px 28px", maxWidth: "480px", width: "100%",
            margin: "0 1rem",
          }}>
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "22px", color: "#1a1a1a", marginBottom: "12px" }}>
              Delete your account?
            </div>
            <div style={{ fontSize: "15px", lineHeight: 1.5, color: "#1a1a1a", marginBottom: "18px" }}>
              This will permanently remove your profile, saved articles, follows, reading history, and notifications. Your account cannot be recovered.
            </div>

            <div style={{ marginBottom: "18px" }}>
              <div style={{ fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "6px" }}>
                Type your email to confirm
              </div>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                {email}
              </div>
              <input
                type="email"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setShowDeleteModal(false); }}
                placeholder={email}
                autoFocus
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: "8px",
                  border: HAIRLINE, fontFamily: "monospace", fontSize: "14px",
                  color: "#1a1a1a", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {deleteError && (
              <div style={{ fontSize: "12px", color: "#b91c1c", marginBottom: "12px" }}>{deleteError}</div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  fontSize: "12px", padding: "8px 16px", borderRadius: "8px",
                  background: "transparent", color: "#64748b", border: HAIRLINE,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting || deleteConfirmInput !== email}
                style={{
                  fontSize: "12px", padding: "8px 18px", borderRadius: "8px",
                  background: deleting || deleteConfirmInput !== email ? "#94a3b8" : "#D94A43",
                  color: "#fff", border: "none", fontWeight: 500,
                  cursor: deleting || deleteConfirmInput !== email ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {deleting ? "Deleting…" : "Permanently delete account"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
