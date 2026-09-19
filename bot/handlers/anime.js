import { sendMessage, editMessageText, answerCallbackQuery } from '../../lib/telegram.js';
import { getAniListSearchKeyboard, getAnimeDetailsKeyboard } from '../keyboards/admin.js';
import { searchAnime, getAnimeDetails } from '../../lib/anilist.js';
import { supabase } from '../../lib/supabase.js';
import { generateId } from '../../lib/tokens.js';
import { setAdminState, getAdminState, BotState } from '../../lib/session.js';

/**
 * Handle callback queries related to anime management
 * @param {object} callbackQuery - Telegram callback query object
 */
export async function handleAnimeCallback(callbackQuery) {
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
  if (data === 'admin_add_anime') {
    await handleAddAnime(chatId, messageId, userId);
  } else if (data.startsWith('anilist_page_')) {
    const page = parseInt(data.replace('anilist_page_', ''), 10);
    await handleAniListPage(chatId, messageId, userId, page);
  } else if (data.startsWith('anilist_select_')) {
    const parts = data.replace('anilist_select_', '').split('_');
    const anilistId = parseInt(parts[0], 10);
    await handleAniListSelect(chatId, messageId, userId, anilistId);
  } else if (data === 'admin_list_anime') {
    await handleListAnime(chatId, messageId);
  } else if (data === 'admin_delete_anime') {
    await handleListAnime(chatId, messageId, 'delete');
  } else if (data.startsWith('view_anime_')) {
    const animeId = data.replace('view_anime_', '');
    await handleViewAnime(chatId, messageId, animeId, userId);
  } else if (data === 'back_to_anime') {
    await handleListAnime(chatId, messageId);
  } else if (data.startsWith('delete_anime_confirm_')) {
    const animeId = data.replace('delete_anime_confirm_', '');
    await handleDeleteAnimeConfirm(chatId, messageId, animeId);
  } else if (data.startsWith('delete_anime_')) {
    const animeId = data.replace('delete_anime_', '');
    await handleDeleteAnime(chatId, messageId, animeId);
  } else if (data.startsWith('cancel_delete_anime_')) {
    const animeId = data.replace('cancel_delete_anime_', '');
    await handleViewAnime(chatId, messageId, animeId, userId);
  }

  await answerCallbackQuery(callbackQuery.id);
}

/**
 * Handle add anime action
 */
async function handleAddAnime(chatId, messageId, userId) {
  // Persist the state so the next text message is routed as an anime title.
  await setAdminState(userId, chatId, BotState.WAITING_ANIME_TITLE, {});

  const text = `
<b>Add New Anime</b>

Enter the anime title to search on AniList:

Example:
<code>Jujutsu Kaisen</code>
`;

  await editMessageText(chatId, messageId, text);
}

/**
 * Handle AniList pagination
 */
async function handleAniListPage(chatId, messageId, userId, page) {
  const session = await getAdminState(userId);
  const searchTerm = session?.data?.searchTerm;

  if (!searchTerm) {
    await editMessageText(
      chatId,
      messageId,
      '❌ Search context expired. Please start over with /start.'
    );
    return;
  }

  await renderAniListResults(chatId, messageId, userId, searchTerm, page);
}

/**
 * Handle AniList selection
 */
async function handleAniListSelect(chatId, messageId, userId, anilistId) {
  try {
    const details = await getAnimeDetails(anilistId);

    const title = details.title.english || details.title.romaji || 'Unknown';
    const nativeTitle = details.title.native || '';
    const format = details.format || 'Unknown';
    const status = details.status || 'Unknown';
    const episodes = details.episodes || '?';
    const description = (details.description || 'No description').replace(/<[^>]*>/g, '').substring(0, 500);
    const coverImage = details.coverImage?.large;
    const bannerImage = details.bannerImage || null;
    const year = details.seasonYear || '?';
    const startDate = formatAniListDate(details.startDate);
    const endDate = formatAniListDate(details.endDate);

    // Persist the anime so the season/episode workflow has a record to attach to.
    const animeId = await upsertAnimeRecord({
      anilistId,
      title,
      nativeTitle,
      description,
      posterUrl: coverImage,
      bannerUrl: bannerImage,
      format,
      status,
      startDate,
      endDate
    });

    const text = `
<b>${title}</b> ${nativeTitle ? `<i>(${nativeTitle})</i>` : ''}

<b>Format:</b> ${format}
<b>Status:</b> ${status}
<b>Episodes:</b> ${episodes}
<b>Year:</b> ${year}

<b>Description:</b>
${description}...

Ready to add a season.
`;

    await editMessageText(chatId, messageId, text, {
      reply_markup: getAnimeDetailsKeyboard(animeId)
    });

    // We've moved past the search list into viewing a specific anime.
    await setAdminState(userId, chatId, BotState.VIEWING_ANIME, { anilistId, anime_id: animeId });
  } catch (error) {
    console.error('Error getting anime details:', error);
    await editMessageText(chatId, messageId, '❌ Error fetching anime details from AniList.');
  }
}

