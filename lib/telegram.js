import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ',
  i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ',
  q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

/**
 * Convert visible bot text to the requested small-cap style without changing
 * Telegram HTML tags or entities.
 * @param {string} value
 * @returns {string}
 */
export function toSmallCaps(value) {
  const text = String(value ?? '');
  const protectedParts = [];
  const protectedText = text.replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, (part) => {
    protectedParts.push(part);
    return `\u0000${protectedParts.length - 1}\u0000`;
  });

  const formatted = protectedText.replace(/(<[^>]*>|&[a-zA-Z0-9#]+;|[^<&]+)/g, (part) => {
    if (part.startsWith('<') || part.startsWith('&') || /^\u0000\d+\u0000$/.test(part)) {
      return part;
    }

    return [...part].map((character) => SMALL_CAPS[character.toLowerCase()] || character).join('');
  });

  return formatted.replace(/\u0000(\d+)\u0000/g, (_, index) => protectedParts[Number(index)]);
}

/**
 * Apply the bot's consistent visual language to message text.
 * @param {string} value
 * @returns {string}
 */
export function formatBotText(value) {
  return `<b>${toSmallCaps(value)}</b>`;
}

function formatKeyboard(keyboard) {
  if (!keyboard?.inline_keyboard) {
    return keyboard;
  }

  return {
    ...keyboard,
    inline_keyboard: keyboard.inline_keyboard.map((row) => row.map((button) => ({
      ...button,
      ...(button.text ? { text: toSmallCaps(button.text) } : {})
    })))
  };
}

/**
 * Send a message to a chat
 * @param {number} chatId - Telegram chat ID
 * @param {string} text - Message text
 * @param {object} options - Additional options (reply_markup, etc.)
 */
export async function sendMessage(chatId, text, options = {}) {
  try {
    const response = await axios.post(`${BASE_URL}/sendMessage`, {
      chat_id: chatId,
      text: formatBotText(text),
      parse_mode: 'HTML',
      ...options,
      ...(options.reply_markup ? { reply_markup: formatKeyboard(options.reply_markup) } : {})
    });

    return response.data;
  } catch (error) {
    console.error('Telegram sendMessage error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Edit a message
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID to edit
 * @param {string} text - New text
 * @param {object} options - Additional options
 */
export async function editMessageText(chatId, messageId, text, options = {}) {
  try {
    const response = await axios.post(`${BASE_URL}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text: formatBotText(text),
      parse_mode: 'HTML',
      ...options,
      ...(options.reply_markup ? { reply_markup: formatKeyboard(options.reply_markup) } : {})
    });

    return response.data;
  } catch (error) {
    console.error('Telegram editMessageText error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Answer a callback query
 * @param {string} callbackQueryId - Callback query ID
 * @param {string} text - Response text
 */
export async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    const response = await axios.post(`${BASE_URL}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text
    });

    return response.data;
  } catch (error) {
    console.error('Telegram answerCallbackQuery error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send a photo
 * @param {number} chatId - Chat ID
 * @param {string} photo - Photo URL or file_id
 * @param {string} caption - Caption text
 * @param {object} options - Additional options
 */
export async function sendPhoto(chatId, photo, caption = '', options = {}) {
  try {
    const response = await axios.post(`${BASE_URL}/sendPhoto`, {
      chat_id: chatId,
      photo,
      caption: formatBotText(caption),
      parse_mode: 'HTML',
      ...options
    });

    return response.data;
  } catch (error) {
    console.error('Telegram sendPhoto error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send a document (media file) to a chat.
 *
 * The `document` argument is a Telegram file_id reference, so the media is
 * served by Telegram rather than downloaded onto the server.
 *
 * @param {number} chatId - Chat ID
 * @param {string} document - Telegram file_id or URL
 * @param {string} caption - Caption text
 * @param {object} options - Additional options (e.g. { filename })
 */
export async function sendDocument(chatId, document, caption = '', options = {}) {
  const { filename, ...rest } = options;

  const payload = {
    chat_id: chatId,
    document,
    caption: formatBotText(caption),
    parse_mode: 'HTML',
    ...rest
  };

  // `filename` is only honoured by Telegram when re-uploading a URL; passing
  // it as null for a file_id reference triggers a 400, so it is omitted unless
  // a caller actually supplies one.
  if (filename) {
    payload.filename = filename;
  }

  try {
    const response = await axios.post(`${BASE_URL}/sendDocument`, payload);
    return response.data;
  } catch (error) {
    console.error('Telegram sendDocument error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Delete a message
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID to delete
 */
export async function deleteMessage(chatId, messageId) {
  try {
    const response = await axios.post(`${BASE_URL}/deleteMessage`, {
      chat_id: chatId,
      message_id: messageId
    });

    return response.data;
  } catch (error) {
    console.error('Telegram deleteMessage error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get file info from Telegram
 * @param {string} fileId - Telegram file ID
 */
export async function getFile(fileId) {
  try {
    const response = await axios.get(`${BASE_URL}/getFile`, {
      params: { file_id: fileId }
    });

    return response.data;
  } catch (error) {
    console.error('Telegram getFile error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Resolve Telegram's temporary file path for a stored file id.
 * The bot token stays server-side; callers receive only the path.
 * @param {string} fileId
 * @returns {Promise<string>}
 */
export async function getTelegramFilePath(fileId) {
  const response = await getFile(fileId);
  const filePath = response?.result?.file_path;

  if (!response?.ok || !filePath) {
    const description = response?.description || 'Telegram did not return a file path.';
    throw new Error(description);
  }

  return filePath;
}

/**
 * Get file download URL
 * @param {string} filePath - File path from getFile
 */
export function getDownloadUrl(filePath) {
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
}
