import { supabase } from '../../../../lib/supabase.js';

/**
 * Public catalog API - single anime with its seasons.
 *
 * GET /api/anime/:id
 *
 * `:id` accepts the internal ID (ANM_XXXXXX) or the AniList ID. Anime are
 * often referenced by AniList ID in the wild, so supporting both keeps URLs
 * forgiving.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return Response.json({ ok: false, error: 'Missing anime id.' }, { status: 400 });
    }

    const isAniListId = /^\d+$/.test(id);

    let builder = supabase
      .from('anime')
      .select(`
        id,
        anilist_id,
        title,
        slug,
        native_title,
        description,
        poster_url,
        banner_url,
        format,
        status,
        start_date,
        end_date,
        anime_languages ( language_type, language ),
        seasons (
          id,
          season_number,
          name,
          slug
        )
      `);

    builder = isAniListId
      ? builder.eq('anilist_id', parseInt(id, 10))
      : builder.eq('id', id);

    const { data, error } = await builder.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return Response.json({ ok: false, error: 'Anime not found.' }, { status: 404 });
    }

    // Present seasons in broadcast order rather than insertion order.
    if (data.seasons) {
      data.seasons.sort(
        (a, b) => (a.season_number ?? 0) - (b.season_number ?? 0)
      );
    }

    return Response.json({ ok: true, anime: data });
  } catch (error) {
    console.error('[ERROR] GET /api/anime/:id failed:', error.message);
    return Response.json(
      { ok: false, error: 'Failed to load anime.' },
      { status: 500 }
    );
  }
}
