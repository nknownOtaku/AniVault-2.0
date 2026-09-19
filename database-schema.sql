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
    CHECK (token ~ '^[A-Za-z0-9]{30}$'),
    CHECK (
        (token_type = 'season' AND season_id IS NOT NULL AND episode_id IS NULL AND file_id IS NULL) OR
        (token_type = 'episode' AND season_id IS NULL AND episode_id IS NOT NULL AND file_id IS NULL) OR
        (token_type = 'file' AND season_id IS NULL AND episode_id IS NULL AND file_id IS NOT NULL)
    )
);

-- Keep older databases aligned with the token rules above.
ALTER TABLE start_tokens DROP CONSTRAINT IF EXISTS start_tokens_token_format_check;
ALTER TABLE start_tokens ADD CONSTRAINT start_tokens_token_format_check
    CHECK (token ~ '^[A-Za-z0-9]{30}$');
ALTER TABLE start_tokens DROP CONSTRAINT IF EXISTS start_tokens_reference_check;
ALTER TABLE start_tokens ADD CONSTRAINT start_tokens_reference_check CHECK (
    (token_type = 'season' AND season_id IS NOT NULL AND episode_id IS NULL AND file_id IS NULL) OR
    (token_type = 'episode' AND season_id IS NULL AND episode_id IS NOT NULL AND file_id IS NULL) OR
    (token_type = 'file' AND season_id IS NULL AND episode_id IS NULL AND file_id IS NOT NULL)
);

-- ============================================
-- ADMIN SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL UNIQUE,
    chat_id TEXT,
    state TEXT NOT NULL DEFAULT 'IDLE',
    data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure one active session row per admin (safe to run on existing tables).
--
-- NOTE: the unique index is created *after* the table, so databases that were
-- set up from an earlier version of this script can already hold duplicate rows
-- for the same admin. Creating the index would then fail, so duplicates are
-- collapsed first, keeping the most recently updated row per admin.
DELETE FROM admin_sessions a
USING admin_sessions b
WHERE a.telegram_user_id = b.telegram_user_id
  AND a.updated_at < b.updated_at;

-- Break ties on updated_at (identical timestamps) by keeping the highest id.
DELETE FROM admin_sessions a
USING admin_sessions b
WHERE a.telegram_user_id = b.telegram_user_id
  AND a.updated_at = b.updated_at
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_sessions_telegram_user_id_unique
    ON admin_sessions(telegram_user_id);

-- ============================================
-- USER TELEGRAM EXPERIENCE
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
    telegram_user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'IDLE',
    data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_favorites (
    id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
    telegram_user_id TEXT NOT NULL,
    anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(telegram_user_id, anime_id)
);

CREATE TABLE IF NOT EXISTS user_downloads (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    quality TEXT,
    language_type TEXT,
    language TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_user_downloads_user_id_created_at ON user_downloads(telegram_user_id, created_at DESC);

-- ============================================
-- UPLOAD SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    -- These are *references*, not dependencies: an upload session is temporary
    -- and meaningless once its anime/season is gone. Without ON DELETE CASCADE
    -- a leftover session makes deleting the anime fail on a foreign-key
    -- violation (upload_sessions has no other FK relationship to the cascade
    -- chain, so nothing else would clean it up).
    anime_id TEXT REFERENCES anime(id) ON DELETE CASCADE,
    season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration for databases created before the CASCADE was added. Safe to run
-- repeatedly: dropping and re-adding the constraint is idempotent by name.
ALTER TABLE upload_sessions DROP CONSTRAINT IF EXISTS upload_sessions_anime_id_fkey;
ALTER TABLE upload_sessions
    ADD CONSTRAINT upload_sessions_anime_id_fkey
    FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE;

ALTER TABLE upload_sessions DROP CONSTRAINT IF EXISTS upload_sessions_season_id_fkey;
ALTER TABLE upload_sessions
    ADD CONSTRAINT upload_sessions_season_id_fkey
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- ============================================
-- UPLOAD FILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS upload_files (
    id TEXT PRIMARY KEY,
    upload_session_id TEXT NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    telegram_file_id TEXT,
    telegram_chat_id TEXT,
    telegram_message_id TEXT,
    file_size BIGINT,
    mime_type TEXT,
    parsed_data JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE upload_files ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE upload_files ADD COLUMN IF NOT EXISTS telegram_message_id TEXT;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_seasons_anime_id ON seasons(anime_id);
CREATE INDEX IF NOT EXISTS idx_episodes_season_id ON episodes(season_id);
CREATE INDEX IF NOT EXISTS idx_files_episode_id ON files(episode_id);
CREATE INDEX IF NOT EXISTS idx_anime_languages_anime_id ON anime_languages(anime_id);
CREATE INDEX IF NOT EXISTS idx_start_tokens_token ON start_tokens(token);
-- idx_admin_sessions_telegram_user_id is created as a UNIQUE index above,
-- which already covers this lookup and enforces one session per admin.
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

-- Drop first so this script is safely re-runnable (CREATE TRIGGER has no IF NOT EXISTS).
DROP TRIGGER IF EXISTS update_anime_updated_at ON anime;
CREATE TRIGGER update_anime_updated_at
    BEFORE UPDATE ON anime
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_seasons_updated_at ON seasons;
CREATE TRIGGER update_seasons_updated_at
    BEFORE UPDATE ON seasons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_episodes_updated_at ON episodes;
CREATE TRIGGER update_episodes_updated_at
    BEFORE UPDATE ON episodes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_files_updated_at ON files;
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_sessions_updated_at ON admin_sessions;
CREATE TRIGGER update_admin_sessions_updated_at
    BEFORE UPDATE ON admin_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_upload_sessions_updated_at ON upload_sessions;
CREATE TRIGGER update_upload_sessions_updated_at
    BEFORE UPDATE ON upload_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_sessions_updated_at ON user_sessions;
CREATE TRIGGER update_user_sessions_updated_at
    BEFORE UPDATE ON user_sessions
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