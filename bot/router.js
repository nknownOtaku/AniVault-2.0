import { handleStart } from './handlers/start.js';
import { handleAnimeCallback, handleAnimeMessage } from './handlers/anime.js';
import { handleSeasonCallback, handleSeasonNameInput } from './handlers/season.js';
import { handleFileUpload, handleUploadDone, handleConfirmUpload, handleCancelUpload, handleViewEpisode, handleGenerateToken, handleDuplicateStrategy } from './handlers/upload.js';
import { handleDeleteCallback } from './handlers/delete.js';
import { handleAdminCallback, handleDatabaseClearConfirmation } from './handlers/admin.js';
import { handleUserCallback, handleUserMessage } from './handlers/user-catalog.js';
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

  const isAdmin = String(userId) === String(process.env.TELEGRAM_ADMIN_ID);

  // /start is handled before the admin gate: plain `/start` shows the admin
  // menu to the admin (and is refused inside the handler for everyone else),
  // while `/start <token>` is the *user-facing* entry point and must be
  // reachable by any Telegram user holding a valid token.
  if (message.text === '/start' || message.text?.startsWith('/start ')) {
    await handleStart(message);
    if (isAdmin) {
      await updateAdminSession(userId, BotState.IDLE, {}, chatId);
    }
    return;
  }

  // Every other message is an admin-only action.
  if (!isAdmin) {
    if (message.text) {
      await handleUserMessage(message);
    } else {
      await sendMessage(chatId, 'Please use the buttons in /start to browse AniVault.');
    }
    return;
  }

  // Get session
  const session = await getAdminSession(userId);
  const currentState = session?.state || BotState.IDLE;

  // Handle text messages based on state
  if (message.text) {
    switch (currentState) {
      case BotState.WAITING_ANIME_TITLE:
        await handleAnimeMessage(message, currentState);
        break;

      case BotState.WAITING_SEASON_NAME:
        await handleSeasonNameInput(message, session.data?.anime_id);
        break;

      case BotState.WAITING_DATABASE_CLEAR_CONFIRM:
        await handleDatabaseClearConfirmation(message);
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

  if (data?.startsWith('user_')) {
    await handleUserCallback(callbackQuery);
    return;
  }

  // Verify admin
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (String(userId) !== String(adminId)) {
    await answerCallbackQuery(callbackQuery.id, '⛔ Access denied');
    return;
  }

  // Get session
  const session = await getAdminSession(userId);

  // Route based on callback data prefix.
  //
  // Order matters: episode and file deletion prefixes (@see delete.js) must be
  // checked before the broader season/upload branches, otherwise a callback
  // such as `delete_episode_confirm_...` would fall into the wrong handler.
  if (data === 'admin_stats' || data === 'admin_repair_tokens' || data === 'admin_cleanup_uploads' || data === 'admin_clear_database' || data === 'admin_clear_database_cancel') {
    await handleAdminCallback(callbackQuery);
  } else if (data.startsWith('delete_episode_') || data.startsWith('cancel_delete_episode_') || data.startsWith('delete_file_') || data.startsWith('cancel_delete_file_')) {
    await handleDeleteCallback(callbackQuery);
  } else if (data.startsWith('admin_') || data.startsWith('anilist_') || data.startsWith('view_anime_') || data.startsWith('back_to_anime') || data.startsWith('delete_anime_') || data.startsWith('cancel_delete_anime_')) {
    await handleAnimeCallback(callbackQuery);
  } else if (data.startsWith('add_season_') || data.startsWith('view_season_') || data.startsWith('delete_season') || data.startsWith('cancel_delete_season_') || data.startsWith('add_episode_') || data.startsWith('back_to_seasons')) {
    await handleSeasonCallback(callbackQuery);
  } else if (data.startsWith('view_episode_') || data.startsWith('back_to_episodes')) {
    await handleViewEpisode(callbackQuery, data.replace('view_episode_', ''));
  } else if (data.startsWith('generate_token_')) {
    await handleGenerateToken(callbackQuery);
  } else if (data === 'upload_done') {
    await handleUploadDone(callbackQuery, session.data?.upload_session_id);
  } else if (data === 'confirm_upload') {
    await handleConfirmUpload(callbackQuery, session.data?.upload_session_id, session.data?.season_id);
  } else if (data === 'duplicate_overwrite_all') {
    await handleDuplicateStrategy(callbackQuery, 'overwrite_all');
  } else if (data === 'duplicate_ignore_all') {
    await handleDuplicateStrategy(callbackQuery, 'ignore_all');
  } else if (data === 'duplicate_review') {
    await answerCallbackQuery(callbackQuery.id, 'Per-file review not available yet - choose Overwrite All or Ignore All.');
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
