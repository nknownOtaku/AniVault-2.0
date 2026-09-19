import { sendMessage, editMessageText, answerCallbackQuery } from '../../lib/telegram.js';
import { supabase } from '../../lib/supabase.js';
import { generateId, generateToken } from '../../lib/tokens.js';
import { parseFilename } from '../../lib/parser.js';
import { getAdminState } from '../../lib/session.js';
import { getReviewUploadKeyboard } from '../keyboards/admin.js';

/**
 * Handle file upload and episode management
 */

/**
 * Handle uploaded document/video files
 * @param {object} message - Telegram message object
 * @param {string} uploadSessionId - Current upload session ID from session
 */
export async function handleFileUpload(message, uploadSessionId) {
  const chatId = message.chat.id;

  // Get file info from document or video
  const file = message.document || message.video;

  if (!file) {
    await sendMessage(chatId, '❌ No file detected. Please send a valid document or video file.');
    return;
  }

  const filename = file.file_name;
  const fileId = file.file_id;
  const fileSize = file.file_size;
  const mimeType = file.mime_type;
  const telegramChatId = message.chat.id;
  const telegramMessageId = message.message_id;

  // Parse filename
  const parsed = parseFilename(filename);

  if (!parsed.valid) {
    const errorList = parsed.errors.join(', ');
    await sendMessage(chatId, `
⚠️ <b>Could not parse file</b>

<code>${filename}</code>

Missing: ${errorList}

Please rename the file or choose manual entry.
`);
    return;
  }

  if (!uploadSessionId) {
    await sendMessage(chatId, '❌ Upload session not found. Please add a season again from /start.');
    return;
  }

  // Store in temporary upload session
  try {
    const uploadFileId = generateId('UFL');

    const { error } = await supabase
      .from('upload_files')
      .insert({
        id: uploadFileId,
        upload_session_id: uploadSessionId,
        filename,
        telegram_file_id: fileId,
        telegram_chat_id: String(telegramChatId),
        telegram_message_id: String(telegramMessageId),
        file_size: fileSize,
        mime_type: mimeType,
        parsed_data: parsed,
        status: 'pending'
      });

    if (error) {
      throw error;
    }

    await sendMessage(chatId, `
✅ File received: <code>${filename}</code>

Parsed:
• Season: ${parsed.season}
• Episode: ${parsed.episode}
• Quality: ${parsed.quality}
• Language: ${parsed.languageType}
• Extension: ${parsed.extension}
`);
  } catch (error) {
    console.error('Error storing upload file:', error);
    await sendMessage(chatId, '❌ Error processing file. Please try again.');
  }
}

/**
 * Handle upload completion
 * @param {object} callbackQuery - Telegram callback query
 * @param {string} uploadSessionId - Upload session ID
 */
export async function handleUploadDone(callbackQuery, uploadSessionId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const userId = callbackQuery.from.id;

  try {
    const session = await getAdminState(userId);
    const seasonId = session?.data?.season_id;

    // Get all uploaded files for this session
    const { data: uploadFiles } = await supabase
      .from('upload_files')
      .select('*')
      .eq('upload_session_id', uploadSessionId)
      .eq('status', 'pending');

    if (!uploadFiles || uploadFiles.length === 0) {
      await answerCallbackQuery(callbackQuery.id, 'No files uploaded');
      return;
    }

    // Group by episode
    const episodesMap = new Map();

    uploadFiles.forEach((file) => {
      const parsed = file.parsed_data;
      const epNum = parsed.episode;

      if (!episodesMap.has(epNum)) {
        episodesMap.set(epNum, []);
      }
      episodesMap.get(epNum).push(file);
    });

    // Detect duplicates before building the review so the admin sees an
    // accurate warning count (spec §35 / §37).
    const duplicates = await findDuplicates(uploadFiles, seasonId);

    let reviewText = `
━━━━━━━━━━━━━━━━━━━━
<b>UPLOAD REVIEW</b>
━━━━━━━━━━━━━━━━━━━━

Files: ${uploadFiles.length}
Episodes: ${episodesMap.size}
Duplicates: ${duplicates.length}

`;

    episodesMap.forEach((files, epNum) => {
      reviewText += `<b>Episode ${epNum}</b>\n`;
      files.forEach((file) => {
        const p = file.parsed_data;
        reviewText += `  • ${p.quality} ${String(p.languageType).toUpperCase()}\n`;
      });
      reviewText += '\n';
    });

    reviewText += `━━━━━━━━━━━━━━━━━━━━`;

    // With duplicates present the admin must choose a strategy before the
    // commit, so the confirm row is replaced by the duplicate actions.
    const keyboard = duplicates.length > 0
      ? {
          inline_keyboard: [
            [
              { text: '♻️ Overwrite All', callback_data: 'duplicate_overwrite_all' },
              { text: '🙈 Ignore All', callback_data: 'duplicate_ignore_all' }
            ],
            [
              { text: '🔍 Review Each', callback_data: 'duplicate_review' },
              { text: '❌ Cancel', callback_data: 'cancel_upload' }
            ]
          ]
        }
      : getReviewUploadKeyboard();

    await editMessageText(chatId, messageId, reviewText, {
      reply_markup: keyboard
    });

    await answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Error reviewing upload:', error);
    await editMessageText(chatId, messageId, '❌ Error preparing upload review.');
  }
}

