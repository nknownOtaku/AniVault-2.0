import { routeMessage, routeCallback } from '../../../bot/router.js';

/**
 * Telegram webhook handler for Vercel
 * POST /api/telegram
 */
export async function POST(request) {
  try {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret && request.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
      return Response.json({ ok: false, error: 'Unauthorized webhook request.' }, { status: 401 });
    }

    const update = await request.json();

    // Log update type (for debugging, avoid logging sensitive data)
    console.log('[INFO] Received Telegram update:', {
      update_id: update.update_id,
      has_message: !!update.message,
      has_callback: !!update.callback_query
    });

    // Route the update
    if (update.message) {
      await routeMessage(update.message);
    } else if (update.callback_query) {
      await routeCallback(update.callback_query);
    } else if (update.edited_message) {
      // Handle edited messages if needed
      console.log('[INFO] Edited message received');
    }

    // Always return 200 OK to Telegram
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[ERROR] Telegram webhook error:', error.message);
    
    // Still return 200 to prevent Telegram from retrying indefinitely
    return Response.json({ ok: true });
  }
}

/**
 * GET handler for testing
 */
export async function GET() {
  return Response.json({
    status: 'ok',
    message: 'AniVault Bot webhook is running'
  });
}
