import { supabase } from '../../../../lib/supabase.js';
import { getDownloadUrl, getTelegramFilePath } from '../../../../lib/telegram.js';

/**
 * Deliver one authorized file without exposing Telegram identifiers or the bot
 * token to the browser.
 *
 * GET /api/download/:token
 *
 * This is intentionally a server-side stream. A dedicated object-storage/CDN
 * adapter can replace this implementation later without changing the client
 * contract.
 */
export async function GET(request, { params }) {
  try {
    const { token } = await params;

    if (!token || !/^[A-Za-z0-9]{30}$/.test(token)) {
      return Response.json({ ok: false, error: 'Invalid download token.' }, { status: 400 });
    }

    const { data: tokenRow, error } = await supabase
      .from('start_tokens')
      .select('file_id')
      .eq('token', token)
      .eq('token_type', 'file')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!tokenRow?.file_id) {
      return Response.json({ ok: false, error: 'Download token not found.' }, { status: 404 });
    }

    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('filename, mime_type, file_size, telegram_file_id')
      .eq('id', tokenRow.file_id)
      .maybeSingle();

    if (fileError) {
      throw fileError;
    }

    if (!file?.telegram_file_id) {
      return Response.json({ ok: false, error: 'File is not available.' }, { status: 404 });
    }

    let filePath;
    try {
      filePath = await getTelegramFilePath(file.telegram_file_id);
    } catch (error) {
      console.error('[ERROR] Telegram getFile failed:', error.message);
      return Response.json(
        { ok: false, error: 'Telegram could not resolve this file. It may be expired or too large for browser delivery.' },
        { status: 502 }
      );
    }

    const headers = {};
    const range = request.headers.get('range');
    if (range) {
      headers.Range = range;
    }

    const upstream = await fetch(getDownloadUrl(filePath), { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return Response.json({ ok: false, error: 'File delivery failed.' }, { status: 502 });
    }

    const responseHeaders = new Headers({
      'Content-Type': file.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename || 'download')}`,
      'Cache-Control': 'private, no-store'
    });

    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) {
        responseHeaders.set(name, value);
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('[ERROR] GET /api/download/:token failed:', error.message);
    return Response.json({ ok: false, error: 'Failed to deliver file.' }, { status: 500 });
  }
}