/**
 * Convert an AniList fuzzy date object into an ISO date string (or null).
 * @param {object} date - AniList date { year, month, day }
 * @returns {string|null} ISO date string
 */
function formatAniListDate(date) {
  if (!date || !date.year) {
    return null;
  }
  const month = String(date.month || 1).padStart(2, '0');
  const day = String(date.day || 1).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

/**
 * Create or update the `anime` row for an AniList entry.
 * Returns the internal anime ID.
 *
 * @param {object} anime - Anime fields to persist
 * @returns {Promise<string>} Internal anime ID
 */
async function upsertAnimeRecord(anime) {
  const { data: existing } = await supabase
    .from('anime')
    .select('id')
    .eq('anilist_id', anime.anilistId)
    .maybeSingle();

  const payload = {
    anilist_id: anime.anilistId,
    title: anime.title,
    native_title: anime.nativeTitle || null,
    description: anime.description || null,
    poster_url: anime.posterUrl || null,
    banner_url: anime.bannerUrl || null,
    format: anime.format || null,
    status: anime.status || null,
    start_date: anime.startDate || null,
    end_date: anime.endDate || null,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const { error } = await supabase
      .from('anime')
      .update(payload)
      .eq('id', existing.id);

    if (error) {
      throw error;
    }

    return existing.id;
  }

  const animeId = generateId('ANM');
  const { error } = await supabase
    .from('anime')
    .insert({ id: animeId, ...payload });

  if (error) {
    throw error;
  }

  return animeId;
}

/**
 * Handle delete anime confirmation
 */
async function handleDeleteAnimeConfirm(chatId, messageId, animeId) {
  try {
    const { data: anime } = await supabase
      .from('anime')
      .select('id, title, seasons(id)')
      .eq('id', animeId)
      .maybeSingle();

    if (!anime) {
      await editMessageText(chatId, messageId, '❌ Anime not found.');
      return;
    }

    const text = `
⚠️ <b>DELETE ANIME</b>

${anime.title}

This will remove the anime and all its seasons,
episodes and files.

Are you sure?
`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⚠️ DELETE', callback_data: `delete_anime_${animeId}` },
          { text: 'Cancel', callback_data: `cancel_delete_anime_${animeId}` }
        ]
      ]
    };

    await editMessageText(chatId, messageId, text, {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error confirming anime delete:', error);
    await editMessageText(chatId, messageId, '❌ Error preparing delete confirmation.');
  }
}

/**
 * Handle actual anime deletion.
 *
 * `seasons`, `episodes`, `files`, `anime_languages` and `start_tokens` all
 * reference the anime with ON DELETE CASCADE, so the delete fans out on its
 * own. `upload_sessions` is the exception: its anime_id/season_id columns were
 * declared without CASCADE, so any leftover (often abandoned) upload session
 * makes PostgreSQL reject the whole delete with a foreign-key violation.
 *
 * Those temporary rows are meaningless once the anime is gone, so they are
 * cleared first and only then is the anime removed.
 */
async function handleDeleteAnime(chatId, messageId, animeId) {
  try {
    const { data: anime } = await supabase
      .from('anime')
      .select('id, title')
      .eq('id', animeId)
      .maybeSingle();

    if (!anime) {
      await editMessageText(chatId, messageId, '❌ Anime not found.');
      return;
    }

    // Gather the season ids so upload_sessions pointing at *either* the anime
    // or one of its seasons can be removed.
    const { data: seasons } = await supabase
      .from('seasons')
      .select('id')
      .eq('anime_id', animeId);

    const seasonIds = (seasons || []).map((s) => s.id);

    const { error: sessionError } = await supabase
      .from('upload_sessions')
      .delete()
      .or(
        [
          `anime_id.eq.${animeId}`,
          seasonIds.length ? `season_id.in.(${seasonIds.join(',')})` : null
        ]
          .filter(Boolean)
          .join(',')
      );

    if (sessionError) {
      // Not fatal on its own - report it, but still attempt the anime delete
      // in case the reference came from somewhere else entirely.
      console.warn('Could not clear upload_sessions before delete:', sessionError.message);
    }

    const { error } = await supabase.from('anime').delete().eq('id', animeId);

    if (error) {
      throw error;
    }

    await editMessageText(
      chatId,
      messageId,
      `✅ <b>${anime.title}</b> deleted successfully.`
    );
  } catch (error) {
    console.error('Error deleting anime:', error);
    await editMessageText(
      chatId,
      messageId,
      `❌ Error deleting anime.\n\n<code>${escapeHtml(error.message)}</code>`
    );
  }
}

/**
 * Escape text for safe interpolation into an HTML-parsed Telegram message.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Handle list anime action.
 *
 * @param {number} chatId - Telegram chat ID
 * @param {number} messageId - Message ID to edit
 * @param {'manage'|'delete'} [mode] - Which entry point opened the list. In
 *   'delete' mode each row jumps straight to its delete confirmation.
 */
