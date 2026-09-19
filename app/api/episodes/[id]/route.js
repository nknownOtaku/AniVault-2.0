import { supabase } from '../../../../lib/supabase.js';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) return Response.json({ ok: false, error: 'Missing episode id.' }, { status: 400 });

    const { data: episode, error } = await supabase
      .from('episodes')
      .select('id, season_id, episode_number, title, description, season(id, name, anime(id, title, slug))')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!episode) return Response.json({ ok: false, error: 'Episode not found.' }, { status: 404 });

    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('id, quality, resolution, language_type, language, filename, file_size')
      .eq('episode_id', id)
      .order('quality', { ascending: true });

    if (filesError) throw filesError;

    const ids = (files || []).map((file) => file.id);
    const { data: tokens, error: tokenError } = ids.length
      ? await supabase.from('start_tokens').select('file_id, token').eq('token_type', 'file').in('file_id', ids)
      : { data: [], error: null };

    if (tokenError) throw tokenError;
    const tokenByFileId = new Map((tokens || []).map((token) => [token.file_id, token.token]));

    return Response.json({
      ok: true,
      episode: {
        ...episode,
        files: (files || []).map((file) => ({
          ...file,
          downloadUrl: tokenByFileId.has(file.id) ? `/api/download/${tokenByFileId.get(file.id)}` : null
        }))
      }
    });
  } catch (error) {
    console.error('[ERROR] GET /api/episodes/:id failed:', error.message);
    return Response.json({ ok: false, error: 'Failed to load episode.' }, { status: 500 });
  }
}
