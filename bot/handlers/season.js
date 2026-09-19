import { sendMessage, editMessageText, answerCallbackQuery } from '../../lib/telegram.js';
import { supabase } from '../../lib/supabase.js';
import { generateId } from '../../lib/tokens.js';
import { setAdminState, getAdminState, BotState } from '../../lib/session.js';

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

  // Parse callback data.
  // NOTE: check 'add_season_db_' before 'add_season_' - the shorter prefix
  // would otherwise swallow the longer one and corrupt the ID.
  if (data.startsWith('add_season_db_')) {
    const animeId = data.replace('add_season_db_', '');
    await handleAddSeasonDb(chatId, messageId, userId, animeId);
  } else if (data.startsWith('add_season_')) {
    const animeId = data.replace('add_season_', '');
    await handleAddSeason(chatId, messageId, userId, animeId);
  } else if (data.startsWith('add_episode_')) {
    const seasonId = data.replace('add_episode_', '');
    await handleAddEpisode(chatId, messageId, userId, seasonId);
  } else if (data.startsWith('view_season_')) {
    const seasonId = data.replace('view_season_', '');
    await handleViewSeason(chatId, messageId, seasonId, userId);
  } else if (data === 'back_to_seasons') {
    await handleBackToSeasons(chatId, messageId, userId);
  } else if (data.startsWith('cancel_delete_season_')) {
    const seasonId = data.replace('cancel_delete_season_', '');
    await handleViewSeason(chatId, messageId, seasonId, userId);
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
 * Handle add season from database anime.
 *
 * Entered from the anime view, so the anime id is known. The only work here is
 * persisting the state that routes the admin's next text message to the season
 * name handler - which means any failure in that write would otherwise leave
 * the button looking dead. It is therefore wrapped like every other handler.
 */
async function handleAddSeasonDb(chatId, messageId, userId, animeId) {
  try {
    // Confirm the anime still exists before asking for a name, so a stale
    // button from an older message cannot create an orphaned season.
    const { data: anime, error } = await supabase
      .from('anime')
      .select('id')
      .eq('id', animeId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!anime) {
      await editMessageText(chatId, messageId, '❌ Anime not found. Please add it again from the menu.');
      return;
    }

    // Persist state so the next text message is treated as the season name.
    await setAdminState(userId, chatId, BotState.WAITING_SEASON_NAME, { anime_id: animeId });

    const text = `
<b>Add Season</b>

Enter the season name:

Example:
<code>Season 1</code>
`;

    await editMessageText(chatId, messageId, text);
  } catch (error) {
    console.error('Error adding season from anime view:', error);
    await editMessageText(
      chatId,
      messageId,
      '❌ Error starting season creation. Please try again from /start.'
    );
  }
}

/**
 * Handle view season details
 */
async function handleViewSeason(chatId, messageId, seasonId, userId) {
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
      .maybeSingle();

    if (error || !season) {
      await editMessageText(chatId, messageId, '❌ Season not found.');
      return;
    }

    // Persist the current season so child views (episodes) can navigate back.
    if (userId) {
      await setAdminState(userId, chatId, BotState.VIEWING_SEASON, {
        season_id: seasonId,
        anime_id: season.anime?.id || null
      });
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

    // Sort episodes by number so the list reads naturally.
    const episodes = (season.episodes || [])
      .slice()
      .sort((a, b) => a.episode_number - b.episode_number);

    episodes.forEach((episode) => {
      keyboard.inline_keyboard.push([
        {
          text: `Episode ${episode.episode_number}`,
          callback_data: `view_episode_${episode.id}`
        }
      ]);
    });

    keyboard.inline_keyboard.push(
      [{ text: '➕ Add Episode', callback_data: `add_episode_${seasonId}` }],
      // A season is the highest level a token can target - there is deliberately
      // no all-seasons token (spec §19).
      [{ text: '🔑 Generate Season Token', callback_data: `generate_token_season_${seasonId}` }],
      [{ text: '🗑 Remove Season', callback_data: `delete_season_confirm_${seasonId}` }],
      [{ text: '🔙 Back', callback_data: `view_anime_${season.anime?.id || ''}` }]
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
 * Return from a season view to the anime's season list.
 * The anime is resolved from the admin session persisted while browsing.
 *
 * @param {number} chatId - Telegram chat ID
 * @param {number} messageId - Message ID to edit
 * @param {number} userId - Telegram user ID
 */
async function handleBackToSeasons(chatId, messageId, userId) {
  const session = await getAdminState(userId);
  const animeId = session?.data?.anime_id;

  if (!animeId) {
    await editMessageText(chatId, messageId, '❌ Anime context expired. Please open the anime again from /start.');
    return;
  }

  const { handleAnimeCallback } = await import('./anime.js');
  await handleAnimeCallback({
    message: { chat: { id: chatId }, message_id: messageId },
    data: `view_anime_${animeId}`,
    from: { id: userId },
    id: `back_${Date.now()}`
  });
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
 * Handle "Add Episode" - moves the admin into the file-upload flow for the
 * selected season, reusing the existing upload_session + upload_files pipeline.
 *
 * @param {number} chatId - Telegram chat ID
 * @param {number} messageId - Message ID to edit
 * @param {number} userId - Telegram user ID
 * @param {string} seasonId - Season ID
 */
async function handleAddEpisode(chatId, messageId, userId, seasonId) {
  try {
    const { data: season, error } = await supabase
      .from('seasons')
      .select('id, name, anime_id')
      .eq('id', seasonId)
      .maybeSingle();

    if (error || !season) {
      await editMessageText(chatId, messageId, '❌ Season not found.');
      return;
    }

    // Reuse an existing pending upload session for this season, or create one.
    // upload_files.upload_session_id references upload_sessions(id), so a row
    // must exist before any file can be uploaded.
    const { data: existingUploadSession } = await supabase
      .from('upload_sessions')
      .select('id')
      .eq('season_id', seasonId)
      .eq('status', 'pending')
      .maybeSingle();

    let uploadSessionId = existingUploadSession?.id;

    if (!uploadSessionId) {
      uploadSessionId = generateId('UPL');

      const { error: createError } = await supabase
        .from('upload_sessions')
        .insert({
          id: uploadSessionId,
          telegram_user_id: String(userId),
          anime_id: season.anime_id,
          season_id: seasonId,
          status: 'pending'
        });

      if (createError) {
        throw createError;
      }
    }

    await setAdminState(userId, chatId, BotState.WAITING_FILES, {
      season_id: season.id,
      anime_id: season.anime_id,
      upload_session_id: uploadSessionId
    });

    const text = `
<b>Add Episode</b> - ${season.name}

Send the episode file(s) now.

Filename format:
<code>Title [S01-E01] [1080p] [sub].mkv</code>

You can send multiple files. When you are finished, click Done.
`;

    await editMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Done', callback_data: 'upload_done' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error adding episode:', error);
    await editMessageText(chatId, messageId, '❌ Error starting episode upload.');
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
    const { data: latestSeason } = await supabase
      .from('seasons')
      .select('season_number')
      .eq('anime_id', animeId)
      .order('season_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Create season
    const seasonId = generateId('SEA');

    const { error } = await supabase
      .from('seasons')
      .insert({
        id: seasonId,
        anime_id: animeId,
        name: seasonName,
        season_number: (latestSeason?.season_number || 0) + 1
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // upload_files.upload_session_id references upload_sessions(id), so a
    // session row must exist before any file upload can be recorded.
    const uploadSessionId = generateId('UPL');
    const { error: uploadSessionError } = await supabase
      .from('upload_sessions')
      .insert({
        id: uploadSessionId,
        telegram_user_id: String(userId),
        anime_id: animeId,
        season_id: seasonId,
        status: 'pending'
      });

    if (uploadSessionError) {
      throw uploadSessionError;
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

    // Move into the file-upload state, binding the season + upload session.
    await setAdminState(userId, chatId, BotState.WAITING_FILES, {
      season_id: seasonId,
      anime_id: animeId,
      upload_session_id: uploadSessionId
    });
  } catch (error) {
    console.error('Error creating season:', error);
    await sendMessage(chatId, '❌ Error creating season.');
  }
}
