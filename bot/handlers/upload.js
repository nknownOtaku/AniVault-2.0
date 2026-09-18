import { sendMessage, editMessageText, answerCallbackQuery } from '../../lib/telegram.js';
import { supabase } from '../../lib/supabase.js';
import { generateId, generateToken } from '../../lib/tokens.js';
import { parseFilename } from '../../lib/parser.js';

/**
 * Handle file upload and episode management
 */

/**
 * Handle uploaded document/video files
 * @param {object} message - Telegram message object
 * @param {string} seasonId - Current season ID from session
 */
export async function handleFileUpload(message, seasonId) {
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

  // Store in temporary upload session
  // TODO: Implement upload_sessions and upload_files tables
  try {
    const uploadFileId = generateId('UFL');
    
    const { error } = await supabase
      .from('upload_files')
      .insert({
        id: uploadFileId,
        upload_session_id: seasonId, // Using seasonId temporarily
        filename,
        telegram_file_id: fileId,
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
 * @param {string} seasonId - Season ID
 */
export async function handleUploadDone(callbackQuery, seasonId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  try {
    // Get all uploaded files for this session
    const { data: uploadFiles } = await supabase
      .from('upload_files')
      .select('*')
      .eq('upload_session_id', seasonId)
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

    // Build review text
    let reviewText = `
━━━━━━━━━━━━━━━━━━━━
<b>UPLOAD REVIEW</b>
━━━━━━━━━━━━━━━━━━━━

Files: ${uploadFiles.length}
Episodes: ${episodesMap.size}

`;

    episodesMap.forEach((files, epNum) => {
      reviewText += `<b>Episode ${epNum}</b>\n`;
      files.forEach((file) => {
        const p = file.parsed_data;
        reviewText += `  • ${p.quality} ${p.languageType.toUpperCase()}\n`;
      });
      reviewText += '\n';
    });

    reviewText += `
━━━━━━━━━━━━━━━━━━━━

[✅ Confirm] [✏️ Edit] [❌ Cancel]
`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Confirm', callback_data: 'confirm_upload' }],
        [{ text: '✏️ Edit', callback_data: 'edit_upload' }],
        [{ text: '❌ Cancel', callback_data: 'cancel_upload' }]
      ]
    };

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
 * Confirm and save upload to database
 * @param {object} callbackQuery - Telegram callback query
 * @param {string} seasonId - Season ID
 */
export async function handleConfirmUpload(callbackQuery, seasonId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  try {
    // Get pending upload files
    const { data: uploadFiles } = await supabase
      .from('upload_files')
      .select('*')
      .eq('upload_session_id', seasonId)
      .eq('status', 'pending');

    if (!uploadFiles || uploadFiles.length === 0) {
      await editMessageText(chatId, messageId, '❌ No files to confirm.');
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

    let totalFiles = 0;
    let totalEpisodes = 0;

    // Process each episode
    for (const [epNum, files] of episodesMap) {
      totalEpisodes++;
      
      // Create or get episode
      const episodeId = generateId('EPI');
      
      const { data: episode } = await supabase
        .from('episodes')
        .insert({
          id: episodeId,
          season_id: seasonId,
          episode_number: epNum,
          title: `Episode ${epNum}`
        })
        .select()
        .single();

      if (!episode) {
        // Episode might already exist, fetch it
        const { data: existingEpisode } = await supabase
          .from('episodes')
          .select('id')
          .eq('season_id', seasonId)
          .eq('episode_number', epNum)
          .single();
        
        if (existingEpisode) {
          // Handle duplicate episode
          // TODO: Implement duplicate handling logic
        }
      }

      // Process each file for this episode
      for (const file of files) {
        totalFiles++;
        const parsed = file.parsed_data;
        const fileId = generateId('FIL');

        // Check for duplicates
        const { data: existingFile } = await supabase
          .from('files')
          .select('id')
          .eq('episode_id', episodeId)
          .eq('quality', parsed.quality)
          .eq('language_type', parsed.languageType)
          .eq('language', parsed.language)
          .single();

        if (existingFile) {
          // Duplicate detected
          // TODO: Handle duplicate (overwrite/ignore)
          continue;
        }

        // Insert file record
        await supabase
          .from('files')
          .insert({
            id: fileId,
            episode_id: episodeId,
            quality: parsed.quality,
            resolution: parsed.resolution,
            language_type: parsed.languageType,
            language: parsed.language,
            filename: file.filename,
            extension: parsed.extension,
            mime_type: file.mime_type,
            file_size: file.file_size,
            telegram_file_id: file.telegram_file_id,
            telegram_chat_id: process.env.TELEGRAM_ADMIN_ID
          });

        // Update upload file status
        await supabase
          .from('upload_files')
          .update({ status: 'processed' })
          .eq('id', file.id);
      }
    }

    // Generate tokens for the season
    const seasonToken = generateToken(30);
    await supabase
      .from('start_tokens')
      .insert({
        token: seasonToken,
        token_type: 'season',
        season_id: seasonId
      });

    await editMessageText(chatId, messageId, `
✅ <b>Upload Complete!</b>

Episodes created: ${totalEpisodes}
Files saved: ${totalFiles}

Season Token: <code>${seasonToken}</code>
`);

  } catch (error) {
    console.error('Error confirming upload:', error);
    await editMessageText(chatId, messageId, '❌ Error saving upload to database.');
  }
}

/**
 * Handle cancel upload
 */
export async function handleCancelUpload(callbackQuery, seasonId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  try {
    // Delete pending upload files
    await supabase
      .from('upload_files')
      .delete()
      .eq('upload_session_id', seasonId)
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
 * @param {string} episodeId - Episode ID
 */
export async function handleViewEpisode(callbackQuery, episodeId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  try {
    const { data: episode } = await supabase
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
      .single();

    if (!episode) {
      await editMessageText(chatId, messageId, '❌ Episode not found.');
      return;
    }

    const animeTitle = episode.season?.anime?.title || 'Unknown';
    const seasonName = episode.season?.name || 'Unknown';
    const fileCount = episode.files?.length || 0;

    let filesText = '';
    if (episode.files) {
      episode.files.forEach((file) => {
        filesText += `\n• ${file.quality} ${file.language_type.toUpperCase()} (${file.language})`;
      });
    }

    const text = `
<b>${animeTitle}</b>
${seasonName}
<b>Episode ${episode.episode_number}</b>

Files: ${fileCount}${filesText}

Select a file to download or generate access token.
`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔑 Generate Token', callback_data: `generate_token_episode_${episodeId}` }],
        [{ text: '🗑 Delete Episode', callback_data: `delete_episode_confirm_${episodeId}` }],
        [{ text: '🔙 Back', callback_data: 'back_to_episodes' }]
      ]
    };

    await editMessageText(chatId, messageId, text, {
      reply_markup: keyboard
    });

    await answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Error viewing episode:', error);
    await editMessageText(chatId, messageId, '❌ Error retrieving episode details.');
  }
}