/**
 * Identify which uploaded files collide with an existing file row.
 *
 * The duplicate key is (episode_id, quality, language_type, language) - the
 * same key the database enforces with a UNIQUE constraint (spec §36).
 *
 * @param {Array} uploadFiles - Pending upload_files rows
 * @param {string} seasonId - Season the upload belongs to
 * @returns {Promise<Array<{uploadFile: object, existingFile: object, episodeNumber: number}>>}
 */
async function findDuplicates(uploadFiles, seasonId) {
  const duplicates = [];

  if (!seasonId) {
    return duplicates;
  }

  for (const uploadFile of uploadFiles) {
    const parsed = uploadFile.parsed_data || {};

    const { data: episode } = await supabase
      .from('episodes')
      .select('id')
      .eq('season_id', seasonId)
      .eq('episode_number', parsed.episode)
      .maybeSingle();

    if (!episode) {
      continue;
    }

    const { data: existingFile } = await supabase
      .from('files')
      .select('id, quality, language_type, language, filename')
      .eq('episode_id', episode.id)
      .eq('quality', parsed.quality)
      .eq('language_type', parsed.languageType)
      .eq('language', parsed.language)
      .maybeSingle();

    if (existingFile) {
      duplicates.push({
        uploadFile,
        existingFile,
        episodeNumber: parsed.episode
      });
    }
  }

  return duplicates;
}

/**
 * Confirm and save upload to database
 * @param {object} callbackQuery - Telegram callback query
 * @param {string} seasonId - Season ID
 */
export async function handleConfirmUpload(callbackQuery, uploadSessionId, seasonId, duplicateStrategy = 'ignore') {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const userId = callbackQuery.from.id;

  try {
    // The season is the anchor for the whole commit. It is resolved from the
    // session when the callback did not carry it, so the duplicate flow can
    // re-enter the commit without the caller re-supplying the id.
    if (!seasonId) {
      const session = await getAdminState(userId);
      seasonId = session?.data?.season_id;
    }

    if (!seasonId) {
      await editMessageText(chatId, messageId, '❌ Season context expired. Please add the season again from /start.');
      return;
    }

    // Get pending upload files
    const { data: uploadFiles } = await supabase
      .from('upload_files')
      .select('*')
      .eq('upload_session_id', uploadSessionId)
      .eq('status', 'pending');

    if (!uploadFiles || uploadFiles.length === 0) {
      await editMessageText(chatId, messageId, '❌ No files to confirm.');
      return;
    }

    const result = await commitUpload({
      seasonId,
      uploadFiles,
      duplicateStrategy
    });

    // Generate a season access token for the newly committed content.
    const seasonToken = generateToken(30);
    const { error: tokenError } = await supabase
      .from('start_tokens')
      .insert({
        id: generateId('TOK'),
        token: seasonToken,
        token_type: 'season',
        season_id: seasonId
      });

    if (tokenError) {
      // The media is already saved; a token failure must be reported but not
      // presented as a total failure.
      console.error('Failed to create season token:', tokenError);
    }

    let summary = `
✅ <b>Upload Complete!</b>

Episodes created: ${result.episodesCreated}
Files saved: ${result.filesSaved}`;

    if (result.duplicatesSkipped > 0) {
      summary += `\nDuplicates ignored: ${result.duplicatesSkipped}`;
    }
    if (result.duplicatesOverwritten > 0) {
      summary += `\nDuplicates overwritten: ${result.duplicatesOverwritten}`;
    }
    if (result.failures.length > 0) {
      summary += `\n⚠️ Failed: ${result.failures.length}`;
    }

    summary += tokenError
      ? '\n\n⚠️ The season token could not be generated. You can create one from the season view.'
      : `\n\nSeason Token: <code>${seasonToken}</code>`;

    await editMessageText(chatId, messageId, summary);

    // Close out the upload session so its files are not committed twice.
    await supabase
      .from('upload_sessions')
      .update({ status: 'completed' })
      .eq('id', uploadSessionId);
  } catch (error) {
    console.error('Error confirming upload:', error);
    await editMessageText(chatId, messageId, '❌ Error saving upload to database.');
  }
}

