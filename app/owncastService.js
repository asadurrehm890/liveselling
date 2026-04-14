// app/services/owncastService.js
const OWNCAST_URL = process.env.REACT_APP_OWNCAST_URL || "https://silver-yodel-qrpqrwgxg4pc6wwq-8080.app.github.dev";
const OWNCAST_ADMIN_USERNAME = process.env.REACT_APP_OWNCAST_ADMIN_USERNAME || "admin";
const OWNCAST_ADMIN_PASSWORD = process.env.REACT_APP_OWNCAST_ADMIN_PASSWORD;

let adminSessionCookie = null;
let cookieExpiry = null;

async function getAdminSession() {
  // Check if we have a valid session
  if (adminSessionCookie && cookieExpiry && Date.now() < cookieExpiry) {
    return adminSessionCookie;
  }

  try {
    const response = await fetch(`${OWNCAST_URL}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: OWNCAST_ADMIN_USERNAME,
        password: OWNCAST_ADMIN_PASSWORD,
      }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      adminSessionCookie = setCookie;
      cookieExpiry = Date.now() + 24 * 60 * 60 * 1000;
    }

    return adminSessionCookie;
  } catch (error) {
    console.error("Error logging into Owncast:", error);
    throw error;
  }
}

export const owncastAPI = {
  // Get stream status
  getStatus: async () => {
    try {
      const response = await fetch(`${OWNCAST_URL}/api/status`);
      const data = await response.json();
      return {
        isLive: data.online,
        viewerCount: data.viewerCount || 0,
        streamTitle: data.streamTitle || "Live Stream"
      };
    } catch (error) {
      console.error("Error getting stream status:", error);
      return { isLive: false, viewerCount: 0, streamTitle: "Offline" };
    }
  },

  // Start stream
  startStream: async () => {
    try {
      const sessionCookie = await getAdminSession();
      const response = await fetch(`${OWNCAST_URL}/api/admin/start`, {
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
          'Content-Type': 'application/json',
        },
      });
      
      return { success: response.ok };
    } catch (error) {
      console.error("Error starting stream:", error);
      return { success: false, error: error.message };
    }
  },

  // Stop stream
  stopStream: async () => {
    try {
      const sessionCookie = await getAdminSession();
      const response = await fetch(`${OWNCAST_URL}/api/admin/stop`, {
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
          'Content-Type': 'application/json',
        },
      });
      
      return { success: response.ok };
    } catch (error) {
      console.error("Error stopping stream:", error);
      return { success: false, error: error.message };
    }
  },

  // Get stream key (for OBS configuration)
  getStreamKey: async () => {
    try {
      const sessionCookie = await getAdminSession();
      const response = await fetch(`${OWNCAST_URL}/api/admin/config`, {
        headers: {
          'Cookie': sessionCookie,
        },
      });
      const config = await response.json();
      const streamKey = config?.streamKeys?.[0]?.key || "your-stream-key-here";
      return streamKey;
    } catch (error) {
      console.error("Error getting stream key:", error);
      return "unable-to-fetch-key";
    }
  }
};