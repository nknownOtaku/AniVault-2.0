import { supabase } from '../../../../../lib/supabase.js';

/**
 * Public catalog API - seasons belonging to an anime.
 *
 * GET /api/anime/:id/seasons
 *
 * The id accepts either the internal anime id or the AniList id.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return Response.json({ ok: false, error: 'Missing anime id.' }, { status: 400 });
    }

    const isAniListId = /^\d+$/.test(id);
    const { data: anime, error: animeError } = await (isAniListId
      ? supabase.from('anime').select('id, title').eq('anilist_id', Number(id)).maybeSingle()
      : supabase.from('anime').select('id, title').eq('id', id).maybeSingle());

    if (animeError) {
      throw animeError;
    }

    if (!anime) {
      return Response.json({ ok: false, error: 'Anime not found.' }, { status: 404 });
    }

    const { data: seasons, error: seasonsError } = await supabase
      .from('seasons')
      .select('id, anime_id, season_number, name, slug')
      .eq('anime_id', anime.id)
      .order('season_number', { ascending: true });

    if (seasonsError) {
      throw seasonsError;
    }

    const seasonIds = (seasons || []).map((season) => season.id);
    let episodeCounts = new Map();

    if (seasonIds.length > 0) {
      const { data: episodes, error: episodesError } = await supabase
        .from('episodes')
        .select('season_id')
        .in('season_id', seasonIds);

      if (episodesError) {
        throw episodesError;
      }

      episodeCounts = (episodes || []).reduce((counts, episode) => {
        counts.set(episode.season_id, (counts.get(episode.season_id) || 0) + 1);
        return counts;
      }, new Map());
    }

    return Response.json({
      ok: true,
      anime: { id: anime.id, title: anime.title },
      seasons: (seasons || []).map((season) => ({
        ...season,
        episode_count: episodeCounts.get(season.id) || 0
      }))
    });
  } catch (error) {
    console.error('[ERROR] GET /api/anime/:id/seasons failed:', error.message);
    return Response.json(
      { ok: false, error: 'Failed to load anime seasons.' },
      { status: 500 }
    );
  }
}
