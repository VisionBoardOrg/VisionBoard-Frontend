import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "VisionBoard — Work smarter together with AI, from vision to execution";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "linear-gradient(135deg, #0B1329 0%, #0F172A 50%, #1E293B 100%)",
          fontFamily: "system-ui, sans-serif",
          color: "#FFFFFF",
          position: "relative",
        }}
      >
        {/* Glow effect in background */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(37,99,235,0.35) 0%, rgba(37,99,235,0) 70%)",
          }}
        />

        {/* Top Header: Logo + Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              background: "#2563EB",
              borderRadius: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M19.76 25.2857C20.246 25.2857 20.64 25.6695 20.64 26.1429C20.64 26.6162 20.246 27 19.76 27H7.88C7.394 27 7 26.6162 7 26.1429C7 25.6695 7.394 25.2857 7.88 25.2857H19.76Z"
                fill="#FFFFFF"
              />
              <path
                d="M28.12 21.8571C28.606 21.8571 29 22.2409 29 22.7143C29 23.1877 28.606 23.5714 28.12 23.5714H7.88C7.394 23.5714 7 23.1877 7 22.7143C7 22.2409 7.394 21.8571 7.88 21.8571H28.12Z"
                fill="#FFFFFF"
              />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M23.94 9C26.7346 9 29 11.2066 29 13.9286C29 16.6505 26.7346 18.8571 23.94 18.8571C21.6548 18.8571 19.7238 17.3816 19.0956 15.3553C18.7472 15.2635 18.3801 15.2143 18 15.2143C17.6198 15.2143 17.2527 15.2635 16.9043 15.3553C16.2761 17.3816 14.3452 18.8571 12.06 18.8571C9.26544 18.8571 7 16.6505 7 13.9286C7 11.2066 9.26544 9 12.06 9C14.4261 9 16.4125 10.5819 16.9662 12.719C17.3036 12.669 17.6489 12.6429 18 12.6429C18.3511 12.6429 18.6963 12.669 19.0337 12.719C19.5873 10.5819 21.5739 9 23.94 9ZM12.06 10.9286C10.359 10.9286 8.98 12.2717 8.98 13.9286C8.98 15.5854 10.359 16.9286 12.06 16.9286C13.761 16.9286 15.14 15.5854 15.14 13.9286C15.14 13.8014 15.1318 13.676 15.116 13.5529L14.9984 13.3195C15.0219 13.3083 15.0454 13.2973 15.069 13.2863C14.7671 11.9381 13.5347 10.9286 12.06 10.9286ZM23.94 10.9286C22.4653 10.9286 21.2328 11.9381 20.9309 13.2863C20.9545 13.2973 20.9781 13.3083 21.0016 13.3195L20.8838 13.5529C20.8681 13.676 20.86 13.8014 20.86 13.9286C20.86 15.5854 22.239 16.9286 23.94 16.9286C25.641 16.9286 27.02 15.5854 27.02 13.9286C27.02 12.2717 25.641 10.9286 23.94 10.9286Z"
                fill="#FFFFFF"
              />
            </svg>
          </div>
          <div style={{ fontSize: "32px", fontWeight: "bold", letterSpacing: "-0.03em" }}>
            Vision<span style={{ color: "#3B82F6" }}>Board</span>
          </div>
        </div>

        {/* Center: Main Headline & Tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "950px" }}>
          <div
            style={{
              fontSize: "58px",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "#F8FAFC",
            }}
          >
            From Vision to Execution with Native AI.
          </div>
          <div
            style={{
              fontSize: "26px",
              color: "#94A3B8",
              lineHeight: 1.4,
            }}
          >
            AI-powered roadmaps, dynamic sprint boards, OKR tracking, and live collaborative canvases for modern teams.
          </div>
        </div>

        {/* Bottom Bar: Feature Badges */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              background: "rgba(37,99,235,0.2)",
              border: "1px solid rgba(59,130,246,0.4)",
              borderRadius: "100px",
              padding: "10px 24px",
              fontSize: "18px",
              fontWeight: 600,
              color: "#60A5FA",
            }}
          >
            ✦ AI Goal Deconstructor
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "100px",
              padding: "10px 24px",
              fontSize: "18px",
              fontWeight: 600,
              color: "#E2E8F0",
            }}
          >
            Live Collaborative Canvas
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "100px",
              padding: "10px 24px",
              fontSize: "18px",
              fontWeight: 600,
              color: "#E2E8F0",
            }}
          >
            Predictive Sprint Alerts
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
