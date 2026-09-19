/**
 * Parse anime filename to extract metadata
 * @param {string} filename - The filename to parse
 * @returns {object} Parsed data
 */
export function parseFilename(filename) {
  const result = {
    season: null,
    episode: null,
    title: null,
    quality: null,
    resolution: null,
    languageType: null,
    language: 'English',
    extension: null,
    valid: false,
    errors: []
  };

  // Extract extension
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  if (extMatch) {
    result.extension = extMatch[1].toLowerCase();
  }

  // Extract season and episode [S01-E05] or [S1-E5]
  const seasonEpisodeMatch = filename.match(/\[S(\d{1,2})-E(\d{1,2})\]/i);
  if (seasonEpisodeMatch) {
    result.season = parseInt(seasonEpisodeMatch[1], 10);
    result.episode = parseInt(seasonEpisodeMatch[2], 10);
  } else {
    // Try alternative formats: S01E05, S1E5
    const altMatch = filename.match(/S(\d{1,2})E(\d{1,2})/i);
    if (altMatch) {
      result.season = parseInt(altMatch[1], 10);
      result.episode = parseInt(altMatch[2], 10);
    }
  }

  // Extract quality/resolution. Matches bracketed tags first, then falls back
  // to a bare quality token anywhere in the name (e.g. "Title.1080p.mkv").
  const qualityMatch =
    filename.match(/\[(\d{3,4}[pP]?|HD|FHD|FULLHD|SD|HDRIP|HD-RIP)\]/i) ||
    filename.match(/(?:^|[.\s_-])(\d{3,4}[pP]|FHD|FULLHD|HDRIP|HD-RIP)(?:[.\s_-]|$)/i);
  if (qualityMatch) {
    result.quality = normalizeQuality(qualityMatch[1]);
    result.resolution = getResolution(result.quality);
  }

  // Extract language type (sub/dub). Bracketed tags win, but many real-world
  // releases use a bare token ("... 1080p Sub.mkv"), so fall back to that.
  const LANG_TOKEN = '(sub|subtitle|subbed|dub|dubbed|dubs)';
  const langMatch =
    filename.match(new RegExp(`\\[${LANG_TOKEN}\\]`, 'i')) ||
    filename.match(new RegExp(`(?:^|[.\\s_-])${LANG_TOKEN}(?:[.\\s_-]|$)`, 'i'));

  if (langMatch) {
    const raw = (langMatch[1] || '').toLowerCase();

    if (raw.includes('sub')) {
      result.languageType = 'sub';
    } else if (raw.includes('dub')) {
      result.languageType = 'dub';
    }
  }

  // Try to extract title from filename
  // Remove common patterns and extract what's left
  let titleCandidate = filename
    .replace(/\[S\d{1,2}-E\d{1,2}\]/gi, '')
    .replace(/S\d{1,2}E\d{1,2}/gi, '')
    .replace(/\[[^\]]*\]/g, '') // drop every bracketed tag
    .replace(/\.[a-zA-Z0-9]+$/, '')
    // Remove bare trailing quality/language tokens left outside brackets.
    .replace(/\b\d{3,4}[pP]\b/gi, '')
    .replace(/\b(FHD|FULLHD|HDRIP|HD-RIP)\b/gi, '')
    .replace(/\b(sub|subtitle|subbed|dub|dubbed|dubs)\b/gi, '')
    .trim();

  // Clean up extra brackets and spaces
  titleCandidate = titleCandidate.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();

  if (titleCandidate.length > 2) {
    result.title = titleCandidate;
  }

  // Validate parsed data
  if (!result.season) {
    result.errors.push('Season');
  }
  if (!result.episode) {
    result.errors.push('Episode');
  }
  if (!result.quality) {
    result.errors.push('Quality');
  }
  if (!result.languageType) {
    result.errors.push('Language');
  }

  result.valid = result.errors.length === 0;

  return result;
}

/**
 * Normalize quality string
 * @param {string} quality - Raw quality string
 * @returns {string} Normalized quality
 */
export function normalizeQuality(quality) {
  if (!quality) {
    return null;
  }

  // Normalise by upper-casing and collapsing separators, then strip a trailing
  // 'P' only when the token is purely numeric-plus-p (1080P -> 1080).
  // NOTE: stripping 'P' from HDRIP must NOT happen, which is why the strip is
  // guarded on a numeric payload rather than applied blindly.
  const upper = String(quality).toUpperCase().replace(/[\s_-]/g, '');
  const numeric = upper.replace(/P$/, '');
  const isNumeric = /^\d+$/.test(numeric);
  const key = isNumeric ? numeric : upper;

  if (key === '1080' || key === 'FHD' || key === 'FULLHD') {
    return '1080p';
  }
  if (key === '720' || key === 'HD') {
    return '720p';
  }
  if (key === '480' || key === 'SD') {
    return '480p';
  }
  if (key === '360' || key === 'LD') {
    return '360p';
  }
  if (key === '2160' || key === '4K' || key === 'UHD') {
    return '2160p';
  }
  if (key === 'HDRIP') {
    return 'HDRIP';
  }

  // Default: numeric qualities get a 'p' suffix, anything else keeps its
  // upper-cased form so unusual tags stay recognisable instead of vanishing.
  if (isNumeric) {
    return numeric + 'p';
  }

  return upper;
}

/**
 * Get resolution from quality
 * @param {string} quality - Quality string
 * @returns {string|null} Resolution string
 */
export function getResolution(quality) {
  switch (quality) {
    case '2160p':
      return '3840x2160';
    case '1080p':
      return '1920x1080';
    case '720p':
      return '1280x720';
    case '480p':
      return '854x480';
    case '360p':
      return '640x360';
    default:
      return null;
  }
}
