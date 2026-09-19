import { sendDocument, sendMessage } from '../../lib/telegram.js';
import { supabase } from '../../lib/supabase.js';

/**
 * User-facing token access.
 *
 * A user runs `/start <token>` where the token is a 30-character value created
 * by an admin. There are exactly three levels (spec §16-18):
 *
 *   season  -> list the episodes in the season
 *   episode -> list the available files for the episode
 *   file    -> deliver the single file
 *
 * There is deliberately NO all-seasons token: a season is the highest level a
 * token may represent.
 */

/**
 * Resolve and act on an access token.
 *
 * @param {number|string} chatId - Telegram chat ID to reply to
 * @param {string} token - The raw token from `/start <token>`
 */
export async function handleTokenAccess(chatId, token) {
  const cleanToken = String(token || '').trim();

  if (!cleanToken) {
    await sendMessage(chatId, '❌ No access token provided.');
    return;
  }

  try {
    const { data: tokenRow, error } = await supabase
      .from('start_tokens')
      .select('id, token, token_type, season_id, episode_id, file_id')
      .eq('token', cleanToken)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!tokenRow) {
      await sendMessage(chatId, '❌ Invalid or expired access token.');
      return;
    }

    switch (tokenRow.token_type) {
      case 'season':
        await handleSeasonToken(chatId, tokenRow);
        break;
      case 'episode':
        await handleEpisodeToken(chatId, tokenRow);
        break;
      case 'file':
        await handleFileToken(chatId, tokenRow);
        break;
      default:
        await sendMessage(chatId, '❌ Unknown token type.');
    }
  } catch (err) {
    console.error('Error resolving token:', err);
    await sendMessage(chatId, '❌ Error resolving the access token. Please try again.');
  }
}

/**
 * Season token: show the anime + season and list its episodes.
 * Each episode is labelled with a hint that an episode token is required.
 */
async function handleSeasonToken(chatId, tokenRow) {
  const { data: season } = await supabase
    .from('seasons')
    .select(`
      id,
      name,
      anime ( id, title ),
      episodes ( id, episode_number )
    `)
    .eq('id', tokenRow.season_id)
    .maybeSingle();

  if (!season) {
    await sendMessage(chatId, '❌ Season not found.');
    return;
  }

  const animeTitle = season.anime?.title || 'Unknown';
  const episodes = (season.episodes || [])
    .slice()
    .sort((a, b) => a.episode_number - b.episode_number);

  if (episodes.length === 0) {
    await sendMessage(
      chatId,
      `<b>${animeTitle}</b>\n${season.name}\n\nNo episodes available yet.`
    );
    return;
  }

  const list = episodes
    .map((ep) => `• Episode ${ep.episode_number}`)
    .join('\n');

  await sendMessage(
    chatId,
    `<b>${animeTitle}</b>\n${season.name}\n\n<b>Episodes:</b>\n${list}`
  );
}

/**
 * Episode token: show the episode and the files available for it.
 * Files are only downloadable through a file-level token, so we describe what
 * is available rather than exposing raw file IDs.
 */
async function handleEpisodeToken(chatId, tokenRow) {
  const { data: episode } = await supabase
    .from('episodes')
    .select(`
      id,
      episode_number,
      season ( name, anime ( title ) ),
      files ( id, quality, language_type, language )
    `)
    .eq('id', tokenRow.episode_id)
    .maybeSingle();

  if (!episode) {
    await sendMessage(chatId, '❌ Episode not found.');
    return;
  }

  const animeTitle = episode.season?.anime?.title || 'Unknown';
  const seasonName = episode.season?.name || 'Unknown';
  const files = episode.files || [];

  const header =
    `<b>${animeTitle}</b>\n${seasonName}\n<b>Episode ${episode.episode_number}</b>\n\n`;

  if (files.length === 0) {
    await sendMessage(chatId, `${header}No files available yet.`);
    return;
  }

  const available = files
    .map(
      (f) =>
        `• ${f.quality} ${String(f.language_type || '').toUpperCase()} (${f.language})`
    )
    .join('\n');

  await sendMessage(chatId, `${header}<b>Available:</b>\n${available}`);
}

/**
 * File token: deliver the single referenced file.
 *
 * The file is sent to the user using the stored Telegram file reference. The
 * media itself is never downloaded onto this server — Telegram serves it.
 */
async function handleFileToken(chatId, tokenRow) {
  const { data: file } = await supabase
    .from('files')
    .select(`
      id,
      quality,
      language_type,
      language,
      filename,
      telegram_file_id,
      episodes (
        episode_number,
        season ( name, anime ( title ) )
      )
    `)
    .eq('id', tokenRow.file_id)
    .maybeSingle();

  if (!file) {
    await sendMessage(chatId, '❌ File not found.');
    return;
  }

  if (!file.telegram_file_id) {
    await sendMessage(
      chatId,
      '❌ This file has no stored Telegram reference and cannot be delivered.'
    );
    return;
  }

  const animeTitle = file.episodes?.season?.anime?.title || 'Unknown';
  const seasonName = file.episodes?.season?.name || 'Unknown';
  const episodeNumber = file.episodes?.episode_number ?? '?';

  const caption = [
    `<b>${animeTitle}</b>`,
    seasonName,
    `Episode ${episodeNumber}`,
    `${file.quality} ${String(file.language_type || '').toUpperCase()} (${file.language})`
  ].join('\n');

  try {
    await sendDocument(chatId, file.telegram_file_id, caption, {
      filename: file.filename || undefined
    });
  } catch (err) {
    console.error('Error delivering file for token:', err);
    await sendMessage(
      chatId,
      '❌ The file could not be delivered right now. Please try again later.'
    );
  }
}
