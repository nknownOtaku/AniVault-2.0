/**
 * Admin keyboard - Main menu
 */
export function getAdminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '➕ Add Anime', callback_data: 'admin_add_anime' }],
      [{ text: '📚 List Anime', callback_data: 'admin_list_anime' }],
      [{ text: '🗑 Delete Anime', callback_data: 'admin_delete_anime' }]
    ]
  };
}

/**
 * AniList search results keyboard
 * @param {Array} results - Array of anime results
 * @param {number} page - Current page
 */
export function getAniListSearchKeyboard(results, page = 1) {
  const keyboard = {
    inline_keyboard: []
  };

  results.forEach((anime, index) => {
    const title = anime.title.english || anime.title.romaji || 'Unknown';
    keyboard.inline_keyboard.push([
      {
        text: `${index + 1}. ${title}`,
        callback_data: `anilist_select_${anime.id}_${page}`
      }
    ]);
  });

  // Navigation buttons
  const navRow = [];
  
  if (page > 1) {
    navRow.push({
      text: '⬅️ Previous',
      callback_data: `anilist_page_${page - 1}`
    });
  }
  
  navRow.push({
    text: '➡️ Next',
    callback_data: `anilist_page_${page + 1}`
  });

  keyboard.inline_keyboard.push(navRow);

  return keyboard;
}

/**
 * Anime details keyboard
 * @param {number} anilistId - AniList ID
 */
export function getAnimeDetailsKeyboard(anilistId) {
  return {
    inline_keyboard: [
      [{ text: '➕ Add Season', callback_data: `add_season_${anilistId}` }],
      [{ text: '🔙 Back', callback_data: 'admin_add_anime' }]
    ]
  };
}

/**
 * Anime list keyboard
 * @param {Array} animeList - Array of anime from database
 */
export function getAnimeListKeyboard(animeList) {
  const keyboard = {
    inline_keyboard: []
  };

  animeList.forEach((anime) => {
    keyboard.inline_keyboard.push([
      {
        text: anime.title,
        callback_data: `view_anime_${anime.id}`
      }
    ]);
  });

  keyboard.inline_keyboard.push([
    { text: '🔙 Back', callback_data: 'admin_menu' }
  ]);

  return keyboard;
}

/**
 * Season management keyboard
 * @param {string} animeId - Anime ID
 * @param {Array} seasons - Array of seasons
 */
export function getSeasonManagementKeyboard(animeId, seasons) {
  const keyboard = {
    inline_keyboard: []
  };

  seasons.forEach((season) => {
    keyboard.inline_keyboard.push([
      {
        text: season.name,
        callback_data: `view_season_${season.id}`
      }
    ]);
  });

  keyboard.inline_keyboard.push(
    [{ text: '➕ Add Season', callback_data: `add_season_${animeId}` }],
    [{ text: '🔙 Back', callback_data: 'admin_list_anime' }]
  );

  return keyboard;
}

/**
 * Episode management keyboard
 * @param {string} seasonId - Season ID
 * @param {Array} episodes - Array of episodes
 */
export function getEpisodeManagementKeyboard(seasonId, episodes) {
  const keyboard = {
    inline_keyboard: []
  };

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
    [{ text: '🗑 Remove Season', callback_data: `delete_season_confirm_${seasonId}` }],
    [{ text: '🔙 Back', callback_data: 'back_to_seasons' }]
  );

  return keyboard;
}

/**
 * Upload complete keyboard
 */
export function getUploadCompleteKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Done', callback_data: 'upload_done' }]
    ]
  };
}

/**
 * Review upload keyboard
 */
export function getReviewUploadKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Confirm', callback_data: 'confirm_upload' }],
      [{ text: '✏️ Edit', callback_data: 'edit_upload' }],
      [{ text: '❌ Cancel', callback_data: 'cancel_upload' }]
    ]
  };
}

/**
 * Duplicate action keyboard
 */
export function getDuplicateActionKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Overwrite', callback_data: 'duplicate_overwrite' }],
      [{ text: 'Ignore', callback_data: 'duplicate_ignore' }],
      [{ text: 'Overwrite All', callback_data: 'duplicate_overwrite_all' }],
      [{ text: 'Ignore All', callback_data: 'duplicate_ignore_all' }]
    ]
  };
}

/**
 * Delete confirmation keyboard
 * @param {string} action - Action type (anime, season, episode, file)
 * @param {string} id - Item ID
 */
export function getDeleteConfirmationKeyboard(action, id) {
  return {
    inline_keyboard: [
      [
        { text: '⚠️ DELETE', callback_data: `delete_${action}_${id}` },
        { text: 'Cancel', callback_data: `cancel_delete_${action}_${id}` }
      ]
    ]
  };
}

/**
 * Token generation keyboard
 * @param {string} itemType - Type of item (season, episode, file)
 * @param {string} itemId - Item ID
 */
export function getTokenGenerationKeyboard(itemType, itemId) {
  return {
    inline_keyboard: [
      [{ text: '🔑 Generate Token', callback_data: `generate_token_${itemType}_${itemId}` }],
      [{ text: '🔙 Back', callback_data: `back_to_${itemType}s` }]
    ]
  };
}
