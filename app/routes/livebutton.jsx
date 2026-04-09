// app/routes/livebutton.jsx
import { useSearchParams } from "react-router";

export default function LiveButtonPage() {
  const [searchParams] = useSearchParams();
  const shop = searchParams.get("shop");
  const streamId = searchParams.get("streamId");
  const ids = searchParams.get("ids");

  // Construct the viewer URL
  const viewerUrl = `https://liveselling-eta.vercel.app/viewerstream?shop=${encodeURIComponent(shop)}&streamId=${encodeURIComponent(streamId)}&ids=${encodeURIComponent(ids)}`;

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "#f5f5f5",
      fontFamily: "Arial, sans-serif"
    }}>
      
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "10px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        textAlign: "center",
        maxWidth: "500px"
      }}>
        <h2>Live Stream Button</h2>
        
        {/* The Button */}
        <a
          href={viewerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "15px 30px",
            fontSize: "18px",
            fontWeight: "bold",
            color: "white",
            background: "#ff0000",
            textDecoration: "none",
            borderRadius: "5px",
            margin: "20px 0",
            transition: "transform 0.2s"
          }}
          onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
          onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
        >
          🔴 LIVE NOW
        </a>

        {/* Embed Code */}
        <div style={{
          background: "#f0f0f0",
          padding: "15px",
          borderRadius: "5px",
          marginTop: "20px"
        }}>
          <p style={{ margin: "0 0 10px 0", fontSize: "14px" }}>
            Copy this code to embed on your website:
          </p>
          <code style={{
            display: "block",
            background: "#2d2d2d",
            color: "#f8f8f2",
            padding: "10px",
            borderRadius: "3px",
            fontSize: "12px",
            wordBreak: "break-all"
          }}>
            {`<a href="${viewerUrl}" target="_blank" style="display:inline-block;padding:15px 30px;background:#ff0000;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">🔴 LIVE NOW</a>`}
          </code>
          <button
            onClick={() => {
              const embedCode = `<a href="${viewerUrl}" target="_blank" style="display:inline-block;padding:15px 30px;background:#ff0000;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">🔴 LIVE NOW</a>`;
              navigator.clipboard.writeText(embedCode);
              alert("Embed code copied!");
            }}
            style={{
              marginTop: "10px",
              padding: "8px 16px",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "3px",
              cursor: "pointer"
            }}
          >
            Copy Code
          </button>
        </div>

        <p style={{ fontSize: "12px", color: "#666", marginTop: "20px" }}>
          Stream ID: {streamId}<br/>
          Products: {ids ? ids.split(',').length : 0}
        </p>
      </div>
    </div>
  );
}