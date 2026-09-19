import { editMessageText, answerCallbackQuery, deleteMessage, sendMessage } from '../../lib/telegram.js';
import { supabase } from '../../lib/supabase.js';
import { setAdminState, getAdminState, BotState } from '../../lib/session.js';

/**
 * Deletion workflows for episodes and files.
 *
 * Anime and season deletion already live in their own handlers, but they share
 * the confirmation + cascade pattern implemented here. The key rule from the
 * spec is that every destructive action requires an explicit second click and
 * that database deletion is reported separately from Telegram storage deletion.
 */

/**
 * Route a delete-related callback query.
 * Expected callback data shapes:
 *   delete_episode_confirm_<episodeId>
 *   delete_episode_<episodeId>
 *   cancel_delete_episode_<episodeId>
 *   delete_file_confirm_<fileId>
 *   delete_file_<fileId>
 *   cancel_delete_file_<fileId>
 *
 * @param {object} callbackQuery - Telegram callback query
 * @returns {Promise<boolean>} true when the callback was handled
 */
export async function handleDeleteCallback(callbackQuery) {
  const data = callbackQuery.data || '';

  if (data.startsWith('cancel_delete_episode_')) {
    const episodeId = data.replace('cancel_delete_episode_', '');
    await cancelDeleteEpisode(callbackQuery, episodeId);
    return true;
  }

  if (data.startsWith('delete_episode_confirm_')) {
    const episodeId = data.replace('delete_episode_confirm_', '');
    await confirmDeleteEpisode(callbackQuery, episodeId);
    return true;
  }

  if (data.startsWith('delete_episode_')) {
    const episodeId = data.replace('delete_episode_', '');
    await performDeleteEpisode(callbackQuery, episodeId);
    return true;
  }

  if (data.startsWith('cancel_delete_file_')) {
    const fileId = data.replace('cancel_delete_file_', '');
    await cancelDeleteFile(callbackQuery, fileId);
    return true;
  }

  if (data.startsWith('delete_file_confirm_')) {
    const fileId = data.replace('delete_file_confirm_', '');
    await confirmDeleteFile(callbackQuery, fileId);
    return true;
  }

  if (data.startsWith('delete_file_')) {
    const fileId = data.replace('delete_file_', '');
    await performDeleteFile(callbackQuery, fileId);
    return true;
  }

  return false;
}

/**
 * Show the "are you sure" screen for an episode, including how many files and
 * episodes would be removed (spec §47).
 */
async function confirmDeleteEpisode(callbackQuery, episodeId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message_id;

  try {
    const { data: episode, error } = await supabase
      .from('episodes')
      .select(`
        id,
        episode_number,
        season (
          id,
          name,
          anime ( id, title )
        ),
        files ( id, telegram_chat_id, telegram_message_id )
      `)
      .eq('id', episodeId)
      .maybeSingle();

    if (error || !episode) {
      await editMessageText(chatId, messageId, '❌ Episode not found.');
      return;
    }

    const fileCount = episode.files?.length || 0;
    const animeTitle = episode.season?.anime?.title || 'Unknown';
    const seasonName = episode.season?.name || 'Unknown';

    const text = `
⚠️ <b>DELETE EPISODE</b>

<b>${animeTitle}</b> - ${seasonName}
Episode ${episode.episode_number}

This contains ${fileCount} file${fileCount === 1 ? '' : 's'}.

Are you sure?
`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⚠️ DELETE EPISODE', callback_data: `delete_episode_${episodeId}` },
          { text: 'Cancel', callback_data: `cancel_delete_episode_${episodeId}` }
        ]
      ]
    };

    await editMessageText(chatId, messageId, text, { reply_markup: keyboard });
  } catch (err) {
    console.error('Error confirming episode delete:', err);
    await editMessageText(chatId, messageId, '❌ Error preparing delete confirmation.');
  }
}

/**
 * Return to the episode view when a delete is cancelled.
 */
async function cancelDeleteEpisode(callbackQuery, episodeId) {
  const { handleViewEpisode } = await import('./upload.js');
  await handleViewEpisode(
    { ...callbackQuery, data: `view_episode_${episodeId}` },
    episodeId
  );
}

/**
 * Delete an episode: rows first (cascade removes files), then attempt to purge
 * the corresponding Telegram messages as a separately-reported best effort.
 */
async function performDeleteEpisode(callbackQuery, episodeId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message_id;

  try {
    // Collect the Telegram message references before the rows disappear, since
    // files are removed by ON DELETE CASCADE and we could not look them up after.
    const { data: episode } = await supabase
      .from('episodes')
      .select('id, episode_number, files ( telegram_chat_id, telegram_message_id )')
      .eq('id', episodeId)
      .maybeSingle();

    if (!episode) {
      await editMessageText(chatId, messageId, '❌ Episode not found.');
      return;
    }

    const telegramRefs = (episode.files || []).filter(
      (f) => f.telegram_message_id
    );

    const { error } = await supabase
      .from('episodes')
      .delete()
      .eq('id', episodeId);

    if (error) {
      throw error;
    }

    const { deleted, failed } = await purgeTelegramMessages(telegramRefs);

    await editMessageText(
      chatId,
      messageId,
      `✅ Episode ${episode.episode_number} deleted from the database.` +
      telegramCleanupReport(deleted, failed)
    );
  } catch (err) {
    console.error('Error deleting episode:', err);
    await editMessageText(chatId, messageId, '❌ Error deleting episode.');
  }
}

