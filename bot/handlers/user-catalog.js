import { sendDocument, sendMessage, editMessageText, answerCallbackQuery } from '../../lib/telegram.js';
import { supabase } from '../../lib/supabase.js';
import { getUserHomeKeyboard, getUserBackKeyboard, getUserAnimeKeyboard, getUserEpisodeKeyboard, getUserFileKeyboard } from '../keyboards/user.js';

const UserState = { IDLE: 'IDLE', WAITING_SEARCH: 'WAITING_SEARCH' };

export async function handleUserHome(message) {
  const chatId = message.chat.id;
  await saveUserSession(message.from.id, chatId, UserState.IDLE, {});
  await sendMessage(chatId, '<b>Welcome to AniVault</b>\n\nSearch and download authorized anime episodes directly from Telegram.', { reply_markup: getUserHomeKeyboard() });
}

export async function handleUserMessage(message) {
  const chatId = message.chat.id;
  const session = await getUserSession(message.from.id);
  if (session?.state !== UserState.WAITING_SEARCH) {
    await handleUserHome(message);
    return;
  }

  const query = String(message.text || '').trim();
  if (!query) {
    await sendMessage(chatId, 'Please enter an anime name to search.');
    return;
  }

  await saveUserSession(message.from.id, chatId, UserState.IDLE, {});
  await renderSearchResults(chatId, query);
}

export async function handleUserCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data || '';

  try {
    if (data === 'user_home') {
      await editMessageText(chatId, messageId, '<b>AniVault</b>\n\nChoose an action:', { reply_markup: getUserHomeKeyboard() });
    } else if (data === 'user_search') {
      await saveUserSession(userId, chatId, UserState.WAITING_SEARCH, {});
      await editMessageText(chatId, messageId, '<b>Search Anime</b>\n\nEnter an anime name:');
    } else if (data === 'user_browse') {
      await renderBrowse(chatId, messageId);
    } else if (data === 'user_latest') {
      await renderLatest(chatId, messageId);
    } else if (data === 'user_downloads') {
      await renderDownloads(chatId, messageId, userId);
    } else if (data === 'user_favorites') {
      await renderFavorites(chatId, messageId, userId);
    } else if (data === 'user_settings') {
      await editMessageText(chatId, messageId, '<b>Settings</b>\n\nLanguage and delivery preferences are ready for future configuration.', { reply_markup: getUserBackKeyboard() });
    } else if (data.startsWith('user_anime_')) {
      await renderAnime(chatId, messageId, data.replace('user_anime_', ''));
    } else if (data.startsWith('user_season_')) {
      await renderSeason(chatId, messageId, data.replace('user_season_', ''));
    } else if (data.startsWith('user_episode_nav_')) {
      await renderEpisodeNavigation(chatId, messageId, data.replace('user_episode_nav_', ''));
    } else if (data.startsWith('user_episode_')) {
      await renderEpisode(chatId, messageId, data.replace('user_episode_', ''));
    } else if (data.startsWith('user_file_')) {
      await deliverFile(chatId, userId, data.replace('user_file_', ''));
    } else if (data.startsWith('user_favorite_')) {
      await toggleFavorite(chatId, messageId, userId, data.replace('user_favorite_', ''));
    }
  } catch (error) {
    console.error('User callback error:', error);
    await editMessageText(chatId, messageId, 'Something went wrong. Please return home and try again.', { reply_markup: getUserBackKeyboard() });
  } finally {
    await answerCallbackQuery(callbackQuery.id);
  }
}

async function renderSearchResults(chatId, query, messageId = null) {
  const { data: anime, error } = await supabase.from('anime').select('id, title').ilike('title', `%${query}%`).order('title', { ascending: true }).limit(20);
  if (error) throw error;
  const keyboard = { inline_keyboard: (anime || []).map((entry) => [{ text: entry.title, callback_data: `user_anime_${entry.id}` }]).concat([[{ text: '🏠 Home', callback_data: 'user_home' }]]) };
  const text = anime?.length ? `<b>Search Results</b>\n\nResults for: ${escapeHtml(query)}` : `No anime found for: ${escapeHtml(query)}`;
  if (messageId) await editMessageText(chatId, messageId, text, { reply_markup: keyboard });
  else await sendMessage(chatId, text, { reply_markup: keyboard });
}

