import { sendMessage, editMessageText, answerCallbackQuery } from '../../lib/telegram.js';
import { supabase } from '../../lib/supabase.js';
import { generateId } from '../../lib/tokens.js';
import { setAdminState, BotState } from '../../lib/session.js';

/**
 * Handle season-related callbacks
 * @param {object} callbackQuery - Telegram callback query object
 */
export async function handleSeasonCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  // Verify admin
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (String(userId) !== String(adminId)) {
    await answerCallbackQuery(callbackQuery.id, '⛔ Access denied');
    return;
  }

  // Parse callback data
  if (data.startsWith('add_season_')) {
    const anilistId = data.replace('add_season_', '');
    await handleAddSeason(chatId, messageId, userId, anilistId);
  } else if (data.startsWith('add_season_db_')) {
    const animeId = data.replace('add_season_db_', '');
    await handleAddSeasonDb(chatId, messageId, userId, animeId);
  } else if (data.startsWith('view_season_')) {
    const seasonId = data.replace('view_season_', '');
    await handleViewSeason(chatId, messageId, seasonId);
  } else if (data.startsWith('delete_season_confirm_')) {
    const seasonId = data.replace('delete_season_confirm_', '');
    await handleDeleteSeasonConfirm(chatId, messageId, seasonId);
  } else if (data.startsWith('delete_season_')) {
    const seasonId = data.replace('delete_season_', '');
    await handleDeleteSeason(chatId, messageId, seasonId);
  }

  await answerCallbackQuery(callbackQuery.id);
}

/**
 * Handle add season (from AniList selection)
 */
async function handleAddSeason(chatId, messageId, userId, animeId) {
  // The anime row is created when the admin selects it from AniList search.
  try {
    const { data: animeData } = await supabase
      .from('anime')
      .select('id')
      .eq('id', animeId)
      .maybeSingle();

    if (!animeData) {
      // Anime record is missing - the selection step didn't persist it.
      await editMessageText(chatId, messageId, '❌ Anime not found. Please add it again from the menu.');
      return;
    }

    const text = `
<b>Add Season</b>

Enter the season name:

Example:
<code>Season 1</code>
`;

    // Persist state so the next text message is treated as the season name.
    await setAdminState(userId, chatId, BotState.WAITING_SEASON_NAME, { anime_id: animeId });

    await editMessageText(chatId, messageId, text);
  } catch (error) {
    console.error('Error adding season:', error);
    await editMessageText(chatId, messageId, '❌ Error preparing season creation.');
  }
}

/**
 * Handle add season from database anime
 */
async function handleAddSeasonDb(chatId, messageId, userId, animeId) {
  // Persist state so the next text message is treated as the season name.
  await setAdminState(userId, chatId, BotState.WAITING_SEASON_NAME, { anime_id: animeId });

  const text = `
<b>Add Season</b>

Enter the season name:

Example:
<code>Season 1</code>
`;

  await editMessageText(chatId, messageId, text);
}

/**
 * Handle view season details
 */
async function handleViewSeason(chatId, messageId, seasonId) {
  try {
    const { data: season, error } = await supabase
      .from('seasons')
      .select(`
        *,
        anime (
          id,
          title
        ),
        episodes (*)
      `)
      .eq('id', seasonId)
      .single();

    if (error || !season) {
      await editMessageText(chatId, messageId, '❌ Season not found.');
      return;
    }

    const episodeCount = season.episodes?.length || 0;
    const animeTitle = season.anime?.title || 'Unknown';

    const text = `
<b>${animeTitle}</b>
<b>${season.name}</b>

Episodes: ${episodeCount}

Select an episode to manage or add new ones.
`;

    const keyboard = {
      inline_keyboard: []
    };

    if (season.episodes) {
      season.episodes.forEach((episode) => {
        keyboard.inline_keyboard.push([
          {
            text: `Episode ${episode.episode_number}`,
            callback_data: `view_episode_${episode.id}`
          }
        ]);
      });
    }

    keyboard.inline_keyboard.push(
      [{ text: '➕ Add Episode', callback_data: `add_episode_${seasonId}` }],
      [{ text: '🗑 Remove Season', callback_data: `delete_season_confirm_${seasonId}` }],
      [{ text: '🔙 Back', callback_data: 'back_to_seasons' }]
    );

    await editMessageText(chatId, messageId, text, {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error viewing season:', error);
    await editMessageText(chatId, messageId, '❌ Error retrieving season details.');
  }
}

/**
 * Handle delete season confirmation
 */
async function handleDeleteSeasonConfirm(chatId, messageId, seasonId) {
  try {
    const { data: season } = await supabase
      .from('seasons')
      .select(`
        *,
        episodes (*)
      `)
      .eq('id', seasonId)
      .single();

    if (!season) {
      await editMessageText(chatId, messageId, '❌ Season not found.');
      return;
    }

    const episodeCount = season.episodes?.length || 0;
    const fileCount = season.episodes?.reduce((acc, ep) => acc + (ep.file_count || 0), 0) || 0;

    const text = `
⚠️ <b>DELETE SEASON</b>

${season.name}

This contains:
${episodeCount} episodes
${fileCount} files

Are you sure?
`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⚠️ DELETE', callback_data: `delete_season_${seasonId}` },
          { text: 'Cancel', callback_data: `cancel_delete_season_${seasonId}` }
        ]
      ]
    };

    await editMessageText(chatId, messageId, text, {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error confirming delete:', error);
    await editMessageText(chatId, messageId, '❌ Error preparing delete confirmation.');
  }
}

/**
 * Handle actual season deletion
 */
async function handleDeleteSeason(chatId, messageId, seasonId) {
  try {
    // Delete in transaction-like manner
    // First delete files, then episodes, then season
    const { error } = await supabase
      .from('seasons')
      .delete()
      .eq('id', seasonId);

    if (error) {
      throw error;
    }

    await editMessageText(chatId, messageId, '✅ Season deleted successfully.');
  } catch (error) {
    console.error('Error deleting season:', error);
    await editMessageText(chatId, messageId, '❌ Error deleting season.');
  }
}

/**
 * Handle season name input message
 * @param {object} message - Telegram message object
 * @param {string} animeId - Anime ID from session
 */
export async function handleSeasonNameInput(message, animeId) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const seasonName = message.text.trim();

  if (!seasonName) {
    await sendMessage(chatId, '❌ Please enter a valid season name.');
    return;
  }

  try {
    // Create season
    const seasonId = generateId('SEA');

    const { data: season, error } = await supabase
      .from('seasons')
      .insert({
        id: seasonId,
        anime_id: animeId,
        name: seasonName,
        season_number: 1 // TODO: Auto-increment based on existing seasons
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const text = `
✅ Season created: <b>${seasonName}</b>

Now upload the episode files for this season.

You can send multiple files. When you are finished, click:
`;

    // TODO: Import getUploadCompleteKeyboard
    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Done', callback_data: 'upload_done' }]
      ]
    };

    await sendMessage(chatId, text, {
      reply_markup: keyboard
    });

    // Move into the file-upload state, binding the new season to the session.
    await setAdminState(userId, chatId, BotState.WAITING_FILES, { season_id: seasonId });
  } catch (error) {
    console.error('Error creating season:', error);
    await sendMessage(chatId, '❌ Error creating season.');
  }
}
