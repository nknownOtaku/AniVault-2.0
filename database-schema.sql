-- AniVault Database Schema for Supabase PostgreSQL

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ANIME TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS anime (
    id TEXT PRIMARY KEY,
    anilist_id INTEGER UNIQUE,
    title TEXT NOT NULL,
    slug TEXT,
    native_title TEXT,
    description TEXT,
    poster_url TEXT,
    banner_url TEXT,
    format TEXT,
    status TEXT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SEASONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY,
    anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    season_number INTEGER,
    name TEXT NOT NULL,
    slug TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- EPISODES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(season_id, episode_number)
);

-- ============================================
-- FILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    quality TEXT NOT NULL,
    resolution TEXT,
    language_type TEXT NOT NULL CHECK (language_type IN ('sub', 'dub')),
    language TEXT DEFAULT 'English',
    filename TEXT NOT NULL,
    extension TEXT,
    mime_type TEXT,
    file_size BIGINT,
    telegram_chat_id TEXT,
    telegram_message_id TEXT,
    telegram_file_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Unique constraint to prevent duplicates
    UNIQUE(episode_id, quality, language_type, language)
);

-- ============================================
-- ANIME LANGUAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS anime_languages (
    id TEXT PRIMARY KEY,
    anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    language_type TEXT NOT NULL CHECK (language_type IN ('sub', 'dub')),
    language TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(anime_id, language_type, language)
);

-- ============================================
-- START TOKENS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS start_tokens (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    token_type TEXT NOT NULL CHECK (token_type IN ('season', 'episode', 'file')),
    anime_id TEXT REFERENCES anime(id) ON DELETE CASCADE,
    season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
    episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
    file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE,
    -- Ensure only appropriate references are set based on token_type
    CHECK (
        (token_type = 'season' AND season_id IS NOT NULL) OR
        (token_type = 'episode' AND episode_id IS NOT NULL) OR
        (token_type = 'file' AND file_id IS NOT NULL)
    )
);

-- ============================================
-- ADMIN SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    chat_id TEXT,
    state TEXT NOT NULL DEFAULT 'IDLE',
    data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- UPLOAD SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    anime_id TEXT REFERENCES anime(id),
    season_id TEXT REFERENCES seasons(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- UPLOAD FILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS upload_files (
    id TEXT PRIMARY KEY,
    upload_session_id TEXT NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    telegram_file_id TEXT,
    file_size BIGINT,
    mime_type TEXT,
    parsed_data JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_seasons_anime_id ON seasons(anime_id);
CREATE INDEX IF NOT EXISTS idx_episodes_season_id ON episodes(season_id);
CREATE INDEX IF NOT EXISTS idx_files_episode_id ON files(episode_id);
CREATE INDEX IF NOT EXISTS idx_anime_languages_anime_id ON anime_languages(anime_id);
CREATE INDEX IF NOT EXISTS idx_start_tokens_token ON start_tokens(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_telegram_user_id ON admin_sessions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_telegram_user_id ON upload_sessions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_upload_files_upload_session_id ON upload_files(upload_session_id);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_anime_updated_at
    BEFORE UPDATE ON anime
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seasons_updated_at
    BEFORE UPDATE ON seasons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_episodes_updated_at
    BEFORE UPDATE ON episodes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_sessions_updated_at
    BEFORE UPDATE ON admin_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_upload_sessions_updated_at
    BEFORE UPDATE ON upload_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE anime IS 'Anime metadata from AniList';
COMMENT ON TABLE seasons IS 'Seasons belonging to anime';
COMMENT ON TABLE episodes IS 'Episodes within seasons';
COMMENT ON TABLE files IS 'Media file records with Telegram storage references';
COMMENT ON TABLE anime_languages IS 'Available subtitle/dub languages per anime';
COMMENT ON TABLE start_tokens IS 'Secure 30-character access tokens for users';
COMMENT ON TABLE admin_sessions IS 'Bot state management for admin workflow';
COMMENT ON TABLE upload_sessions IS 'Temporary upload session tracking';
COMMENT ON TABLE upload_files IS 'Temporary file tracking before confirmation';