async function renderBrowse(chatId, messageId) {
  const { data: anime, error } = await supabase.from('anime').select('id, title').order('title', { ascending: true }).limit(30);
  if (error) throw error;
  const keyboard = { inline_keyboard: (anime || []).map((entry) => [{ text: entry.title, callback_data: `user_anime_${entry.id}` }]).concat([[{ text: '🏠 Home', callback_data: 'user_home' }]]) };
  await editMessageText(chatId, messageId, '<b>Browse Anime</b>\n\nChoose a series:', { reply_markup: keyboard });
}

async function renderLatest(chatId, messageId) {
  const { data: episodes, error } = await supabase.from('episodes').select('id, episode_number, season(id, name, anime(id, title))').order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  const keyboard = { inline_keyboard: (episodes || []).map((episode) => [{ text: `${episode.season?.anime?.title || 'Anime'} · EP ${episode.episode_number}`, callback_data: `user_episode_${episode.id}` }]).concat([[{ text: '🏠 Home', callback_data: 'user_home' }]]) };
  await editMessageText(chatId, messageId, '<b>Latest Episodes</b>\n\nChoose an episode:', { reply_markup: keyboard });
}

async function renderAnime(chatId, messageId, animeId) {
  const { data: anime, error } = await supabase.from('anime').select('id, title, format, status, seasons(id, season_number, name)').eq('id', animeId).maybeSingle();
  if (error) throw error;
  if (!anime) return editMessageText(chatId, messageId, 'Anime not found.', { reply_markup: getUserBackKeyboard() });
  const text = `<b>${escapeHtml(anime.title)}</b>\n\nFormat: ${escapeHtml(anime.format || 'Unknown')}\nStatus: ${escapeHtml(anime.status || 'Unknown')}\nSeasons: ${(anime.seasons || []).length}`;
  await editMessageText(chatId, messageId, text, { reply_markup: getUserAnimeKeyboard(anime) });
}

async function renderSeason(chatId, messageId, seasonId) {
  const { data: season, error } = await supabase.from('seasons').select('id, name, anime(id, title), episodes(id, episode_number, title)').eq('id', seasonId).maybeSingle();
  if (error) throw error;
  if (!season) return editMessageText(chatId, messageId, 'Season not found.', { reply_markup: getUserBackKeyboard() });
  const episodes = (season.episodes || []).slice().sort((a, b) => a.episode_number - b.episode_number);
  await editMessageText(chatId, messageId, `<b>${escapeHtml(season.anime?.title || 'Anime')}</b>\n${escapeHtml(season.name)}\n\nChoose an episode:`, { reply_markup: getUserEpisodeKeyboard(episodes) });
}

async function renderEpisode(chatId, messageId, episodeId) {
  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('id, season_id, episode_number, title')
    .eq('id', episodeId)
    .maybeSingle();

  if (episodeError) throw episodeError;
  if (!episode) return editMessageText(chatId, messageId, 'Episode not found.', { reply_markup: getUserBackKeyboard() });

  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id, name, anime_id')
    .eq('id', episode.season_id)
    .maybeSingle();

  const { data: files, error: filesError } = await supabase
    .from('files')
    .select('id, quality, language_type, language')
    .eq('episode_id', episode.id)
    .order('quality', { ascending: true });

  if (seasonError || filesError) throw seasonError || filesError;

  const { data: anime, error: animeError } = await supabase
    .from('anime')
    .select('title')
    .eq('id', season?.anime_id)
    .maybeSingle();

  if (animeError) throw animeError;

  const sortedFiles = (files || []).sort((a, b) => String(a.quality).localeCompare(String(b.quality)));
  const text = `<b>${escapeHtml(anime?.title || 'Anime')}</b>\n${escapeHtml(season?.name || '')}\nEpisode ${episode.episode_number}\n\nAvailable files:`;
  await editMessageText(chatId, messageId, text, { reply_markup: getUserFileKeyboard(sortedFiles, episode.id, season?.id) });
}

