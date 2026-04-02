// app/routes/api.chat.jsx
import Pusher from 'pusher';

export async function action({ request }) {
  // Log incoming request for debugging
  console.log('📨 Chat API called');
  
  // Only accept POST requests
  if (request.method !== 'POST') {
    console.log('❌ Method not allowed:', request.method);
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }), 
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    // Get message data from request
    const body = await request.json();
    console.log('📝 Received message data:', body);

    const { streamId, text, author, timestamp } = body;

    // Validate required fields
    if (!streamId || !text) {
      console.log('❌ Missing required fields:', { streamId, text });
      return new Response(
        JSON.stringify({ error: 'Missing required fields: streamId and text are required' }), 
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if Pusher credentials are available
    const pusherAppId = process.env.PUSHER_APP_ID;
    const pusherKey = process.env.PUSHER_KEY;
    const pusherSecret = process.env.PUSHER_SECRET;
    const pusherCluster = process.env.PUSHER_CLUSTER;

    console.log('🔑 Pusher credentials check:', {
      hasAppId: !!pusherAppId,
      hasKey: !!pusherKey,
      hasSecret: !!pusherSecret,
      hasCluster: !!pusherCluster,
      appIdPrefix: pusherAppId ? pusherAppId.substring(0, 5) : 'none',
      keyPrefix: pusherKey ? pusherKey.substring(0, 8) : 'none'
    });

    if (!pusherAppId || !pusherKey || !pusherSecret || !pusherCluster) {
      console.error('❌ Missing Pusher credentials in environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Pusher credentials missing' }), 
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Pusher with your credentials
    const pusher = new Pusher({
      appId: pusherAppId,
      key: pusherKey,
      secret: pusherSecret,
      cluster: pusherCluster,
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

    console.log(`📤 Sending message to channel: stream-${streamId}`, message);

    // Trigger event to Pusher channel
    const triggerResponse = await pusher.trigger(`stream-${streamId}`, 'new-message', message);
    
    console.log('✅ Pusher trigger response:', triggerResponse);

    // Return success response
    return new Response(
      JSON.stringify({ success: true, message }), 
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Pusher error:', error);
    console.error('Error details:', error.message, error.stack);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send message', 
        details: error.message 
      }), 
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Optional: Handle GET requests for debugging
export async function loader() {
  return new Response(
    JSON.stringify({ message: 'Chat API is running. Use POST to send messages.' }), 
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}