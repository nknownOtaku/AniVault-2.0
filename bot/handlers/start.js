import { sendMessage } from '../../lib/telegram.js';
import { getAdminKeyboard } from '../keyboards/admin.js';

/**
 * Handle /start command
 * @param {object} message - Telegram message object
 */
export async function handleStart(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  
  // Check if admin
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (String(userId) !== String(adminId)) {
    await sendMessage(chatId, '⛔ Access denied. Only administrators can use this bot.');
    return;
  }

  // Check for token argument (user access)
  const args = message.text?.split(' ');
  if (args && args.length > 1) {
    const token = args[1];
    await handleTokenAccess(chatId, token);
    return;
  }

  // Admin menu
  const welcomeText = `
<b>Welcome to AniVault Admin</b>

Choose an action:
`;

  await sendMessage(chatId, welcomeText, {
    reply_markup: getAdminKeyboard()
  });
}

/**
 * Handle token-based access for users
 * @param {number} chatId - Chat ID
 * @param {string} token - Access token
 */
async function handleTokenAccess(chatId, token) {
  // TODO: Implement token validation and user access
  // For now, just acknowledge
  await sendMessage(chatId, `🎫 Token received: ${token}\n\nUser access features coming soon.`);
}
