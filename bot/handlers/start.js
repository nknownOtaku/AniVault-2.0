import { sendMessage } from '../../lib/telegram.js';
import { getAdminKeyboard } from '../keyboards/admin.js';
import { clearAdminState } from '../../lib/session.js';
import { handleTokenAccess } from './user.js';
import { handleUserHome } from './user-catalog.js';

/**
 * Handle /start command.
 *
 * `/start`            -> admin menu (for the configured admin)
 * `/start <token>`    -> token access, available to any Telegram user
 *
 * The token branch is checked first so that a non-admin holding a valid token
 * is served instead of being rejected.
 *
 * @param {object} message - Telegram message object
 */
export async function handleStart(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  const args = message.text?.trim().split(/\s+/) || [];
  const token = args[1];

  // Any user (admin or not) may open a token link.
  if (token) {
    await handleTokenAccess(chatId, token);
    return;
  }

  // No token: only the configured admin sees the management menu.
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (String(userId) !== String(adminId)) {
    await handleUserHome(message);
    return;
  }

  // Returning the admin to the menu always resets any in-flight workflow so a
  // half-finished upload cannot leak into a new action.
  await clearAdminState(userId, chatId);

  const welcomeText = `
<b>Welcome to AniVault Admin</b>

Choose an action:
`;

  await sendMessage(chatId, welcomeText, {
    reply_markup: getAdminKeyboard()
  });
}
