import { supabase } from '../../../../lib/supabase.js';
import { deleteMessage, editMessageText } from '../../../../lib/telegram.js';

function isAlreadyDeleted(error) {
  const description = error.response?.data?.description || error.message || '';
  return /message to (delete|edit) not found|message can't be (deleted|edited)/i.test(description);
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: dueTasks, error: queryError } = await supabase
    .from('scheduled_message_deletions')
    .select('id, telegram_chat_id, file_message_id, notice_message_id, file_url')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(20);

  if (queryError) {
    console.error('Could not load scheduled deletions:', queryError);
    return Response.json({ ok: false, error: 'Could not load scheduled deletions.' }, { status: 500 });
  }

  let completed = 0;
  let retried = 0;

  for (const task of dueTasks || []) {
    const { data: claimed, error: claimError } = await supabase
      .from('scheduled_message_deletions')
      .update({ status: 'processing' })
      .eq('id', task.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) {
      if (claimError) console.error('Could not claim scheduled deletion:', claimError);
      continue;
    }

    try {
      try {
        await deleteMessage(task.telegram_chat_id, task.file_message_id);
      } catch (error) {
        if (!isAlreadyDeleted(error)) throw error;
      }

      try {
        await editMessageText(
          task.telegram_chat_id,
          task.notice_message_id,
          [
            '<blockquote>›› Previous Message was Deleted.</blockquote>',
            '<blockquote>If you are authorized to access this file again, use the button below.</blockquote>'
          ].join('\n\n'),
          {
            reply_markup: {
              inline_keyboard: [[
                ...(task.file_url ? [{ text: '📥 Get files', url: task.file_url }] : []),
                { text: '✖ Close', callback_data: 'user_close_delivery' }
              ]]
            }
          }
        );
      } catch (error) {
        if (!isAlreadyDeleted(error)) throw error;
      }

      const { error: updateError } = await supabase
        .from('scheduled_message_deletions')
        .update({ status: 'completed' })
        .eq('id', task.id);

      if (updateError) throw updateError;
      completed += 1;
    } catch (error) {
      console.error('Scheduled deletion will be retried:', task.id, error.message);
      await supabase
        .from('scheduled_message_deletions')
        .update({ status: 'pending' })
        .eq('id', task.id);
      retried += 1;
    }
  }

  return Response.json({ ok: true, completed, retried });
}