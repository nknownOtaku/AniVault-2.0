import axios from 'axios';

const ANILIST_API_URL = process.env.ANILIST_API_URL || 'https://graphql.anilist.co';

const query = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME) {
      id
      title {
        romaji
        english
        native
      }
      description
      format
      status
      episodes
      seasonYear
      coverImage {
        large
        extraLarge
      }
      bannerImage
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
    }
  }
}
`;

export async function searchAnime(title, page = 1, perPage = 5) {
  try {
    const response = await axios.post(ANILIST_API_URL, {
      query,
      variables: {
        search: title,
        page,
        perPage
      }
    });

    return response.data.data.Page.media;
  } catch (error) {
    console.error('AniList search error:', error.message);
    throw error;
  }
}

export async function getAnimeDetails(anilistId) {
  const detailsQuery = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title {
        romaji
        english
        native
      }
      description
      format
      status
      episodes
      seasonYear
      coverImage {
        large
        extraLarge
      }
      bannerImage
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      genres
      averageScore
    }
  }
  `;

  try {
    const response = await axios.post(ANILIST_API_URL, {
      query: detailsQuery,
      variables: { id: anilistId }
    });

    return response.data.data.Media;
  } catch (error) {
    console.error('AniList details error:', error.message);
    throw error;
  }
}
