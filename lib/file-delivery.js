import { supabase } from './supabase.js';
import { generateId, generateToken } from './tokens.js';
import { editMessageText, getBotUsername, sendDocument, sendMessage } from './telegram.js';

async function getOrCreateFileToken(fileId) {
  const { data: existingTokens, error: lookupError } = await supabase
    .from('start_tokens')
    .select('token')
    .eq('token_type', 'file')
    .eq('file_id', fileId)
    .limit(1);

  if (lookupError) throw lookupError;
  if (existingTokens?.[0]?.token) return existingTokens[0].token;

  const token = generateToken(30);
  const { error: insertError } = await supabase.from('start_tokens').insert({
    id: generateId('TOK'),
    token,
    token_type: 'file',
    file_id: fileId
  });

  if (insertError) throw insertError;
  return token;
}

/**
 * Deliver a file with a scheduled chat-message deletion and follow-up notice.
 * @param {object} options
 * @param {number|string} options.chatId
 * @param {string} options.fileId
 * @param {string} options.telegramFileId
 * @param {string} options.caption
 * @param {string} [options.filename]
 * @param {string} [options.startToken]
 */
export async function sendTemporaryFile({ chatId, fileId, telegramFileId, caption, filename, startToken }) {
  const token = startToken || await getOrCreateFileToken(fileId);
  const botUsername = await getBotUsername();
  const fileUrl = `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`;
  const fileResponse = await sendDocument(chatId, telegramFileId, caption, { filename: filename || undefined });
  const fileMessageId = fileResponse?.result?.message_id;

  if (!fileMessageId) {
    throw new Error('Telegram did not return the delivered file message ID.');
  }

  const noticeText = [
    '<blockquote>⧗ To respect content rights, this file message will be automatically deleted within 10 minutes. Please do not redistribute content without permission.</blockquote>',
    '<blockquote>≡ Note: VLC Player or MX Player may provide a better viewing experience.</blockquote>'
  ].join('\n\n');
  let noticeResponse;
  try {
    noticeResponse = await sendMessage(chatId, noticeText, {
      reply_parameters: { message_id: fileMessageId }
    });
  } catch (error) {
    console.error('Could not send file expiry notice; delivered file was kept:', error.message);
    return fileResponse;
  }
  const noticeMessageId = noticeResponse?.result?.message_id;

  if (!noticeMessageId) {
    console.error('Telegram did not return the notice message ID; delivered file was kept.');
    return fileResponse;
  }

  const dueAt = new Date(Date.now() + 9 * 60 * 1000).toISOString();
  const { error: scheduleError } = await supabase.from('scheduled_message_deletions').insert({
    telegram_chat_id: String(chatId),
    file_message_id: fileMessageId,
    notice_message_id: noticeMessageId,
    file_url: fileUrl,
    due_at: dueAt
  });

  if (scheduleError) {
    console.error('Could not schedule file message deletion:', scheduleError);
    await editMessageText(
      chatId,
      noticeMessageId,
      '<blockquote>⧗ Automatic deletion could not be scheduled. This file will remain available until you close it.</blockquote>'
    );
  }

  return fileResponse;
}