/**
 * Commit parsed upload files into episodes/files.
 *
 * Duplicates are handled according to `duplicateStrategy`:
 *   'overwrite' - replace the existing file row's media reference
 *   'ignore'    - leave the existing row untouched, skip the upload
 *
 * @param {object} params
 * @param {string} params.seasonId - Target season
 * @param {Array} params.uploadFiles - Pending upload_files rows
 * @param {'overwrite'|'ignore'} params.duplicateStrategy
 * @returns {Promise<{episodesCreated:number, filesSaved:number, duplicatesSkipped:number, duplicatesOverwritten:number, failures:Array}>}
 */
async function commitUpload({ seasonId, uploadFiles, duplicateStrategy }) {
  const stats = {
    episodesCreated: 0,
    filesSaved: 0,
    duplicatesSkipped: 0,
    duplicatesOverwritten: 0,
    failures: []
  };

  // Group by episode number so episodes are created once regardless of how
  // many quality/language variants each one has.
  const episodesMap = new Map();

  uploadFiles.forEach((file) => {
    const epNum = file.parsed_data?.episode;
    if (epNum == null) {
      stats.failures.push({ file: file.filename, reason: 'No episode number' });
      return;
    }
    if (!episodesMap.has(epNum)) {
      episodesMap.set(epNum, []);
    }
    episodesMap.get(epNum).push(file);
  });

  for (const [epNum, files] of episodesMap) {
    let episodeId;

    const { data: existingEpisode } = await supabase
      .from('episodes')
      .select('id')
      .eq('season_id', seasonId)
      .eq('episode_number', epNum)
      .maybeSingle();

    if (existingEpisode) {
      episodeId = existingEpisode.id;
    } else {
      episodeId = generateId('EPI');

      const { error: insertError } = await supabase
        .from('episodes')
        .insert({
          id: episodeId,
          season_id: seasonId,
          episode_number: epNum,
          title: `Episode ${epNum}`
        });

      if (insertError) {
        console.error('Failed to create episode:', epNum, insertError);
        stats.failures.push({ file: `Episode ${epNum}`, reason: insertError.message });
        continue;
      }

      stats.episodesCreated++;
    }

    for (const file of files) {
      const parsed = file.parsed_data;
      const filePayload = {
        quality: parsed.quality,
        resolution: parsed.resolution,
        language_type: parsed.languageType,
        language: parsed.language,
        filename: file.filename,
        extension: parsed.extension,
        mime_type: file.mime_type,
        file_size: file.file_size,
        telegram_file_id: file.telegram_file_id,
        telegram_chat_id: file.telegram_chat_id,
        telegram_message_id: file.telegram_message_id
      };

      // The duplicate key mirrors the DB UNIQUE constraint (spec §36) so this
      // check agrees with what the database would reject anyway.
      const { data: existingFile } = await supabase
        .from('files')
        .select('id')
        .eq('episode_id', episodeId)
        .eq('quality', parsed.quality)
        .eq('language_type', parsed.languageType)
        .eq('language', parsed.language)
        .maybeSingle();

      if (existingFile) {
        if (duplicateStrategy === 'overwrite') {
          const { error: updateError } = await supabase
            .from('files')
            .update({ ...filePayload, updated_at: new Date().toISOString() })
            .eq('id', existingFile.id);

          if (updateError) {
            stats.failures.push({ file: file.filename, reason: updateError.message });
            continue;
          }

          stats.duplicatesOverwritten++;
          await ensureFileToken(existingFile.id);
        } else {
          stats.duplicatesSkipped++;
        }

        await markUploadFileProcessed(file.id);
        continue;
      }

      const { error: fileError } = await supabase
        .from('files')
        .insert({ id: generateId('FIL'), episode_id: episodeId, ...filePayload });

      if (fileError) {
        console.error('Failed to insert file:', file.filename, fileError);
        stats.failures.push({ file: file.filename, reason: fileError.message });
        continue;
      }

      stats.filesSaved++;
      await markUploadFileProcessed(file.id);
      await ensureFileToken(fileId);
    }
  }

  return stats;
}

async function ensureFileToken(fileId) {
  const { data: existing } = await supabase
    .from('start_tokens')
    .select('id')
    .eq('token_type', 'file')
    .eq('file_id', fileId)
    .maybeSingle();

  if (existing) {
    return;
  }

  const { error } = await supabase.from('start_tokens').insert({
    id: generateId('TOK'),
    token: generateToken(30),
    token_type: 'file',
    file_id: fileId
  });

  if (error) {
    console.warn('Could not create file token:', fileId, error.message);
  }
}

