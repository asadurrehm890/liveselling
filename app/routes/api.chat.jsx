// app/routes/api.chat.jsx
import Pusher from 'pusher';

export async function action({ request }) {
  console.log('📨 Chat API called');
  
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }), 
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const body = await request.json();
    console.log('📝 Received message data:', body);

    const { streamId, text, author, timestamp } = body;

    if (!streamId || !text) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }), 
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Log all Pusher credentials (first few chars only for security)
    const pusherAppId = process.env.PUSHER_APP_ID;
    const pusherKey = process.env.PUSHER_KEY;
    const pusherSecret = process.env.PUSHER_SECRET;
    const pusherCluster = process.env.PUSHER_CLUSTER;

    console.log('🔑 Pusher credentials (from env):', {
      appId: pusherAppId ? `${pusherAppId.substring(0, 4)}...` : 'MISSING',
      key: pusherKey ? `${pusherKey.substring(0, 8)}...` : 'MISSING',
      secret: pusherSecret ? `${pusherSecret.substring(0, 4)}...` : 'MISSING',
      cluster: pusherCluster || 'MISSING'
    });

    // Validate all credentials are present
    if (!pusherAppId || !pusherKey || !pusherSecret || !pusherCluster) {
      const missing = [];
      if (!pusherAppId) missing.push('PUSHER_APP_ID');
      if (!pusherKey) missing.push('PUSHER_KEY');
      if (!pusherSecret) missing.push('PUSHER_SECRET');
      if (!pusherCluster) missing.push('PUSHER_CLUSTER');
      
      console.error('❌ Missing Pusher credentials:', missing);
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error', 
          details: `Missing credentials: ${missing.join(', ')}` 
        }), 
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Pusher with credentials
    const pusher = new Pusher({
      appId: pusherAppId,
      key: pusherKey,
      secret: pusherSecret,
      cluster: pusherCluster,
      useTLS: true
    });

    const message = {
      id: Date.now() + Math.random(),
      text: text,
      author: author || 'Viewer',
      timestamp: timestamp || new Date().toISOString(),
      streamId: streamId
    };

    console.log(`📤 Attempting to send to channel: stream-${streamId}`);

    // Trigger with error catching
    try {
      const triggerResponse = await pusher.trigger(`stream-${streamId}`, 'new-message', message);
      console.log('✅ Pusher trigger response:', triggerResponse);
      
      return new Response(
        JSON.stringify({ success: true, message }), 
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (pusherError) {
      console.error('❌ Pusher trigger error:', pusherError);
      
      // Check if it's a 401 error
      if (pusherError.statusCode === 401 || pusherError.message?.includes('401')) {
        return new Response(
          JSON.stringify({ 
            error: 'Pusher authentication failed', 
            details: 'Invalid app credentials. Please check your Pusher App ID, Key, and Secret in environment variables.' 
          }), 
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      throw pusherError;
    }

  } catch (error) {
    console.error('❌ API error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send message', 
        details: error.message || 'Unknown error'
      }), 
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function loader() {
  return new Response(
    JSON.stringify({ 
      message: 'Chat API is running. Use POST to send messages.',
      environment: process.env.NODE_ENV,
      hasPusherConfig: {
        appId: !!process.env.PUSHER_APP_ID,
        key: !!process.env.PUSHER_KEY,
        secret: !!process.env.PUSHER_SECRET,
        cluster: !!process.env.PUSHER_CLUSTER
      }
    }), 
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}