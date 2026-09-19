import { supabase } from '../../../../../lib/supabase.js';

/**
 * Public catalog API - files of an episode.
 *
 * GET /api/episodes/:id/files
 *
 * Returns the download options for one episode, grouped for convenient
 * rendering as "480p SUB / 720p SUB / 1080p DUB ...".
 *
 * Storage references (telegram_file_id, telegram_chat_id, message ids) are
 * intentionally omitted: the client only needs the file id to request a
 * download from the delivery layer (spec §56).
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return Response.json({ ok: false, error: 'Missing episode id.' }, { status: 400 });
    }

    const { data: episode, error: episodeError } = await supabase
      .from('episodes')
      .select(`
        id,
        episode_number,
        title,
        description,
        season ( id, name, anime ( id, title, slug ) )
      `)
      .eq('id', id)
      .maybeSingle();

    if (episodeError) {
      throw episodeError;
    }

    if (!episode) {
      return Response.json({ ok: false, error: 'Episode not found.' }, { status: 404 });
    }

    const { data: files, error } = await supabase
      .from('files')
      .select('id, quality, resolution, language_type, language, filename, file_size')
      .eq('episode_id', id);

    if (error) {
      throw error;
    }

    const fileIds = (files || []).map((file) => file.id);
    const { data: tokens, error: tokenError } = fileIds.length
      ? await supabase
          .from('start_tokens')
          .select('file_id, token')
          .eq('token_type', 'file')
          .in('file_id', fileIds)
      : { data: [], error: null };

    if (tokenError) {
      throw tokenError;
    }

    const tokenByFileId = new Map((tokens || []).map((token) => [token.file_id, token.token]));
    const publicFiles = (files || []).map((file) => ({
      ...file,
      downloadUrl: tokenByFileId.has(file.id)
        ? `/api/download/${tokenByFileId.get(file.id)}`
        : null
    }));

    // Group by language type so the UI can render SUB and DUB sections.
    const grouped = { sub: [], dub: [] };

    for (const file of publicFiles) {
      const bucket = file.language_type === 'dub' ? grouped.dub : grouped.sub;
      bucket.push(file);
    }

    return Response.json({
      ok: true,
      episode: {
        id: episode.id,
        episode_number: episode.episode_number,
        title: episode.title,
        description: episode.description
      },
      season: episode.season || null,
      files: publicFiles,
      grouped
    });
  } catch (error) {
    console.error('[ERROR] GET /api/episodes/:id/files failed:', error.message);
    return Response.json(
      { ok: false, error: 'Failed to load files.' },
      { status: 500 }
    );
  }
}
