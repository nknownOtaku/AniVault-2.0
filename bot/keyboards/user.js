export function getUserHomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔎 Search Anime', callback_data: 'user_search' }],
      [{ text: '📚 Browse Anime', callback_data: 'user_browse' }],
      [{ text: '🆕 Latest Episodes', callback_data: 'user_latest' }],
      [{ text: '📥 My Downloads', callback_data: 'user_downloads' }],
      [{ text: '❤️ My Favorites', callback_data: 'user_favorites' }],
      [{ text: '⚙️ Settings', callback_data: 'user_settings' }]
    ]
  };
}

export function getUserBackKeyboard() {
  return {
    inline_keyboard: [[{ text: '🏠 Home', callback_data: 'user_home' }]]
  };
}

export function getUserAnimeKeyboard(anime) {
  const seasons = (anime.seasons || [])
    .slice()
    .sort((a, b) => (a.season_number || 0) - (b.season_number || 0));

  return {
    inline_keyboard: [
      ...seasons.map((season) => [{
        text: season.name || `Season ${season.season_number}`,
        callback_data: `user_season_${season.id}`
      }]),
      [{ text: '❤️ Add Favorite', callback_data: `user_favorite_${anime.id}` }],
      [{ text: '🔎 Search', callback_data: 'user_search' }],
      [{ text: '🏠 Home', callback_data: 'user_home' }]
    ]
  };
}

export function getUserEpisodeKeyboard(episodes) {
  const rows = [];
  for (let index = 0; index < episodes.length; index += 2) {
    rows.push(episodes.slice(index, index + 2).map((episode) => ({
      text: `EP ${String(episode.episode_number).padStart(2, '0')}`,
      callback_data: `user_episode_${episode.id}`
    })));
  }

  rows.push([{ text: '🏠 Home', callback_data: 'user_home' }]);
  return { inline_keyboard: rows };
}

export function getUserFileKeyboard(files, episodeId, seasonId) {
  const rows = (files || []).map((file) => [{
    text: `${file.quality} ${String(file.language_type || '').toUpperCase()}${file.language ? ` · ${file.language}` : ''}`,
    callback_data: `user_file_${file.id}`
  }]);

  rows.push(
    [{ text: '⏮ Previous / Next', callback_data: `user_episode_nav_${episodeId}` }],
    [{ text: '📺 Season', callback_data: `user_season_${seasonId}` }],
    [{ text: '🏠 Home', callback_data: 'user_home' }]
  );

  return { inline_keyboard: rows };
}