/**
 * Flag a temporary upload row as processed.
 * A failure here is non-fatal: the media is already committed, so a stale
 * 'pending' flag would only cause a re-commit attempt.
 * @param {string} uploadFileId
 */
async function markUploadFileProcessed(uploadFileId) {
  try {
    await supabase
      .from('upload_files')
      .update({ status: 'processed' })
      .eq('id', uploadFileId);
  } catch (err) {
    console.warn('Could not mark upload file processed:', uploadFileId, err.message);
  }
}

/**
 * Handle the admin's duplicate strategy choice from the review screen.
 * Callback data:
 *   duplicate_overwrite_all -> commit everything, replacing collisions
 *   duplicate_ignore_all    -> commit everything, skipping collisions
 *
 * @param {object} callbackQuery - Telegram callback query
 * @param {'overwrite_all'|'ignore_all'} action
 */
export async function handleDuplicateStrategy(callbackQuery, action) {
  const strategy = action === 'overwrite_all' ? 'overwrite' : 'ignore';
  const userId = callbackQuery.from.id;

  const session = await getAdminState(userId);
  const uploadSessionId = session?.data?.upload_session_id;
  const seasonId = session?.data?.season_id;

  if (!uploadSessionId) {
    await answerCallbackQuery(callbackQuery.id, 'Upload session expired');
    return;
  }

  await handleConfirmUpload(callbackQuery, uploadSessionId, seasonId, strategy);
  await answerCallbackQuery(
    callbackQuery.id,
    strategy === 'overwrite' ? 'Overwriting duplicates' : 'Ignoring duplicates'
  );
}

/**
 * Handle cancel upload
 * @param {object} callbackQuery - Telegram callback query
 * @param {string} uploadSessionId - Upload session ID
 */
export async function handleCancelUpload(callbackQuery, uploadSessionId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  try {
    // Delete pending upload files
    await supabase
      .from('upload_files')
      .delete()
      .eq('upload_session_id', uploadSessionId)
      .eq('status', 'pending');

    await editMessageText(chatId, messageId, '❌ Upload cancelled.');
    await answerCallbackQuery(callbackQuery.id, 'Upload cancelled');
  } catch (error) {
    console.error('Error cancelling upload:', error);
    await editMessageText(chatId, messageId, '❌ Error cancelling upload.');
  }
}

/**
 * Handle view episode details
 * @param {object} callbackQuery - Telegram callback query
 * @param {string} episodeId - Episode ID (or 'back_to_episodes' from the Back button)
 */
export async function handleViewEpisode(callbackQuery, episodeId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  // The Back button routes here too but carries no episode id, so return to the
  // parent season view instead of attempting a lookup.
  if (!episodeId || episodeId === 'back_to_episodes') {
    await handleBackToEpisodes(callbackQuery);
    return;
  }

  try {
    // maybeSingle() returns null on zero rows instead of erroring, so a missing
    // episode produces a clean "not found" rather than a thrown exception.
    const { data: episode, error } = await supabase
      .from('episodes')
      .select(`
        *,
        season (
          id,
          name,
          anime (
            id,
            title
          )
        ),
        files (*)
      `)
      .eq('id', episodeId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching episode:', episodeId, error);
      await editMessageText(chatId, messageId, '❌ Error retrieving episode details.');
      return;
    }

    if (!episode) {
      await editMessageText(chatId, messageId, '❌ Episode not found.');
      return;
    }

    const animeTitle = episode.season?.anime?.title || 'Unknown';
    const seasonName = episode.season?.name || 'Unknown';
    const files = episode.files || [];

    let filesText = '';
    files.forEach((file) => {
      filesText += `\n• ${file.quality} ${file.language_type.toUpperCase()} (${file.language})\n  ID: <code>${file.id}</code>`;
    });

    const text = `
<b>${animeTitle}</b>
${seasonName}
<b>Episode ${episode.episode_number}</b>

Files: ${files.length}${filesText}

Use a file ID above to generate an access token or download.
`;

    // One button per file (keyed by the file id), plus per-episode actions.
    const keyboard = { inline_keyboard: [] };

    files.forEach((file) => {
      keyboard.inline_keyboard.push([
        {
          text: `🔑 ${file.quality} ${file.language_type.toUpperCase()} (${file.language})`,
          callback_data: `generate_token_file_${file.id}`
        }
      ]);
    });

    keyboard.inline_keyboard.push(
      [{ text: '🔑 Generate Episode Token', callback_data: `generate_token_episode_${episodeId}` }],
      [{ text: '🗑 Delete Episode', callback_data: `delete_episode_confirm_${episodeId}` }],
      [{ text: '🔙 Back', callback_data: `view_season_${episode.season?.id || ''}` }]
    );

    await editMessageText(chatId, messageId, text, {
      reply_markup: keyboard
    });

    await answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Error viewing episode:', error);
    await editMessageText(chatId, messageId, '❌ Error retrieving episode details.');
  }
}

