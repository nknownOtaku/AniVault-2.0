import { supabase } from '../../../lib/supabase.js';

/**
 * Public catalog API - anime list.
 *
 * GET /api/anime
 *   ?page=1&perPage=24&q=<search>
 *
 * Read-only and safe to expose: it returns catalog metadata only. File storage
 * references and tokens are never included here (spec §56 / §58).
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('perPage') || '24', 10) || 24)
    );
    const query = (searchParams.get('q') || '').trim();

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let builder = supabase
      .from('anime')
      .select(
        'id, anilist_id, title, slug, native_title, description, poster_url, banner_url, format, status, start_date, end_date',
        { count: 'exact' }
      )
      .order('title', { ascending: true })
      .range(from, to);

    if (query) {
      // Match against either the English title or the native title so users can
      // search in the script they know the series by.
      builder = builder.or(`title.ilike.%${query}%,native_title.ilike.%${query}%`);
    }

    const { data, error, count } = await builder;

    if (error) {
      throw error;
    }

    return Response.json({
      ok: true,
      page,
      perPage,
      total: count ?? 0,
      results: data || []
    });
  } catch (error) {
    console.error('[ERROR] GET /api/anime failed:', error.message);
    return Response.json(
      { ok: false, error: 'Failed to load anime catalog.' },
      { status: 500 }
    );
  }
}