async function renderEpisodeNavigation(chatId, messageId, episodeId) {
  const { data: current } = await supabase.from('episodes').select('id, episode_number, season_id').eq('id', episodeId).maybeSingle();
  if (!current) return renderEpisode(chatId, messageId, episodeId);
  const { data: next } = await supabase.from('episodes').select('id').eq('season_id', current.season_id).gt('episode_number', current.episode_number).order('episode_number', { ascending: true }).limit(1).maybeSingle();
  await renderEpisode(chatId, messageId, next?.id || current.id);
}

async function deliverFile(chatId, userId, fileId) {
  const { data: file, error } = await supabase.from('files').select('id, filename, telegram_file_id, quality, language_type, language, episodes(episode_number, season(name, anime(title)))').eq('id', fileId).maybeSingle();
  if (error) throw error;
  if (!file?.telegram_file_id) return sendMessage(chatId, 'This file is currently unavailable.');
  const caption = `${file.episodes?.season?.anime?.title || 'Anime'}\n${file.episodes?.season?.name || ''}\nEpisode ${file.episodes?.episode_number || '?'}\n${file.quality} ${String(file.language_type || '').toUpperCase()} (${file.language || 'Unknown'})`;
  await sendDocument(chatId, file.telegram_file_id, caption, { filename: file.filename || undefined });
  const { error: historyError } = await supabase.from('user_downloads').insert({ telegram_user_id: String(userId), file_id: file.id, quality: file.quality, language_type: file.language_type, language: file.language });
  if (historyError) console.warn('Could not record user download:', historyError.message);
}

async function toggleFavorite(chatId, messageId, userId, animeId) {
  const { data: existing } = await supabase.from('user_favorites').select('id').eq('telegram_user_id', String(userId)).eq('anime_id', animeId).maybeSingle();
  if (existing) {
    await supabase.from('user_favorites').delete().eq('id', existing.id);
    await editMessageText(chatId, messageId, 'Removed from favorites.', { reply_markup: getUserBackKeyboard() });
  } else {
    await supabase.from('user_favorites').insert({ telegram_user_id: String(userId), anime_id: animeId });
    await editMessageText(chatId, messageId, 'Added to favorites.', { reply_markup: getUserBackKeyboard() });
  }
}

async function renderFavorites(chatId, messageId, userId) {
  const { data: favorites, error } = await supabase.from('user_favorites').select('anime(id, title)').eq('telegram_user_id', String(userId)).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  const keyboard = { inline_keyboard: (favorites || []).filter((item) => item.anime).map((item) => [{ text: item.anime.title, callback_data: `user_anime_${item.anime.id}` }]).concat([[{ text: '🏠 Home', callback_data: 'user_home' }]]) };
  await editMessageText(chatId, messageId, '<b>My Favorites</b>\n\nChoose a series:', { reply_markup: keyboard });
}

async function renderDownloads(chatId, messageId, userId) {
  const { data: downloads, error } = await supabase.from('user_downloads').select('quality, language_type, files(filename, episodes(episode_number, season(name, anime(title))))').eq('telegram_user_id', String(userId)).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  const lines = (downloads || []).map((download) => `${download.files?.episodes?.season?.anime?.title || 'Anime'} · EP ${download.files?.episodes?.episode_number || '?'} · ${download.quality} ${String(download.language_type || '').toUpperCase()}`);
  await editMessageText(chatId, messageId, `<b>My Downloads</b>\n\n${lines.length ? lines.join('\n') : 'No downloads yet.'}`, { reply_markup: getUserBackKeyboard() });
}

async function getUserSession(userId) {
  const { data } = await supabase.from('user_sessions').select('*').eq('telegram_user_id', String(userId)).maybeSingle();
  return data;
}

async function saveUserSession(userId, chatId, state, data) {
  const { error } = await supabase.from('user_sessions').upsert({ telegram_user_id: String(userId), chat_id: String(chatId), state, data, updated_at: new Date().toISOString() }, { onConflict: 'telegram_user_id' });
  if (error) throw error;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
