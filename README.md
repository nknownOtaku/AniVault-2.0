# AniVault Bot

A Telegram-controlled anime/media management system with a future web application.

## Project Overview

AniVault is an admin-first media management platform that allows administrators to:
- Add anime from AniList metadata
- Create seasons and episodes
- Upload episode files in bulk
- Automatically parse filenames for metadata
- Generate secure access tokens
- Manage the entire media library via Telegram

## Architecture

```
Telegram Bot (Admin) → Vercel Webhook → Supabase Database
                                              ↓
                                         AniList API (Metadata)
                                              ↓
                                       Future Web App (Users)
```

## Technology Stack

- **Backend**: JavaScript, Node.js, Next.js
- **Hosting**: Vercel (serverless webhooks)
- **Database**: Supabase PostgreSQL
- **Metadata**: AniList GraphQL API
- **Admin Interface**: Telegram Bot API

## Project Structure

```
anivault-bot/
├── app/
│   └── api/
│       ├── telegram/
│       │   └── route.js          # Telegram webhook endpoint
│       ├── anime/
│       │   ├── route.js          # GET /api/anime (catalog list + search)
│       │   └── [id]/route.js     # GET /api/anime/:id (anime + seasons)
│       ├── seasons/
│       │   └── [id]/episodes/route.js   # GET /api/seasons/:id/episodes
│       └── episodes/
│           └── [id]/files/route.js      # GET /api/episodes/:id/files
├── bot/
│   ├── handlers/
│   │   ├── start.js              # /start (admin menu + token access)
│   │   ├── anime.js              # Anime add/list/delete
│   │   ├── season.js             # Season add/list/delete
│   │   ├── upload.js             # File upload, review, commit, tokens
│   │   ├── delete.js             # Episode/file deletion + Telegram cleanup
│   │   └── user.js               # User token access (/start <token>)
│   ├── keyboards/
│   │   └── admin.js              # Inline keyboards
│   └── router.js                 # Message + callback routing
├── lib/
│   ├── telegram.js               # Telegram API client
│   ├── supabase.js               # Supabase client
│   ├── anilist.js                # AniList API client
│   ├── parser.js                 # Filename parser + quality normalisation
│   ├── session.js                # Admin session/state machine
│   └── tokens.js                 # Token/ID generation
├── tests/
│   └── parser.test.js            # Parser + token unit tests
├── database-schema.sql           # Supabase schema
├── package.json
├── .env.local                    # Environment variables
└── README.md
```

## Environment Variables

Create a `.env.local` file with:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ADMIN_ID=your_telegram_id

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

ANILIST_API_URL=https://graphql.anilist.co
```

**Important**: Never expose `TELEGRAM_BOT_TOKEN` or `SUPABASE_SERVICE_ROLE_KEY` to the frontend.

## Database Schema

### Tables

1. **anime** - Anime metadata from AniList
2. **seasons** - Seasons belonging to anime
3. **episodes** - Episodes within seasons
4. **files** - Media file records
5. **anime_languages** - Available languages per anime
6. **start_tokens** - Secure access tokens
7. **admin_sessions** - Bot state management
8. **upload_sessions** - Temporary upload tracking
9. **upload_files** - Temporary file tracking

See `database-schema.sql` for full schema definition.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Edit `.env.local` with your credentials.

### 3. Set Up Supabase Database

Run the SQL schema in your Supabase SQL editor.

### 4. Run Tests

```bash
npm run test
```

Runs the filename-parser and token unit tests (Node's built-in test runner).

### 5. Deploy to Vercel

```bash
vercel deploy
```

### 6. Set Telegram Webhook

After deployment, set the webhook:

```
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://your-vercel-url.vercel.app/api/telegram
```

## Usage

### Admin Commands

1. Start the bot: `/start`
2. Select "➕ Add Anime"
3. Enter anime title to search AniList
4. Select the correct anime
5. Click "➕ Add Season"
6. Enter season name (e.g., "Season 1")
7. Upload episode files
8. Click "✅ Done" to review
9. Confirm to save to database

### File Naming Convention

Files should follow this pattern for automatic parsing:

```
[S01-E05] Anime Title [1080p] [Sub].mkv
```

The parser extracts:
- Season number
- Episode number
- Quality (480p, 720p, 1080p, HDRIP)
- Language type (sub/dub)

### Token System

The system generates three token types:
- **Season tokens** - Access to all episodes in a season (the highest level;
  there is deliberately no all-seasons token)
- **Episode tokens** - Access to all files in an episode
- **File tokens** - Access to a single file
Tokens are 30-character cryptographically secure random strings.

Users open a token with:

```
/start <TOKEN>
```

- A **season token** lists the season's episodes.
- An **episode token** lists the available qualities/languages.
- A **file token** delivers the single file via Telegram (the media itself is
  never downloaded onto the server).

Token links work for any Telegram user, while every administrative action is
restricted to `TELEGRAM_ADMIN_ID`.

### Duplicate Handling
Before an upload is committed, the bot checks each file against the database
using the same key the schema enforces:
`(episode_id, quality, language_type, language)` (see `files` in
`database-schema.sql`). When collisions are found, the review screen offers
**Overwrite All** or **Ignore All** instead of silently discarding or double-
inserting the file.

## API Endpoints
Read-only catalog endpoints for the future website:

```
GET /api/anime                    # list + search (?page, ?perPage, ?q)
GET /api/anime/:id                # anime + seasons (internal or AniList id)
GET /api/seasons/:id/episodes     # episodes + available files
GET /api/episodes/:id/files       # files + SUB/DUB grouping
```

These responses expose catalog metadata only — Telegram storage references
(`telegram_file_id`, message ids) are never returned to the browser. File
delivery is a separate layer (spec §56).

## Development Phases

1. ✅ Project setup (Next.js, Vercel, webhook)
2. ✅ Admin authentication
3. ✅ `/start` command
4. ✅ Supabase schema (`database-schema.sql`)
5. ✅ AniList integration
6. ✅ Season creation workflow
7. ✅ File upload handling
8. ✅ Filename parser (with tests)
9. ✅ Duplicate detection (Overwrite / Ignore)
10. ✅ Review and confirmation
11. ✅ Delete operations (anime, season, episode, file)
12. ✅ User token access (`/start <token>`)
13. ✅ Website API endpoints
14. ⏳ End-user web application
15. ⏳ Scalable file-delivery layer

## Security

- Only configured `TELEGRAM_ADMIN_ID` can perform admin actions
- Bot token and Supabase service key are server-side secrets
- Tokens are cryptographically secure (not sequential)
- Callback data is validated against user permissions

## Known Limitations
- The download button on the future website needs a dedicated delivery layer;
  serverless functions are not suitable permanent storage or proxies for large
  media. The API endpoints deliberately return metadata only.
- `overwrite` updates the existing file row in place. The previous media file
  still exists in Telegram storage until it is removed.
- Per-file duplicate "Review Each" is not implemented — the review screen guides
  the admin to Overwrite All / Ignore All.

## Future Features
- Web application for end users
- Direct file download (not Telegram redirect)
- Multi-language input during upload (spec §38)
- Per-file duplicate review
- Batch operations
## License

ISC
