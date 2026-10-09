import { supabase } from './supabase.js';

/**
 * Store or refresh a private Telegram user for broadcast delivery.
 * @param {object} user - Telegram user from an update
 * @param {object} chat - Telegram chat from an update
 */
export async function saveTelegramUser(user, chat) {
  if (!user?.id || user.is_bot || chat?.type !== 'private') {
    return;
  }

  const { error } = await supabase.from('telegram_users').upsert({
    telegram_user_id: String(user.id),
    chat_id: String(chat.id),
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    is_active: true
  }, { onConflict: 'telegram_user_id' });

  if (error) {
    throw error;
  }
}