async function handleListAnime(chatId, messageId, mode = 'manage') {
  try {
    const { data: animeList, error } = await supabase
      .from('anime')
      .select('id, title, anilist_id')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (!animeList || animeList.length === 0) {
      await editMessageText(chatId, messageId, '📚 No anime in the database yet.\n\nUse "Add Anime" to get started.');
      return;
    }

    const isDeleteMode = mode === 'delete';

    const text = isDeleteMode
      ? '🗑 <b>Delete Anime</b>\n\nSelect an anime to delete:'
      : '<b>Anime Library</b>\n\nSelect an anime to manage:';

    const keyboard = {
      inline_keyboard: animeList.map((anime) => [
        {
          text: anime.title,
          callback_data: isDeleteMode
            ? `delete_anime_confirm_${anime.id}`
            : `view_anime_${anime.id}`
        }
      ])
    };
    keyboard.inline_keyboard.push([{ text: '🔙 Back', callback_data: 'admin_menu' }]);

    await editMessageText(chatId, messageId, text, {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error listing anime:', error);
    await editMessageText(chatId, messageId, '❌ Error retrieving anime list.');
  }
}

/**
 * Handle view anime details
 */
async function handleViewAnime(chatId, messageId, animeId, userId) {
  try {
    const { data: anime, error } = await supabase
      .from('anime')
      .select('*, seasons(*)')
      .eq('id', animeId)
      .maybeSingle();

    if (error || !anime) {
      await editMessageText(chatId, messageId, '❌ Anime not found.');
      return;
    }

    // Persist the anime so the season view can navigate back to it.
    if (userId) {
      await setAdminState(userId, chatId, BotState.VIEWING_ANIME, { anime_id: animeId });
    }

    const seasonCount = anime.seasons?.length || 0;
    
    const text = `
<b>${anime.title}</b>

Seasons: ${seasonCount}

Select a season to manage or add a new one.
`;

    // TODO: Import getSeasonManagementKeyboard
    const keyboard = {
      inline_keyboard: []
    };

    if (anime.seasons) {
      anime.seasons.forEach((season) => {
        keyboard.inline_keyboard.push([
          { text: season.name, callback_data: `view_season_${season.id}` }
        ]);
      });
    }

    keyboard.inline_keyboard.push(
      [{ text: '➕ Add Season', callback_data: `add_season_db_${animeId}` }],
      [{ text: '🗑 Delete Anime', callback_data: `delete_anime_confirm_${animeId}` }],
      [{ text: '🔙 Back', callback_data: 'admin_list_anime' }]
    );

    await editMessageText(chatId, messageId, text, {
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error viewing anime:', error);
    await editMessageText(chatId, messageId, '❌ Error retrieving anime details.');
  }
}

/**
 * Handle text messages for anime workflow
 * @param {object} message - Telegram message object
 * @param {string} state - Current bot state
 */
export async function handleAnimeMessage(message, state) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text;

  if (state === BotState.WAITING_ANIME_TITLE) {
    await handleAnimeTitleInput(chatId, userId, text);
  }
}

/**
 * Search AniList and render the results list.
 * Stores the search term and page on the admin session so the Next/Previous
 * buttons know what to re-query.
 *
 * @param {number} chatId - Telegram chat ID
 * @param {number} messageId - Message ID to edit (null to send a new message)
 * @param {number} userId - Telegram user ID
 * @param {string} searchTerm - AniList search query
 * @param {number} page - Results page
 */
async function renderAniListResults(chatId, messageId, userId, searchTerm, page) {
  const results = await searchAnime(searchTerm, page);

  if (!results || results.length === 0) {
    const emptyText = '❌ No more results found. Please try a different title.';
    if (messageId) {
      await editMessageText(chatId, messageId, emptyText);
    } else {
      await sendMessage(chatId, emptyText);
    }
    return;
  }

  // Persist the current search context so pagination works.
  await setAdminState(userId, chatId, BotState.SELECTING_ANIME, {
    searchTerm,
    page
  });

  const keyboard = getAniListSearchKeyboard(results, page);

  let resultText = `🔍 <b>Search Results</b> (page ${page})\n\nSelect the correct anime:\n\n`;
  results.forEach((anime, index) => {
    const animeTitle = anime.title.english || anime.title.romaji || 'Unknown';
    const format = anime.format || 'Unknown';
    const episodes = anime.episodes || '?';
    resultText += `${index + 1}. <b>${animeTitle}</b> (${format}, ${episodes} eps)\n`;
  });

  const options = { reply_markup: keyboard };

  if (messageId) {
    await editMessageText(chatId, messageId, resultText, options);
  } else {
    await sendMessage(chatId, resultText, options);
  }
}

/**
 * Handle anime title input
 */
async function handleAnimeTitleInput(chatId, userId, title) {
  try {
    if (!title || !title.trim()) {
      await sendMessage(chatId, '❌ Please enter a valid anime title.');
      return;
    }

    const searchTerm = title.trim();

    await sendMessage(chatId, `🔍 Searching AniList for "<b>${searchTerm}</b>"...`);

    await renderAniListResults(chatId, null, userId, searchTerm, 1);
  } catch (error) {
    console.error('Error searching AniList:', error);
    await sendMessage(chatId, '❌ Error searching AniList. Please try again.');
  }
}
