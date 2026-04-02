// app/routes/api.chat.jsx
import Pusher from 'pusher';

export async function action({ request }) {
  // Only accept POST requests
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get message data from request
    const { streamId, text, author, timestamp } = await request.json();

    // Validate required fields
    if (!streamId || !text) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Initialize Pusher with your credentials
    const pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true
    });

    // Create message object
    const message = {
      id: Date.now() + Math.random(),
      text: text,
      author: author || 'Viewer',
      timestamp: timestamp || new Date().toISOString(),
      streamId: streamId
    };

    // Trigger event to Pusher channel
    await pusher.trigger(`stream-${streamId}`, 'new-message', message);

    // Return success response
    return new Response(JSON.stringify({ success: true, message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Pusher error:', error);
    return new Response(JSON.stringify({ error: 'Failed to send message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}