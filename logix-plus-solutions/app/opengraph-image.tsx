import { ImageResponse } from "next/og";
import { PLANS, TRIAL_DAYS } from "@/lib/site";

export const alt = "Logix Plus — ERP, POS & Accounting Software";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card used by every page (WhatsApp, Facebook, LinkedIn, X previews). */
export default function OpengraphImage() {
  const from = Math.min(...PLANS.map((p) => p.priceUsd));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0b1533 0%, #13235a 60%, #1d4ed8 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg, #2563eb, #06b6d4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 800,
            }}
          >
            L+
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1 }}>LOGIX PLUS</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, maxWidth: 1000 }}>
            {"ERP, POS & Accounting software for small business"}
          </div>
          <div style={{ fontSize: 30, color: "#a5b4fc", marginTop: 24 }}>
            Billing · Inventory · Accounts · HR · Multi-branch
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, fontSize: 26, fontWeight: 700 }}>
          <div style={{ background: "#2563eb", padding: "12px 24px", borderRadius: 12 }}>
            {`${TRIAL_DAYS}-day free trial`}
          </div>
          <div style={{ border: "2px solid rgba(255,255,255,0.3)", padding: "12px 24px", borderRadius: 12 }}>
            {`From $${from}/month`}
          </div>
          <div style={{ border: "2px solid rgba(255,255,255,0.3)", padding: "12px 24px", borderRadius: 12 }}>
            logixplussolutions.com
          </div>
        </div>
      </div>
    ),
    size
  );
}
