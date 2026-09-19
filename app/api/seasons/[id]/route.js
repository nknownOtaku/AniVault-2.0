import { supabase } from '../../../../lib/supabase.js';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) return Response.json({ ok: false, error: 'Missing season id.' }, { status: 400 });

    const { data: season, error } = await supabase
      .from('seasons')
      .select('id, anime_id, season_number, name, slug, anime(id, title, slug)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!season) return Response.json({ ok: false, error: 'Season not found.' }, { status: 404 });

    const { count, error: countError } = await supabase
      .from('episodes')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', id);

    if (countError) throw countError;

    return Response.json({ ok: true, season: { ...season, episode_count: count || 0 } });
  } catch (error) {
    console.error('[ERROR] GET /api/seasons/:id failed:', error.message);
    return Response.json({ ok: false, error: 'Failed to load season.' }, { status: 500 });
  }
}
