import { handleStart } from './handlers/start.js';
import { handleAnimeCallback, handleAnimeMessage } from './handlers/anime.js';
import { handleSeasonCallback, handleSeasonNameInput } from './handlers/season.js';
import { handleFileUpload, handleUploadDone, handleConfirmUpload, handleCancelUpload, handleViewEpisode } from './handlers/upload.js';
import { sendMessage, answerCallbackQuery } from '../lib/telegram.js';
import { supabase } from '../lib/supabase.js';

/**
 * Bot state machine states
 */
export const BotState = {
  IDLE: 'IDLE',
  WAITING_ANIME_TITLE: 'WAITING_ANIME_TITLE',
  SELECTING_ANIME: 'SELECTING_ANIME',
  VIEWING_ANIME: 'VIEWING_ANIME',
  ADDING_SEASON: 'ADDING_SEASON',
  WAITING_SEASON_NAME: 'WAITING_SEASON_NAME',
  WAITING_FILES: 'WAITING_FILES',
  REVIEWING_UPLOAD: 'REVIEWING_UPLOAD'
};

/**
 * Get or create admin session
 * @param {number} userId - Telegram user ID
 */
async function getAdminSession(userId) {
  const { data: session } = await supabase
    .from('admin_sessions')
    .select('*')
    .eq('telegram_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!session) {
    // Create new session
    const { data: newSession } = await supabase
      .from('admin_sessions')
      .insert({
        telegram_user_id: userId,
        state: BotState.IDLE,
        data: {}
      })
      .select()
      .single();
    
    return newSession;
  }

  return session;
}

/**
 * Update admin session state
 * @param {number} sessionId - Session ID
 * @param {string} state - New state
 * @param {object} data - Additional data
 */
async function updateAdminSession(sessionId, state, data = {}) {
  await supabase
    .from('admin_sessions')
    .update({
      state,
      data: data
    })
    .eq('id', sessionId);
}

/**
 * Route incoming message based on type and state
 * @param {object} message - Telegram message object
 */
export async function routeMessage(message) {
  const userId = message.from.id;
  const chatId = message.chat.id;

  // Verify admin
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (String(userId) !== String(adminId)) {
    await sendMessage(chatId, '⛔ Access denied. Only administrators can use this bot.');
    return;
  }

  // Get session
  const session = await getAdminSession(userId);
  const currentState = session?.state || BotState.IDLE;

  // Handle /start command
  if (message.text === '/start' || message.text?.startsWith('/start ')) {
    await handleStart(message);
    await updateAdminSession(session.id, BotState.IDLE);
    return;
  }

  // Handle text messages based on state
  if (message.text) {
    switch (currentState) {
      case BotState.WAITING_ANIME_TITLE:
        await handleAnimeMessage(message, currentState);
        break;
      
      case BotState.WAITING_SEASON_NAME:
        await handleSeasonNameInput(message, session.data?.anime_id);
        break;
      
      default:
        // Unknown command in IDLE state
        await sendMessage(chatId, 'Please use /start to begin or select an option from the menu.');
    }
    return;
  }

  // Handle file uploads
  if (message.document || message.video) {
    if (currentState === BotState.WAITING_FILES) {
      await handleFileUpload(message, session.data?.season_id);
    } else {
      await sendMessage(chatId, '⚠️ Please start the upload process by adding a season first.');
    }
    return;
  }
}

/**
 * Route callback query based on data
 * @param {object} callbackQuery - Telegram callback query object
 */
export async function routeCallback(callbackQuery) {
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  // Verify admin
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (String(userId) !== String(adminId)) {
    await answerCallbackQuery(callbackQuery.id, '⛔ Access denied');
    return;
  }

  // Get session
  const session = await getAdminSession(userId);

  // Route based on callback data prefix
  if (data.startsWith('admin_') || data.startsWith('anilist_') || data.startsWith('view_anime_')) {
    await handleAnimeCallback(callbackQuery);
  } else if (data.startsWith('add_season_') || data.startsWith('view_season_') || data.startsWith('delete_season')) {
    await handleSeasonCallback(callbackQuery);
  } else if (data.startsWith('view_episode_')) {
    await handleViewEpisode(callbackQuery, data.replace('view_episode_', ''));
  } else if (data === 'upload_done') {
    await handleUploadDone(callbackQuery, session.data?.season_id);
  } else if (data === 'confirm_upload') {
    await handleConfirmUpload(callbackQuery, session.data?.season_id);
  } else if (data === 'cancel_upload') {
    await handleCancelUpload(callbackQuery, session.data?.season_id);
  } else if (data === 'edit_upload') {
    await answerCallbackQuery(callbackQuery.id, 'Edit functionality coming soon');
  } else if (data === 'admin_menu') {
    await handleStart(callbackQuery.message);
  } else {
    await answerCallbackQuery(callbackQuery.id, 'Unknown action');
  }
}
