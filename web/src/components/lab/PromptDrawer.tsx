"use client";

import { useState } from "react";
import PromptSection, { type ModelVersion } from "@/app/admin/(with-header)/lab/specialty-tag/dashboard/PromptSection";

interface PromptDrawerProps {
  versions: ModelVersion[];
  specialty: string;
  module: string;
  totalDisagreements: number;
  /** Button label — rendered inline as a styled button */
  buttonLabel?: string;
  /** Extra styles merged onto the trigger button */
  buttonStyle?: React.CSSProperties;
}

export { type ModelVersion };

export default function PromptDrawer({
  versions,
  specialty,
  module,
  totalDisagreements,
  buttonLabel = "Prompt versioner →",
  buttonStyle,
}: PromptDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: "12px",
          fontWeight: 700,
          background: "#fff",
          color: "#5a6a85",
          border: "1px solid #dde3ed",
          borderRadius: "7px",
          padding: "7px 14px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          ...buttonStyle,
        }}
      >
        {buttonLabel}
      </button>

      {/* Overlay + Drawer */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1500 }}
          onClick={(e) => {
            // Close only when clicking the overlay, not the panel
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          {/* Backdrop */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.3)",
            }}
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100vh",
              width: "640px",
              maxWidth: "90vw",
              background: "#fff",
              boxShadow: "-4px 0 20px rgba(0,0,0,0.1)",
              display: "flex",
              flexDirection: "column",
              animation: "promptDrawerSlideIn 0.25s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 24px",
                borderBottom: "1px solid #e8ecf1",
                background: "#EEF2F7",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#1a1a1a",
                }}
              >
                Prompt versioner
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "20px",
                  color: "#5a6a85",
                  cursor: "pointer",
                  padding: "4px 8px",
                  lineHeight: 1,
                  borderRadius: "4px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px",
                fontFamily: "var(--font-inter), Inter, sans-serif",
              }}
            >
              <PromptSection
                versions={versions}
                specialty={specialty}
                module={module}
                totalDisagreements={totalDisagreements}
              />
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes promptDrawerSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
