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

  // Extract quality/resolution
  const qualityMatch = filename.match(/\[(\d{3,4}[pP]?|HD|FHD|FULLHD|SD|HDRIP|HD-RIP)\]/i);
  if (qualityMatch) {
    result.quality = normalizeQuality(qualityMatch[1]);
    result.resolution = getResolution(result.quality);
  }

  // Extract language type (sub/dub)
  const langMatch = filename.match(/\[(sub|SUB|subtitle|Subtitle|dub|DUB|Dubbed|Dub)\]/i);
  if (langMatch) {
    const langType = langMatch[1].toLowerCase();
    if (langType.includes('sub') || langType.includes('subtitle')) {
      result.languageType = 'sub';
    } else if (langType.includes('dub')) {
      result.languageType = 'dub';
    }
  }

  // Try to extract title from filename
  // Remove common patterns and extract what's left
  let titleCandidate = filename
    .replace(/\[S\d{1,2}-E\d{1,2}\]/gi, '')
    .replace(/S\d{1,2}E\d{1,2}/gi, '')
    .replace(/\[\d{3,4}[pP]?\]/gi, '')
    .replace(/\[(sub|SUB|dub|DUB|HD|FHD|SD|HDRIP|HD-RIP)\]/gi, '')
    .replace(/\.[a-zA-Z0-9]+$/, '')
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
function normalizeQuality(quality) {
  const q = quality.toUpperCase().replace('P', '');
  
  if (q === '1080' || q === 'FHD' || q === 'FULLHD') {
    return '1080p';
  }
  if (q === '720' || q === 'HD') {
    return '720p';
  }
  if (q === '480' || q === 'SD') {
    return '480p';
  }
  if (q === 'HDRIP' || q === 'HD-RIP') {
    return 'HDRIP';
  }
  
  // Default: keep original with 'p' if numeric
  if (/^\d+$/.test(q)) {
    return q + 'p';
  }
  
  return quality.toLowerCase();
}

/**
 * Get resolution from quality
 * @param {string} quality - Quality string
 * @returns {string|null} Resolution string
 */
function getResolution(quality) {
  switch (quality) {
    case '1080p':
      return '1920x1080';
    case '720p':
      return '1280x720';
    case '480p':
      return '854x480';
    default:
      return null;
  }
}