/**
 * Return from an episode view to its parent season view.
 * The season is resolved from the admin session, which stores season_id while
 * the season/episode lists are being browsed.
 *
 * @param {object} callbackQuery - Telegram callback query
 */
async function handleBackToEpisodes(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const userId = callbackQuery.from.id;

  const session = await getAdminState(userId);
  const seasonId = session?.data?.season_id;

  if (!seasonId) {
    await editMessageText(chatId, messageId, '❌ Season context expired. Please open the season again from /start.');
    await answerCallbackQuery(callbackQuery.id);
    return;
  }

  // Delegate to the season handler so the exact same season view is reused.
  const { handleSeasonCallback } = await import('./season.js');
  await handleSeasonCallback({
    ...callbackQuery,
    data: `view_season_${seasonId}`
  });
}
/**
 * Generate an access token for an episode or a single file.
 * Callback data shapes:
 *   generate_token_episode_<episodeId>
 *   generate_token_file_<fileId>
 * The item id is everything after the type prefix, so ids containing
 * underscores are preserved.
 *
 * @param {object} callbackQuery - Telegram callback query
 */
export async function handleGenerateToken(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data || '';

  try {
    const token = generateToken(30);

    if (data.startsWith('generate_token_season_')) {
      const seasonId = data.replace('generate_token_season_', '');

      const { data: season } = await supabase
        .from('seasons')
        .select('id, name, anime_id, anime ( title )')
        .eq('id', seasonId)
        .maybeSingle();

      if (!season) {
        await editMessageText(chatId, messageId, '❌ Season not found.');
        await answerCallbackQuery(callbackQuery.id, 'Season not found');
        return;
      }

      const { error } = await supabase
        .from('start_tokens')
        .insert({
          id: generateId('TOK'),
          token,
          token_type: 'season',
          anime_id: season.anime_id,
          season_id: seasonId
        });

      if (error) {
        throw error;
      }

      await editMessageText(chatId, messageId, `
🔑 <b>Season Token</b>

${season.anime?.title || 'Unknown'}
${season.name}

<code>${token}</code>

Share this with users as:
<code>/start ${token}</code>
`);
    } else if (data.startsWith('generate_token_episode_')) {
      const episodeId = data.replace('generate_token_episode_', '');

      const { data: episode } = await supabase
        .from('episodes')
        .select('id, episode_number')
        .eq('id', episodeId)
        .maybeSingle();

      if (!episode) {
        await editMessageText(chatId, messageId, '❌ Episode not found.');
        await answerCallbackQuery(callbackQuery.id, 'Episode not found');
        return;
      }

      const { error } = await supabase
        .from('start_tokens')
        .insert({
          id: generateId('TOK'),
          token,
          token_type: 'episode',
          episode_id: episodeId
        });

      if (error) {
        throw error;
      }

      await editMessageText(chatId, messageId, `
🔑 <b>Episode Token</b>

Episode ${episode.episode_number}

<code>${token}</code>

Share this with users as:
<code>/start ${token}</code>
`);
    } else if (data.startsWith('generate_token_file_')) {
      const fileId = data.replace('generate_token_file_', '');

      const { data: file } = await supabase
        .from('files')
        .select('id, quality, language_type, language')
        .eq('id', fileId)
        .maybeSingle();

      if (!file) {
        await editMessageText(chatId, messageId, '❌ File not found.');
        await answerCallbackQuery(callbackQuery.id, 'File not found');
        return;
      }

      const { error } = await supabase
        .from('start_tokens')
        .insert({
          id: generateId('TOK'),
          token,
          token_type: 'file',
          file_id: fileId
        });

      if (error) {
        throw error;
      }

      await editMessageText(chatId, messageId, `
🔑 <b>File Token</b>

${file.quality} ${file.language_type.toUpperCase()} (${file.language})

<code>${token}</code>

Share this with users as:
<code>/start ${token}</code>
`);
    } else {
      await answerCallbackQuery(callbackQuery.id, 'Unknown token target');
      return;
    }

    await answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Error generating token:', error);
    await editMessageText(chatId, messageId, '❌ Error generating token.');
  }
}
