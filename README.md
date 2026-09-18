# AniVault

> A Telegram-controlled media management and delivery platform for organizing authorized anime/media files.

AniVault is a media management system that allows an administrator to manage an organized anime catalog directly through a Telegram bot.

The system combines:

* Telegram Bot API
* Next.js
* Vercel
* Supabase PostgreSQL
* AniList GraphQL API
* Secure token-based access
* Automatic filename parsing
* Bulk media management
* A future web-based catalog and download system

The initial focus is anime, but the architecture is designed so that the system can eventually be expanded into a broader media platform.

---

# Table of Contents

* [Project Overview](#project-overview)
* [Core Concept](#core-concept)
* [Architecture](#architecture)
* [Technology Stack](#technology-stack)
* [Project Structure](#project-structure)
* [Features](#features)
* [Admin Workflow](#admin-workflow)
* [Database Architecture](#database-architecture)
* [Filename Parser](#filename-parser)
* [Duplicate Handling](#duplicate-handling)
* [Token System](#token-system)
* [Telegram Bot](#telegram-bot)
* [AniList Integration](#anilist-integration)
* [File Storage](#file-storage)
* [Future Web Application](#future-web-application)
* [Environment Variables](#environment-variables)
* [Local Development](#local-development)
* [Supabase Setup](#supabase-setup)
* [Vercel Deployment](#vercel-deployment)
* [Telegram Webhook](#telegram-webhook)
* [Security](#security)
* [Error Handling](#error-handling)
* [Development Roadmap](#development-roadmap)
* [Future Improvements](#future-improvements)
* [Important Notes](#important-notes)

---

# Project Overview

AniVault separates media management into several layers.

```text
                         ADMIN
                           |
                           v
                    +-------------+
                    |  Telegram   |
                    |     Bot     |
                    +------+------+
                           |
                           | HTTPS Webhook
                           v
                    +-------------+
                    |   Vercel    |
                    |   Next.js   |
                    +------+------+
                           |
              +------------+------------+
              |            |            |
              v            v            v
        +---------+   +---------+   +---------+
        |Supabase |   | AniList |   |Telegram |
        |Database |   |   API   |   | Storage |
        +---------+   +---------+   +---------+
              |
              v
       +-------------+
       | Future Web  |
       | Application |
       +-------------+
```

The responsibilities of each service are intentionally separated.

### Telegram

Telegram is the administrative interface.

The administrator uses the bot to:

* Add anime
* Add seasons
* Upload files
* Add episodes
* Review uploads
* Detect duplicates
* Delete content
* Generate access tokens

### Vercel

Vercel runs the application logic and Telegram webhook.

It handles:

* Telegram updates
* Bot commands
* Button callbacks
* Database operations
* AniList requests
* Filename parsing
* Upload sessions
* Token generation
* API endpoints

### Supabase

Supabase stores structured metadata.

It stores:

* Anime
* Seasons
* Episodes
* Files
* Languages
* Tokens
* Admin sessions
* Temporary upload sessions

### AniList

AniList provides anime metadata.

Examples:

* Title
* Native title
* Description
* Poster
* Banner
* Format
* Status
* Start date
* End date
* AniList ID

### Telegram Storage

Telegram can be used as a storage/reference layer for authorized media files.

The database stores references to the Telegram files rather than unnecessarily downloading large media files into the Vercel server.

---

# Core Concept

AniVault organizes media using the following hierarchy:

```text
Anime
 |
 +-- Season
      |
      +-- Episode
           |
           +-- File
```

Example:

```text
Jujutsu Kaisen
|
+-- Season 1
|    |
|    +-- Episode 1
|    |    +-- 480p SUB
|    |    +-- 720p SUB
|    |    +-- 1080p SUB
|    |
|    +-- Episode 2
|         +-- 480p SUB
|         +-- 720p SUB
|         +-- 1080p SUB
|
+-- Season 2
     |
     +-- Episode 1
          +-- 480p SUB
          +-- 1080p SUB
```

Every important object receives its own ID.

Example:

```text
Anime:    ANM_8K4F2Q
Season:   SEA_7F92KD
Episode:  EPI_29XK1A
File:     FIL_8D72LP
```

These IDs are internal identifiers and should not be used as security tokens.

---

# Technology Stack

## Backend

* Node.js
* JavaScript
* Next.js App Router

## Hosting

* Vercel

## Database

* Supabase PostgreSQL

## Metadata

* AniList GraphQL API

## Administration

* Telegram Bot API

## Future Frontend

* Next.js
* React
* JavaScript or TypeScript

---

# Project Structure

Recommended structure:

```text
anivault/
|
├── app/
│   └── api/
│       └── telegram/
│           └── route.js
|
├── bot/
│   ├── handlers/
│   │   ├── start.js
│   │   ├── anime.js
│   │   ├── season.js
│   │   ├── episode.js
│   │   ├── upload.js
│   │   └── delete.js
│   |
│   ├── keyboards/
│   │   ├── admin.js
│   │   ├── anime.js
│   │   ├── season.js
│   │   └── episode.js
│   |
│   └── router.js
|
├── lib/
│   ├── telegram.js
│   ├── supabase.js
│   ├── anilist.js
│   ├── parser.js
│   ├── tokens.js
│   └── ids.js
|
├── package.json
├── .env.local
├── .gitignore
└── README.md
```

The Telegram webhook route should remain small.

Avoid putting all bot logic inside:

```text
app/api/telegram/route.js
```

Instead, the route should pass the update to the appropriate handler.

---

# Features

## Admin

* Telegram authentication
* `/start`
* Add Anime
* AniList search
* AniList metadata preview
* Add Season
* Bulk file upload
* Automatic filename parsing
* Automatic episode grouping
* Quality detection
* Subtitle/dub detection
* Language management
* Duplicate detection
* Overwrite/Ignore functionality
* Review before saving
* Delete Anime
* Delete Season
* Delete Episode
* File management
* Token generation

## User

Future user functionality:

* Browse anime
* Browse seasons
* Browse episodes
* View available qualities
* View subtitle/dub languages
* Download authorized files
* Use Telegram deep-link tokens

---

# Admin Workflow

The intended workflow is:

```text
/start
   |
   v
+----------------+
| Admin Menu     |
+----------------+
| Add Anime      |
| List Anime     |
| Delete Anime   |
+----------------+
```

---

# Add Anime

Administrator selects:

```text
+ Add Anime
```

Bot:

```text
Enter the anime title:
```

Admin:

```text
Jujutsu Kaisen
```

AniVault searches AniList.

Results:

```text
Jujutsu Kaisen

[Result 1]
[Result 2]
[Result 3]
```

Administrator selects a result.

AniVault displays:

```text
Jujutsu Kaisen

Format: TV
Status: Finished

Description:
...

[Back] [Next]
```

After selecting:

```text
Next
```

the administrator can add a season.

---

# Add Season

Bot:

```text
Enter the season name:

Example:
Season 1
```

Admin:

```text
Season 1
```

Bot:

```text
Upload the files for this season.

Send as many files as necessary.

When finished:

[Done]
```

---

# Bulk Upload

The administrator can upload files such as:

```text
[S01-E01] Jujutsu Kaisen [480p] [Sub].mkv
[S01-E01] Jujutsu Kaisen [720p] [Sub].mkv
[S01-E01] Jujutsu Kaisen [1080p] [Sub].mkv

[S01-E02] Jujutsu Kaisen [480p] [Sub].mkv
[S01-E02] Jujutsu Kaisen [720p] [Sub].mkv
[S01-E02] Jujutsu Kaisen [1080p] [Sub].mkv
```

AniVault automatically groups them.

---

# Upload Review

After pressing:

```text
Done
```

AniVault analyzes the uploaded files.

Example:

```text
UPLOAD REVIEW

Anime:
Jujutsu Kaisen

Season:
Season 1

Episodes:
24

Files:
72

SUB:
English

DUB:
None

Qualities:
480p
720p
1080p

Warnings:
0

Duplicates:
0

[Confirm]
[Cancel]
```

Nothing should be permanently committed until the administrator confirms.

---

# Database Architecture

## `anime`

Stores anime metadata.

```text
id
anilist_id
title
slug
native_title
description
poster_url
banner_url
format
status
start_date
end_date
created_at
updated_at
```

Example:

```text
ANM_8K4F2Q
145932
Jujutsu Kaisen
jujutsu-kaisen
呪術廻戦
...
```

---

# `seasons`

```text
id
anime_id
season_number
name
slug
created_at
updated_at
```

Relationship:

```text
anime.id
    |
    +---- seasons.anime_id
```

One anime can have multiple seasons.

---

# `episodes`

```text
id
season_id
episode_number
title
description
created_at
updated_at
```

Relationship:

```text
season.id
    |
    +---- episodes.season_id
```

---

# `files`

```text
id
episode_id
quality
resolution
language_type
language
filename
extension
mime_type
file_size
telegram_chat_id
telegram_message_id
telegram_file_id
created_at
updated_at
```

Example:

```text
id:
FIL_8D72LP

episode_id:
EPI_29XK1A

quality:
1080p

resolution:
1920x1080

language_type:
sub

language:
English

filename:
[S01-E05] Jujutsu Kaisen [1080p] [Sub].mkv

extension:
mkv
```

---

# `anime_languages`

```text
id
anime_id
language_type
language
```

Examples:

```text
SUB | English
SUB | Japanese
DUB | English
DUB | Spanish
DUB | French
```

This allows multiple subtitle and dub languages.

---

# `start_tokens`

Stores secure Telegram access tokens.

```text
id
token
token_type
anime_id
season_id
episode_id
file_id
created_at
```

Allowed token types:

```text
season
episode
file
```

There is deliberately no:

```text
all_seasons
```

token.

---

# `admin_sessions`

Stores the current administrator workflow state.

```text
id
telegram_user_id
chat_id
state
data
created_at
updated_at
```

Example:

```json
{
  "animeId": "ANM_8K4F2Q",
  "seasonId": "SEA_7F92KD",
  "uploadSessionId": "..."
}
```

State example:

```text
WAITING_ANIME_TITLE
SELECTING_ANIME
ADDING_SEASON
WAITING_SEASON_NAME
WAITING_FILES
REVIEWING_UPLOAD
CONFIRMING
```

---

# `upload_sessions`

Temporary storage for bulk uploads before confirmation.

```text
id
telegram_user_id
anime_id
season_id
status
created_at
updated_at
```

---

# `upload_files`

Stores temporary information about individual uploaded files.

```text
id
upload_session_id
filename
telegram_file_id
parsed_data
status
created_at
```

Possible statuses:

```text
pending
parsed
invalid
duplicate
approved
ignored
```

---

# Filename Parser

The parser is responsible for converting filenames into structured data.

Example:

```text
[S01-E05] Jujutsu Kaisen [1080p] [Sub].mkv
```

becomes:

```js
{
  season: 1,
  episode: 5,
  title: "Jujutsu Kaisen",
  quality: "1080p",
  languageType: "sub",
  extension: "mkv"
}
```

Another example:

```text
[S01-E06] Jujutsu Kaisen [720p] [Dub].mp4
```

becomes:

```js
{
  season: 1,
  episode: 6,
  title: "Jujutsu Kaisen",
  quality: "720p",
  languageType: "dub",
  extension: "mp4"
}
```

---

# Quality Normalization

The parser should normalize common variations.

```text
1080
1080P
FHD
FULLHD
```

becomes:

```text
1080p
```

```text
720
720P
HD
```

becomes:

```text
720p
```

```text
480
480P
SD
```

becomes:

```text
480p
```

```text
HDRIP
HD-RIP
```

becomes:

```text
HDRIP
```

The normalization logic should be centralized inside:

```text
lib/parser.js
```

---

# Subtitle and Dub Detection

Normalize:

```text
Sub
SUB
sub
Subtitle
```

to:

```text
sub
```

Normalize:

```text
Dub
DUB
dub
Dubbed
```

to:

```text
dub
```

The parser should also be designed to support actual languages.

Examples:

```text
English
Spanish
French
Japanese
German
```

---

# Invalid Files

Files that cannot be safely parsed must not be silently accepted.

Example:

```text
random-video.mkv
```

The bot should report:

```text
Could not parse:

random-video.mkv

Missing:
- Season
- Episode
- Quality
- Language
```

The administrator should be able to correct the problem or remove the file from the upload session.

---

# Duplicate Handling

AniVault should prevent accidental duplicate files.

The preferred logical uniqueness rule is:

```text
episode_id
+
quality
+
language_type
+
language
```

Example:

```text
Episode 5
1080p
SUB
English
```

cannot normally exist twice.

If a duplicate is detected:

```text
Duplicate detected:

Episode 5
1080p SUB
English
```

Options:

```text
[Overwrite]
[Ignore]
[Review]
```

For bulk duplicates:

```text
[Overwrite All]
[Ignore All]
[Review Each]
```

---

# Token System

AniVault uses random 30-character tokens.

Example:

```text
a8Kd92LmP0xQ7wNz3RtY5UvBc1HsEf
```

Tokens should be generated using a cryptographically secure random generator.

Never use:

```text
/start 1
/start 2
/start 3
```

as access tokens.

---

# Season Token

A season token identifies one season.

Example:

```text
/start SEASON_TOKEN
```

The bot can display:

```text
Jujutsu Kaisen
Season 1

[Episode 1]
[Episode 2]
[Episode 3]
[Episode 4]
```

---

# Episode Token

An episode token identifies one episode.

Example:

```text
/start EPISODE_TOKEN
```

The bot displays:

```text
Jujutsu Kaisen
Season 1
Episode 5

[480p SUB]
[720p SUB]
[1080p SUB]
[HDRIP SUB]
```

---

# File Token

A file token identifies exactly one file.

Example:

```text
/start FILE_TOKEN
```

The bot identifies the corresponding authorized file and provides it through Telegram.

---

# No All-Seasons Token

AniVault intentionally does not generate an all-seasons token.

The highest-level token is:

```text
Season
```

This prevents one token from representing the entire anime library.

---

# Telegram Bot Architecture

The webhook route:

```text
app/api/telegram/route.js
```

should perform only basic request handling.

Conceptually:

```js
export async function POST(request) {
  const update = await request.json();

  await handleTelegramUpdate(update);

  return Response.json({
    ok: true
  });
}
```

The router then determines the update type.

```text
Telegram Update
       |
       +-- message
       |
       +-- callback_query
       |
       +-- other
```

---

# Message Handling

Important message types:

```text
/start
text
document
video
```

The current admin session determines how a message is interpreted.

Example:

```text
WAITING_ANIME_TITLE
```

means the next text is treated as an anime search.

While:

```text
WAITING_FILES
```

means the next document/video should be treated as an uploaded media file.

---

# Callback Handling

Telegram inline buttons produce callback queries.

Examples:

```text
ADD_ANIME
LIST_ANIME
DELETE_ANIME
SELECT_ANIME
ADD_SEASON
SELECT_SEASON
ADD_EPISODE
DELETE_EPISODE
CONFIRM_UPLOAD
CANCEL_UPLOAD
```

Callback data should remain compact.

Do not put huge metadata objects into callback data.

Use an internal temporary ID when necessary.

---

# Admin Authentication

Every admin operation must verify the Telegram user ID.

```text
Telegram User ID
       |
       v
Compare with TELEGRAM_ADMIN_ID
       |
   +---+---+
   |       |
  YES      NO
   |       |
 Allow    Reject
```

A normal user must never be able to execute admin operations.

---

# File Storage

Telegram may be used as the storage/reference layer for authorized media.

The database stores:

```text
telegram_chat_id
telegram_message_id
telegram_file_id
```

The application should avoid downloading large media files into Vercel unnecessarily.

Vercel is intended primarily for:

```text
Webhook processing
API
Database access
Metadata
Business logic
Web application
```

not permanent large-file storage.

---

# Future Web Application

The future website will consume the Supabase catalog.

Possible routes:

```text
/anime
/anime/[slug]
/anime/[slug]/season/[season]
/anime/[slug]/season/[season]/episode/[episode]
```

The website should display:

```text
Jujutsu Kaisen

Season 1

Episode 5

480p SUB       [Download]
720p SUB       [Download]
1080p SUB      [Download]
```

The website should not simply redirect the user to Telegram.

Instead:

```text
Browser
   |
   v
Website/API
   |
   v
Database
   |
   v
Authorized file delivery
```

The exact large-file delivery architecture should be implemented separately from the initial bot/database system.

---

# Suggested Future API

Possible endpoints:

```text
GET /api/anime
GET /api/anime/:id
GET /api/anime/:id/seasons
GET /api/seasons/:id
GET /api/seasons/:id/episodes
GET /api/episodes/:id
GET /api/episodes/:id/files
```

Future search:

```text
GET /api/search?q=jujutsu
```

---

# Environment Variables

Create:

```text
.env.local
```

with:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ADMIN_ID=your_telegram_id

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

ANILIST_API_URL=https://graphql.anilist.co
```

Never commit `.env.local`.

Add:

```text
.env.local
.env
```

to `.gitignore`.

---

# Local Development

Install Node.js first.

Then:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

The local application will normally be available at:

```text
http://localhost:3000
```

However, Telegram webhooks require a publicly accessible HTTPS endpoint.

For local webhook testing, use an HTTPS tunneling service or temporarily deploy to Vercel.

---

# Package Installation

The project will need packages for:

* Next.js
* React
* Supabase
* HTTP/API requests where necessary

Example setup:

```bash
npm install next react react-dom @supabase/supabase-js
```

The exact package list should be finalized during implementation.

---

# Supabase Setup

Create a Supabase project.

Then create the required tables:

```text
anime
seasons
episodes
files
anime_languages
start_tokens
admin_sessions
upload_sessions
upload_files
```

Relationships:

```text
anime
 |
 +-- seasons
      |
      +-- episodes
           |
           +-- files
```

Foreign keys should be used wherever appropriate.

---

# Database Integrity

Use database constraints to prevent invalid data.

Examples:

* `anime.anilist_id` should be appropriately indexed/unique where required.
* Season numbers should be unique per anime where appropriate.
* Episode numbers should be unique per season.
* File combinations should prevent unintended duplicates.
* Token values should be unique.

Indexes should be added for commonly queried fields.

Examples:

```text
anime.slug
anime.anilist_id
seasons.anime_id
episodes.season_id
files.episode_id
start_tokens.token
```

---

# Vercel Deployment

Create a Vercel project connected to the Git repository.

Configure:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_ID
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANILIST_API_URL
```

as Vercel environment variables.

Deploy the application.

The webhook endpoint should become something similar to:

```text
https://your-project.vercel.app/api/telegram
```

The exact URL depends on the deployed project.

---

# Telegram Webhook

After deployment, configure Telegram to send updates to the Vercel endpoint.

Conceptually:

```text
Telegram
   |
   | HTTPS POST
   v
https://your-project.vercel.app/api/telegram
```

A webhook secret should also be configured and verified where supported.

---

# Webhook Flow

When the administrator sends:

```text
/start
```

the complete flow is:

```text
Admin
 |
 | /start
 v
Telegram
 |
 | POST update
 v
Vercel
 |
 v
route.js
 |
 v
Telegram Update Router
 |
 v
Start Handler
 |
 v
Admin Verification
 |
 v
Telegram API
 |
 v
Admin receives menu
```

---

# Error Handling

All external services can fail.

The application must handle:

```text
AniList unavailable
Supabase unavailable
Telegram API failure
Invalid filename
Duplicate file
Unauthorized user
Invalid callback
Database constraint failure
Expired session
Invalid token
```

Example response:

```text
⚠️ Something went wrong.

The file could not be processed.

Please try again.
```

For administrator-facing errors, provide enough information to diagnose the problem without exposing secrets.

---

# Logging

Useful logs:

```text
[INFO] Telegram update received
[INFO] Admin authenticated
[INFO] AniList search performed
[INFO] Anime selected
[INFO] Season upload started
[INFO] File received
[INFO] File parsed
[WARN] File could not be parsed
[WARN] Duplicate detected
[INFO] Upload confirmed
[INFO] Database transaction completed
```

Never log:

```text
TELEGRAM_BOT_TOKEN
SUPABASE_SERVICE_ROLE_KEY
```

or other sensitive credentials.

---

# Development Roadmap

## Phase 1 — Foundation

* [ ] Create Next.js project
* [ ] Create Vercel project
* [ ] Configure environment variables
* [ ] Create Telegram bot
* [ ] Create webhook endpoint
* [ ] Verify webhook works

---

## Phase 2 — Database

* [ ] Create Supabase project
* [ ] Create anime table
* [ ] Create seasons table
* [ ] Create episodes table
* [ ] Create files table
* [ ] Create anime_languages table
* [ ] Create start_tokens table
* [ ] Create admin_sessions table
* [ ] Create upload_sessions table
* [ ] Create upload_files table
* [ ] Add relationships
* [ ] Add indexes
* [ ] Add uniqueness constraints

---

## Phase 3 — Admin Authentication

* [ ] Verify Telegram user ID
* [ ] Block unauthorized users
* [ ] Implement admin session state

---

## Phase 4 — Main Menu

* [ ] `/start`
* [ ] Add Anime
* [ ] List Anime
* [ ] Delete Anime

---

## Phase 5 — AniList

* [ ] Implement GraphQL client
* [ ] Search anime
* [ ] Display search results
* [ ] Select anime
* [ ] Display metadata
* [ ] Save AniList metadata

---

## Phase 6 — Seasons

* [ ] Add Season
* [ ] Season name
* [ ] Season ID
* [ ] Season listing
* [ ] Season deletion

---

## Phase 7 — Upload System

* [ ] Start upload session
* [ ] Receive Telegram files
* [ ] Store temporary file references
* [ ] Parse filenames
* [ ] Detect invalid files
* [ ] Group files
* [ ] Review upload

---

## Phase 8 — Duplicate System

* [ ] Detect duplicates
* [ ] Overwrite
* [ ] Ignore
* [ ] Review
* [ ] Overwrite All
* [ ] Ignore All

---

## Phase 9 — Database Commit

* [ ] Create episodes
* [ ] Create file records
* [ ] Create language records
* [ ] Generate tokens
* [ ] Commit transaction
* [ ] Clear temporary upload session

---

## Phase 10 — Episode Management

* [ ] Add Episode
* [ ] Upload episode files
* [ ] Detect duplicates
* [ ] Replace files
* [ ] Delete episode

---

## Phase 11 — User Tokens

* [ ] Season token
* [ ] Episode token
* [ ] File token
* [ ] `/start TOKEN`
* [ ] Invalid token handling
* [ ] Token lookup

---

## Phase 12 — Website

* [ ] Anime API
* [ ] Season API
* [ ] Episode API
* [ ] File API
* [ ] Search
* [ ] Anime pages
* [ ] Season pages
* [ ] Episode pages
* [ ] Download interface

---

# Future Improvements

Possible future features:

## Search

Search the internal catalog.

```text
Jujutsu Kaisen
One Piece
Naruto
```

## Filters

Filter by:

```text
Genre
Year
Status
Format
Language
Quality
```

## Sorting

```text
Recently Added
Alphabetical
Popular
Recently Updated
```

## User Accounts

Future website users could have:

```text
Account
Watchlist
Favorites
History
Preferences
```

## Admin Dashboard

Eventually replace some Telegram management functionality with a web dashboard.

Possible dashboard:

```text
Dashboard
Anime
Seasons
Episodes
Files
Uploads
Users
Settings
Logs
```

Telegram would still be useful for fast administrative actions.

---

# Important Design Principles

## 1. Database is the source of truth

The database determines:

```text
Which anime exists?
Which seasons exist?
Which episodes exist?
Which files exist?
```

---

## 2. Telegram is an interface/storage integration

Telegram should not become the database.

The application must maintain structured metadata in Supabase.

---

## 3. Never trust filenames blindly

A filename is user-provided input.

Always validate it.

---

## 4. Never silently overwrite

Existing media should require an explicit overwrite decision.

---

## 5. Never expose secrets

Secrets stay on the server.

---

## 6. Do not make Vercel the permanent media server

Vercel handles:

```text
API
Webhook
Business logic
Metadata
```

Large-file storage and delivery should be handled by infrastructure appropriate for that purpose.

---

## 7. Tokens are separate from IDs

IDs identify database records.

Tokens provide access to specific objects.

Never use predictable database IDs as access tokens.

---

# Example Final Catalog

A completed AniVault catalog might look like:

```text
ANM_001
Jujutsu Kaisen
|
+-- SEA_001
|   Season 1
|
|   +-- EPI_001
|   |   Episode 1
|   |   |
|   |   +-- FIL_001 480p SUB
|   |   +-- FIL_002 720p SUB
|   |   +-- FIL_003 1080p SUB
|   |
|   +-- EPI_002
|       Episode 2
|       |
|       +-- FIL_004 480p SUB
|       +-- FIL_005 720p SUB
|       +-- FIL_006 1080p SUB
|
+-- SEA_002
    Season 2
    |
    +-- EPI_025
        Episode 1
        |
        +-- FIL_100 480p SUB
        +-- FIL_101 720p SUB
        +-- FIL_102 1080p SUB
```

---

# Final System Goal

AniVault should ultimately provide a clean pipeline:

```text
                    ADMIN
                      |
                      v
                 TELEGRAM BOT
                      |
                      v
                   VERCEL
                      |
        +-------------+-------------+
        |             |             |
        v             v             v
     AniList      Supabase      Telegram
      Metadata     Database       Files
        |             |
        +------+------+ 
               |
               v
          ANIVAULT WEB
               |
               v
       AUTHORIZED USERS
               |
               v
        FILE DELIVERY
```

The administrator should be able to manage the entire catalog without manually editing database rows.

The system should automatically transform uploaded filenames into structured media records, maintain relationships between anime/seasons/episodes/files, detect duplicates, generate secure tokens, and expose the organized catalog to the future web application.

The initial implementation should prioritize **correctness, database integrity, security, and a clean architecture** over adding unnecessary features too early.

---

# License / Content Responsibility

AniVault should only be used with media that the operator is authorized to store, distribute, and deliver.

The software itself is intended as a media catalog and management system and does not grant rights to any third-party content.

---

# Status

```text
Project: AniVault
Platform: Telegram + Vercel + Supabase
Language: JavaScript
Backend: Next.js
Metadata: AniList
Storage integration: Telegram / future dedicated storage
Frontend: Planned
Status: In Development
```