/**
 * Show the confirmation screen for deleting a single file record.
 */
async function confirmDeleteFile(callbackQuery, fileId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message_id;

  try {
    const { data: file, error } = await supabase
      .from('files')
      .select(`
        id,
        quality,
        language_type,
        language,
        episode_id,
        episodes (
          episode_number,
          season ( name, anime ( title ) )
        )
      `)
      .eq('id', fileId)
      .maybeSingle();

    if (error || !file) {
      await editMessageText(chatId, messageId, '❌ File not found.');
      return;
    }

    const text = `
⚠️ <b>DELETE FILE</b>

${file.episodes?.season?.anime?.title || 'Unknown'}
Episode ${file.episodes?.episode_number ?? '?'}

${file.quality} ${String(file.language_type || '').toUpperCase()} (${file.language})

Are you sure?
`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⚠️ DELETE FILE', callback_data: `delete_file_${fileId}` },
          { text: 'Cancel', callback_data: `cancel_delete_file_${fileId}` }
        ]
      ]
    };

    await editMessageText(chatId, messageId, text, { reply_markup: keyboard });
  } catch (err) {
    console.error('Error confirming file delete:', err);
    await editMessageText(chatId, messageId, '❌ Error preparing delete confirmation.');
  }
}

/**
 * Return to the parent episode view when a file delete is cancelled.
 */
async function cancelDeleteFile(callbackQuery, fileId) {
  const { data: file } = await supabase
    .from('files')
    .select('episode_id')
    .eq('id', fileId)
    .maybeSingle();

  if (!file?.episode_id) {
    await editMessageText(callbackQuery.message.chat.id, callbackQuery.message_id, '❌ File not found.');
    return;
  }

  const { handleViewEpisode } = await import('./upload.js');
  await handleViewEpisode(
    { ...callbackQuery, data: `view_episode_${file.episode_id}` },
    file.episode_id
  );
}

/**
 * Delete a single file record and best-effort delete its Telegram message.
 */
async function performDeleteFile(callbackQuery, fileId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message_id;

  try {
    const { data: file } = await supabase
      .from('files')
      .select('id, episode_id, telegram_chat_id, telegram_message_id')
      .eq('id', fileId)
      .maybeSingle();

    if (!file) {
      await editMessageText(chatId, messageId, '❌ File not found.');
      return;
    }

    const { error } = await supabase.from('files').delete().eq('id', fileId);

    if (error) {
      throw error;
    }

    const { deleted, failed } = await purgeTelegramMessages([
      { telegram_chat_id: file.telegram_chat_id, telegram_message_id: file.telegram_message_id }
    ]);

    await editMessageText(
      chatId,
      messageId,
      '✅ File deleted from the database.' + telegramCleanupReport(deleted, failed)
    );
  } catch (err) {
    console.error('Error deleting file:', err);
    await editMessageText(chatId, messageId, '❌ Error deleting file.');
  }
}

/**
 * Best-effort removal of stored Telegram messages.
 *
 * Database deletion and Telegram storage deletion are separate operations
 * (spec §48). A failure here must never roll back or mask the database result,
 * so every error is swallowed and counted instead.
 *
 * @param {Array<{telegram_chat_id: string, telegram_message_id: string}>} refs
 * @returns {Promise<{deleted: number, failed: number}>}
 */
export async function purgeTelegramMessages(refs) {
  let deleted = 0;
  let failed = 0;

  for (const ref of refs || []) {
    if (!ref?.telegram_message_id) {
      continue;
    }

    try {
      await deleteMessage(ref.telegram_chat_id, ref.telegram_message_id);
      deleted++;
    } catch (err) {
      failed++;
      console.warn(
        '[WARN] Could not delete Telegram message',
        ref.telegram_chat_id,
        ref.telegram_message_id,
        err.message
      );
    }
  }

  return { deleted, failed };
}

/**
 * Build a short human-readable report for Telegram storage cleanup.
 * @param {number} deleted - Messages successfully removed
 * @param {number} failed - Messages that could not be removed
 * @returns {string}
 */
function telegramCleanupReport(deleted, failed) {
  if (deleted === 0 && failed === 0) {
    return '\n\n<i>No stored Telegram messages to clean up.</i>';
  }

  let report = `\n\nTelegram storage: ${deleted} message(s) removed`;
  if (failed > 0) {
    report += `, ${failed} could not be removed (logged).`;
  }
  return report;
}
