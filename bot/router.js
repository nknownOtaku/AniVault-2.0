import { handleStart } from './handlers/start.js';
import { handleAnimeCallback, handleAnimeMessage } from './handlers/anime.js';
import { handleSeasonCallback, handleSeasonNameInput } from './handlers/season.js';
import { handleFileUpload, handleUploadDone, handleConfirmUpload, handleCancelUpload, handleViewEpisode } from './handlers/upload.js';
import { sendMessage, answerCallbackQuery } from '../lib/telegram.js';
import { getAdminState, setAdminState, BotState } from '../lib/session.js';

// Re-export the state machine so existing imports keep working.
export { BotState };

/**
 * Get the admin session for a user (or null when none exists yet).
 * Thin wrapper over the shared session helper so the rest of the router
 * keeps its existing call sites.
 * @param {number} userId - Telegram user ID
 */
async function getAdminSession(userId) {
  return getAdminState(userId);
}

/**
 * Update admin session state.
 * @param {number} userId - Telegram user ID
 * @param {string} state - New state
 * @param {object} data - Additional data
 * @param {number|string} [chatId] - Telegram chat ID
 */
async function updateAdminSession(userId, state, data = {}, chatId = null) {
  await setAdminState(userId, chatId, state, data);
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
    await updateAdminSession(userId, BotState.IDLE, {}, chatId);
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
      await handleFileUpload(message, session.data?.upload_session_id);
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
  } else if (data.startsWith('add_season_') || data.startsWith('view_season_') || data.startsWith('delete_season') || data.startsWith('add_episode_')) {
    await handleSeasonCallback(callbackQuery);
  } else if (data.startsWith('view_episode_')) {
    await handleViewEpisode(callbackQuery, data.replace('view_episode_', ''));
  } else if (data === 'upload_done') {
    await handleUploadDone(callbackQuery, session.data?.upload_session_id);
  } else if (data === 'confirm_upload') {
    await handleConfirmUpload(callbackQuery, session.data?.upload_session_id, session.data?.season_id);
  } else if (data === 'cancel_upload') {
    await handleCancelUpload(callbackQuery, session.data?.upload_session_id);
  } else if (data === 'edit_upload') {
    await answerCallbackQuery(callbackQuery.id, 'Edit functionality coming soon');
  } else if (data === 'admin_menu') {
    await handleStart(callbackQuery.message);
  } else {
    await answerCallbackQuery(callbackQuery.id, 'Unknown action');
  }
}
