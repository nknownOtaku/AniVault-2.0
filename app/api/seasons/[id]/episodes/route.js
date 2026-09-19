import { supabase } from '../../../../../lib/supabase.js';

/**
 * Public catalog API - episodes of a season.
 *
 * GET /api/seasons/:id/episodes
 *
 * Returns each episode with the qualities/languages that are actually
 * available, so the website can render the download matrix without a second
 * round trip per episode.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return Response.json({ ok: false, error: 'Missing season id.' }, { status: 400 });
    }

    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select(`
        id,
        name,
        season_number,
        anime ( id, title, slug )
      `)
      .eq('id', id)
      .maybeSingle();

    if (seasonError) {
      throw seasonError;
    }

    if (!season) {
      return Response.json({ ok: false, error: 'Season not found.' }, { status: 404 });
    }

    const { data: episodes, error } = await supabase
      .from('episodes')
      .select(`
        id,
        episode_number,
        title,
        description,
        files ( id, quality, resolution, language_type, language, filename, file_size )
      `)
      .eq('season_id', id)
      .order('episode_number', { ascending: true });

    if (error) {
      throw error;
    }

    const fileIds = (episodes || []).flatMap((episode) =>
      (episode.files || []).map((file) => file.id)
    );
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

    // Never leak storage references (telegram_file_id etc.) to the client. The
    // download layer resolves those server-side from the file id.
    const sanitized = (episodes || []).map((episode) => ({
      ...episode,
      files: (episode.files || []).map((file) => ({
        id: file.id,
        quality: file.quality,
        resolution: file.resolution,
        language_type: file.language_type,
        language: file.language,
        filename: file.filename,
        file_size: file.file_size,
        downloadUrl: tokenByFileId.has(file.id)
          ? `/api/download/${tokenByFileId.get(file.id)}`
          : null
      }))
    }));

    return Response.json({
      ok: true,
      season: { id: season.id, name: season.name, season_number: season.season_number },
      anime: season.anime || null,
      episodes: sanitized
    });
  } catch (error) {
    console.error('[ERROR] GET /api/seasons/:id/episodes failed:', error.message);
    return Response.json(
      { ok: false, error: 'Failed to load episodes.' },
      { status: 500 }
    );
  }
}
