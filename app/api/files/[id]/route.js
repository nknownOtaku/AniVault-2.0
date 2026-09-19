import { supabase } from '../../../../lib/supabase.js';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) return Response.json({ ok: false, error: 'Missing file id.' }, { status: 400 });

    const { data: file, error } = await supabase
      .from('files')
      .select('id, episode_id, quality, resolution, language_type, language, filename, extension, mime_type, file_size, episodes(id, episode_number, season(id, name, anime(id, title, slug)))')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!file) return Response.json({ ok: false, error: 'File not found.' }, { status: 404 });

    const { data: token, error: tokenError } = await supabase
      .from('start_tokens')
      .select('token')
      .eq('token_type', 'file')
      .eq('file_id', id)
      .maybeSingle();

    if (tokenError) throw tokenError;

    return Response.json({
      ok: true,
      file: {
        ...file,
        downloadUrl: token?.token ? `/api/download/${token.token}` : null
      }
    });
  } catch (error) {
    console.error('[ERROR] GET /api/files/:id failed:', error.message);
    return Response.json({ ok: false, error: 'Failed to load file.' }, { status: 500 });
  }
}
