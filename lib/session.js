import { supabase } from './supabase.js';
import { generateId } from './tokens.js';

/**
 * Canonical bot state machine states.
 *
 * Keep this as the single source of truth. `router.js` imports `BotState`
 * and re-exports it for backward compatibility.
 */
export const BotState = {
  IDLE: 'IDLE',

  // Anime workflow
  WAITING_ANIME_TITLE: 'WAITING_ANIME_TITLE',
  SELECTING_ANIME: 'SELECTING_ANIME',
  VIEWING_ANIME: 'VIEWING_ANIME',

  // Season workflow
  VIEWING_SEASON: 'VIEWING_SEASON',
  VIEWING_EPISODE: 'VIEWING_EPISODE',
  ADDING_SEASON: 'ADDING_SEASON',
  WAITING_SEASON_NAME: 'WAITING_SEASON_NAME',
  WAITING_FILES: 'WAITING_FILES',
  REVIEWING_UPLOAD: 'REVIEWING_UPLOAD'
};

/**
 * Get the admin session for a Telegram user (most recent row).
 * Returns null when the user has no session yet.
 *
 * @param {number|string} telegramUserId - Telegram user ID
 * @returns {Promise<object|null>} Session row or null
 */
export async function getAdminState(telegramUserId) {
  const { data, error } = await supabase
    .from('admin_sessions')
    .select('*')
    .eq('telegram_user_id', String(telegramUserId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error reading admin state:', error);
    return null;
  }

  return data || null;
}

/**
 * Upsert the admin session state for a Telegram user.
 *
 * The `admin_sessions` table has no unique constraint on `telegram_user_id`,
 * so we update the existing row when one exists and insert otherwise.
 * This keeps a single active session per admin.
 *
 * @param {number|string} telegramUserId - Telegram user ID
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} state - New state (use BotState.*)
 * @param {object} [data] - Arbitrary workflow data to persist
 * @returns {Promise<object|null>} The saved session row
 */
export async function setAdminState(telegramUserId, chatId, state, data = {}) {
  const userId = String(telegramUserId);

  const existing = await getAdminState(userId);

  const payload = {
    telegram_user_id: userId,
    chat_id: chatId != null ? String(chatId) : null,
    state,
    data,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const { data: updated, error } = await supabase
      .from('admin_sessions')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating admin state:', error);
      throw error;
    }

    return updated;
  }

  const { data: inserted, error } = await supabase
    .from('admin_sessions')
    .insert({ id: generateId('SES'), ...payload })
    .select()
    .single();

  if (error) {
    console.error('Error creating admin state:', error);
    throw error;
  }

  return inserted;
}

/**
 * Reset an admin session back to IDLE (clearing workflow data).
 *
 * @param {number|string} telegramUserId - Telegram user ID
 * @param {number|string} [chatId] - Telegram chat ID
 */
export async function clearAdminState(telegramUserId, chatId = null) {
  try {
    await setAdminState(telegramUserId, chatId, BotState.IDLE, {});
  } catch (error) {
    console.error('Error clearing admin state:', error);
  }
}
