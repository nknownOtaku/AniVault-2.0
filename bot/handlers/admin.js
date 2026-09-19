import { editMessageText, sendMessage, answerCallbackQuery } from '../../lib/telegram.js';
import { supabase } from '../../lib/supabase.js';
import { clearAdminState, setAdminState, BotState } from '../../lib/session.js';
import { generateId, generateToken } from '../../lib/tokens.js';

const CLEAR_DATABASE_PHRASE = 'CLEAR DATABASE';

/**
 * Handle maintenance callbacks from the admin menu.
 * @param {object} callbackQuery
 */
export async function handleAdminCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const userId = callbackQuery.from.id;

  if (callbackQuery.data === 'admin_stats') {
    await showDatabaseStats(chatId, messageId);
  } else if (callbackQuery.data === 'admin_repair_tokens') {
    await repairMissingFileTokens(chatId, messageId);
  } else if (callbackQuery.data === 'admin_cleanup_uploads') {
    await cleanupStaleUploads(chatId, messageId);
  } else if (callbackQuery.data === 'admin_clear_database') {
    await requestDatabaseClear(chatId, messageId, userId);
  } else if (callbackQuery.data === 'admin_clear_database_cancel') {
    await clearAdminState(userId, chatId);
    await editMessageText(chatId, messageId, 'Maintenance cancelled.');
  }

  await answerCallbackQuery(callbackQuery.id);
}

/**
 * Require a typed confirmation before deleting catalog content.
 * @param {object} message
 */
export async function handleDatabaseClearConfirmation(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const confirmation = String(message.text || '').trim().toUpperCase();

  if (confirmation !== CLEAR_DATABASE_PHRASE) {
    await sendMessage(
      chatId,
      'Database clear cancelled. Type <code>CLEAR DATABASE</code> exactly to continue, or use /start to leave this action.'
    );
    return;
  }

  try {
    // Remove temporary rows first, then the catalog root. Foreign-key cascades
    // remove seasons, episodes, files, languages, and their tokens.
    for (const table of ['upload_files', 'upload_sessions', 'anime']) {
      const { error } = await supabase.from(table).delete().neq('id', '');
      if (error) {
        throw error;
      }
    }

    await clearAdminState(userId, chatId);
    await sendMessage(chatId, 'Database cleared successfully. Your admin session was preserved.');
  } catch (error) {
    console.error('Error clearing database:', error);
    await clearAdminState(userId, chatId);
    await sendMessage(chatId, 'Database clear failed. No further destructive actions were attempted.');
  }
}

async function requestDatabaseClear(chatId, messageId, userId) {
  await setAdminState(userId, chatId, BotState.WAITING_DATABASE_CLEAR_CONFIRM, {});

  await editMessageText(
    chatId,
    messageId,
    `<b>Clear Database</b>\n\nThis permanently removes all anime, seasons, episodes, files, tokens, and pending uploads.\n\nThe admin session is preserved.\n\nType <code>${CLEAR_DATABASE_PHRASE}</code> to confirm.`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Cancel', callback_data: 'admin_clear_database_cancel' }
        ]]
      }
    }
  );
}

async function showDatabaseStats(chatId, messageId) {
  try {
    const tables = [
      ['anime'],
      ['seasons'],
      ['episodes'],
      ['files'],
      ['start_tokens'],
      ['upload_sessions', 'pending'],
      ['upload_files', 'pending']
    ];
    const counts = await Promise.all(tables.map(async ([table, status]) => {
      let query = supabase.from(table).select('id', { count: 'exact', head: true });
      if (status) {
        query = query.eq('status', status);
      }

      const { count, error } = await query;

      if (error) {
        throw error;
      }

      return [table, count || 0];
    }));

    const countMap = Object.fromEntries(counts);
    const text = `<b>Library Status</b>\n\nAnime: ${countMap.anime}\nSeasons: ${countMap.seasons}\nEpisodes: ${countMap.episodes}\nFiles: ${countMap.files}\nTokens: ${countMap.start_tokens}\nPending Upload Sessions: ${countMap.upload_sessions}\nPending Upload Files: ${countMap.upload_files}`;

    await editMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Refresh', callback_data: 'admin_stats' }],
          [{ text: 'Repair File Tokens', callback_data: 'admin_repair_tokens' }],
          [{ text: 'Clean Stale Uploads', callback_data: 'admin_cleanup_uploads' }],
          [{ text: 'Back', callback_data: 'admin_menu' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error loading database stats:', error);
    await editMessageText(chatId, messageId, 'Unable to load database statistics right now.');
  }
}

async function repairMissingFileTokens(chatId, messageId) {
  try {
    const { data: files, error: fileError } = await supabase
      .from('files')
      .select('id');

    if (fileError) {
      throw fileError;
    }

    const fileIds = (files || []).map((file) => file.id);
    if (fileIds.length === 0) {
      await editMessageText(chatId, messageId, 'No files need token repair.');
      return;
    }

    const { data: tokens, error: tokenError } = await supabase
      .from('start_tokens')
      .select('file_id')
      .eq('token_type', 'file')
      .in('file_id', fileIds);

    if (tokenError) {
      throw tokenError;
    }

    const existingIds = new Set((tokens || []).map((token) => token.file_id));
    const missingIds = fileIds.filter((fileId) => !existingIds.has(fileId));

    if (missingIds.length > 0) {
      const { error } = await supabase.from('start_tokens').insert(
        missingIds.map((fileId) => ({
          id: generateId('TOK'),
          token: generateToken(30),
          token_type: 'file',
          file_id: fileId
        }))
      );

      if (error) {
        throw error;
      }
    }

    await editMessageText(chatId, messageId, `Token repair complete. Added ${missingIds.length} missing file token(s).`);
  } catch (error) {
    console.error('Error repairing file tokens:', error);
    await editMessageText(chatId, messageId, 'Token repair failed. No further repairs were attempted.');
  }
}

async function cleanupStaleUploads(chatId, messageId) {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: sessions, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('id')
      .eq('status', 'pending')
      .lt('updated_at', cutoff);

    if (sessionError) {
      throw sessionError;
    }

    const sessionIds = (sessions || []).map((session) => session.id);
    if (sessionIds.length > 0) {
      const { error: filesError } = await supabase
        .from('upload_files')
        .delete()
        .in('upload_session_id', sessionIds);

      if (filesError) {
        throw filesError;
      }

      const { error: deleteError } = await supabase
        .from('upload_sessions')
        .delete()
        .in('id', sessionIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    await editMessageText(chatId, messageId, `Stale upload cleanup complete. Removed ${sessionIds.length} abandoned session(s).`);
  } catch (error) {
    console.error('Error cleaning stale uploads:', error);
    await editMessageText(chatId, messageId, 'Stale upload cleanup failed.');
  }
}
