import { supabase } from '../../../lib/supabase.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();

    if (query.length < 2) {
      return Response.json({ ok: false, error: 'Search query must be at least 2 characters.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('anime')
      .select('id, title, native_title, slug, poster_url, format, status, seasons(id)')
      .or(`title.ilike.%${query}%,native_title.ilike.%${query}%`)
      .order('title', { ascending: true })
      .limit(30);

    if (error) throw error;

    return Response.json({
      ok: true,
      query,
      results: (data || []).map((anime) => ({
        ...anime,
        season_count: anime.seasons?.length || 0,
        seasons: undefined
      }))
    });
  } catch (error) {
    console.error('[ERROR] GET /api/search failed:', error.message);
    return Response.json({ ok: false, error: 'Failed to search anime.' }, { status: 500 });
  }
}
