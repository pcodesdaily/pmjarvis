# PMJARVIS

A self-hosted Discord music bot with no paywalls, no usage caps and no premium
tier — because you own the server it runs on. It plays by song title or by link
from any supported platform, exposes the full set of controls you would expect
from a music app, and is built as a modular bot so non-music features can be
added later without touching the music code.

## What it does

A deliberately small player, shaped like a music app rather than a kitchen sink.
20 commands, nothing more:

**Playing** — `/play` (song name, or a link, or a whole playlist), `/search`
(pick from the top results), `/nowplaying`.

**Transport** — `/join`, `/pause`, `/resume`, `/skip`, `/previous`, `/seek`,
`/stop` (stops the music and leaves the channel).

**Queue** — `/queue` (paginated), `/shuffle`, `/loop` (off / track / queue),
`/remove`, `/clear`.

**Other** — `/autoplay`, `/volume`, `/help`, `/info`, `/ping`.

Autoplay is on by default: when the queue runs out the bot keeps going with
similar songs, so the music does not just stop.

Plus a live now-playing panel with buttons for previous, play/pause, skip, stop,
loop, shuffle, autoplay and the queue.

Every command works two ways: as a slash command (`/play`) and as a text command
(`pm!play`, or by mentioning the bot). Both run the exact same code.

### Typical use

1. Join a voice channel
2. `pm!join` so the bot comes in
3. `pm!play <song name>` to start the music
4. `pm!stop` when you are done, and the bot leaves

The bot also posts a short welcome message with these steps the first time it is
added to a server.

## Sources

Everything streams straight from Lavalink. **No account, no API key, nothing to
sign in to and nothing that expires.**

- SoundCloud (the default)
- Bandcamp
- Twitch, Vimeo, Niconico
- Direct links to audio files and radio streams (mp3, m3u8, aac, flac, ...)

Search results are re-ranked before anything plays. SoundCloud is full of fan
re-uploads, so a plain search for a song often surfaces a slowed and reverb
edit, a nightcore flip or an hour-long loop above the real recording. Those get
pushed down, unless you asked for one: search "tum hi ho" and you get the
original, search "tum hi ho slowed reverb" and you get the edit. Pasted links
and playlists are never reordered.

**YouTube, Spotify, Apple Music and Deezer links will not play.** YouTube blocks
datacentre IPs and demands a sign-in plus a token that expires every few weeks,
which is not a reasonable thing to ask of anyone running a music bot. The others
never allowed third-party playback at all. Paste one of those links and the bot
explains it and asks you to search by name instead, which finds the same song.

## Audio quality

- **Lavalink is tuned for it** - `opusEncodingQuality: 10`, `resamplingQuality:
  HIGH`, a 400 ms NAS buffer and a 5 s frame buffer to ride out GC pauses.
- **Headroom instead of clipping.** The bot plays a little below the volume it
  displays (`VOLUME_DECREMENTER`), so loud masters have room to breathe.
- **No audio effects.** There is no equaliser or filter command, so nothing ever
  resamples or re-colours the stream. You hear the source.

The biggest single improvement is not in this repo: **raise the voice channel
bitrate.** Discord defaults new channels to 64 kbps and allows 96 kbps
unboosted, 128/256/384 kbps with server boosts. Right-click the channel, Edit
Channel, and drag Bitrate to the maximum. At those ceilings the difference
between one source and another is largely academic.

## Footprint

Measured, not estimated:

| What | Disk | Notes |
| --- | ---: | --- |
| Lavalink image | ~380 MB | A JVM. This is the floor for Lavalink. |
| Bot image | ~150 MB | ~135 MB of that is the Node runtime itself. |
| Container logs | ≤ 20 MB | Capped at 5 MB × 2 files per service. |
| **The bot's own code** | **~400 KB** | Source, tests, config and docs combined. |

The code is a rounding error. Deleting source files saves nothing measurable —
the space is two container images, and both are mostly language runtimes.

What was done to keep it small:

- **One Lavalink plugin.** LavaSrc (Spotify/Apple/Deezer), the two lyrics
  plugins and SponsorBlock were all removed: **10 MB → 1.5 MB**.
- **Dependencies pruned in the image.** `npm ci --omit=dev`, then strip
  TypeScript declarations, source maps and docs, which Node never reads at
  runtime: **25 MB → 12 MB**. Licence texts are kept, as their terms require.
  The full test suite runs green against the pruned tree.
- **Only two runtime dependencies**, `discord.js` and `lavalink-client`.
  `dotenv` was dropped in favour of Node's built-in `--env-file-if-exists`.
- **No Lavalink log files.** Docker already captures stdout, so the rotating file
  logs were a second copy that grew to ~70 MB. Read them with
  `docker compose logs lavalink`.
- **Capped log growth and hard memory ceilings** so neither container can grow
  without bound.
- **Tests and docs never enter the image**, via `.dockerignore`.

Roughly **550 MB of disk** and **~900 MB of RAM** in total. Lavalink is a JVM;
starving it of metaspace or thread stack makes it fail to boot, so only the heap
and the garbage collector are tuned. Reclaim build
leftovers at any time with:

```bash
docker image prune -f && docker builder prune -f
```

## Requirements

- A VPS with Docker and the Compose plugin (Hostinger's Docker Manager is fine)
- **~550 MB of disk** and **~900 MB of RAM** (see [Footprint](#footprint))
- A Discord application with a bot user

## Setting up the Discord application

1. Go to https://discord.com/developers/applications and create an application.
2. **Bot** tab, *Reset Token*, copy it into `DISCORD_TOKEN`.
3. **General Information**, copy the *Application ID* into `CLIENT_ID`.
4. **Bot** tab, *Privileged Gateway Intents*: enable **Message Content Intent**
   if you want `pm!play`-style text commands. Slash commands work without it; set
   `ENABLE_MESSAGE_COMMANDS=false` if you would rather not enable it.
5. **OAuth2 / URL Generator**: scopes `bot` and `applications.commands`, then
   permissions *View Channels*, *Send Messages*, *Embed Links*, *Read Message
   History*, *Connect*, *Speak*, *Use Voice Activity*. Invite the bot with the
   generated URL.

## Deploying on a Hostinger VPS with Docker Manager

```bash
git clone <your-repo-url> pmjarvis
```

```bash
cp .env.example .env
```

Fill in `DISCORD_TOKEN`, `CLIENT_ID` and a new `LAVALINK_PASSWORD`, then:

```bash
docker compose up -d --build
```

In Hostinger's **Docker Manager** you can instead create a project, point it at
this repository (or paste the `docker-compose.yml`), and add the same variables
from `.env.example` in the environment section. The compose file builds the bot
image from the `Dockerfile` in the repo, so nothing needs to be published to a
container registry.

Watch it come up:

```bash
docker compose logs -f
```

The first start is slow — Lavalink downloads its plugin jars, which is why the
healthcheck allows a 180 s grace period. The bot waits for Lavalink to report
healthy before it connects.

**Set `DEV_GUILD_ID` to your server's ID for the first run.** Guild commands
register instantly; global commands can take up to an hour to appear. Clear it
once you are happy and restart to publish globally.

### Updating

One command, every time:

```bash
cd ~/pmjarvis && git pull && docker compose up -d --build --force-recreate
```

`git pull` fetches the new code, `--build` rebuilds the bot image, and
`--force-recreate` restarts both containers. That last flag matters:
`lavalink/application.yml` is mounted into the container and only read at
startup, so without it a config change is pulled but never applied.

Your `.env` is never touched by a pull, because it is not in the repository.
If an update adds a new setting it will appear in `.env.example`, so after
pulling you can check for anything you are missing:

```bash
diff <(grep -oE '^[A-Z0-9_]+' .env.example | sort) <(grep -oE '^[A-Z0-9_]+' .env | sort)
```

Lines starting with `<` are new settings you do not have yet. Add them to
`.env` and run the update command again.

Then confirm it came back up:

```bash
docker compose ps && docker compose logs bot --tail 15
```

You want `lavalink` healthy, plus `Logged in as ...` and
`Audio node "main" connected` from the bot.

### Everyday operations

Follow the bot's log live:

```bash
docker compose logs -f bot
```

Restart just the bot, without touching Lavalink:

```bash
docker compose restart bot
```

Stop everything:

```bash
docker compose down
```

Reclaim disk from old images and build cache:

```bash
docker image prune -f && docker builder prune -f
```

Lavalink is only reachable on the private compose network, so no audio port is
exposed to the internet and the password never leaves the host. Every command
here is scoped to this project and leaves other containers on the machine alone.

## Configuration

Everything lives in `.env`; see `.env.example` for the annotated list. The ones
worth knowing about:

| Variable | Default | What it does |
| --- | --- | --- |
| `PREFIX` | `pm!` | Text-command prefix. Mentioning the bot always works too. |
| `DEFAULT_VOLUME` | `100` | Starting volume for a new player. |
| `MAX_VOLUME` | `150` | Ceiling users can set. |
| `VOLUME_DECREMENTER` | `0.85` | Headroom factor applied below the shown volume. |
| `DEFAULT_SEARCH_PLATFORM` | `scsearch` | Where bare song titles are searched. |
| `AUTOPLAY_DEFAULT` | `true` | Keep playing similar songs when the queue empties. |
| `FALLBACK_SEARCH_PLATFORM` | `scsearch` | Where to retry a song that will not play. Empty disables it. |
| `LEAVE_ON_END_MS` | `120000` | Leave this long after the queue empties (`0` = stay). |
| `LEAVE_ON_EMPTY_MS` | `60000` | Leave this long after the channel empties (`0` = stay). |
| `DJ_FREE_FOR_ALL` | `true` | `false` requires a DJ role for destructive commands. |

## Testing

Before you invite the bot anywhere, run:

```bash
npm test
```

197 tests cover every command, both invocation paths, and the failure modes that
would otherwise show up as a broken bot in a live server. They are not shallow
mocks: the real `lavalink-client` `Player` and `Queue` run, and so do the real
module loader, command router and event handlers. Only the Discord gateway and
the Lavalink socket are replaced, so a passing suite means the actual production
code paths work.

| Area | Examples |
| --- | --- |
| Playing | search by title, links, playlists, play-next, shuffle-on-add, empty and error results, closed-platform links |
| Transport | pause, resume, skip, skip-to, previous, stop, seek |
| Queue | pagination, shuffle, remove (single and range), clear, size limits |
| Audio | volume scaling and headroom, no drift across repeated steps |
| Buttons | all nine panel controls, pagination, permission checks, dead panels |
| Events | now-playing panel lifecycle, track errors, auto-leave |
| Guards | not in voice, wrong channel, missing permissions, full channel, DJ rules |
| Ranking | edited re-uploads demoted, playlists left alone, asked-for edits still win |
| Robustness | 400-character titles, markdown injection, missing artwork, 500-track queues, every Discord embed and autocomplete limit |
| Config | `application.yml` parses, the plugin JAR resolves, every env placeholder is wired through compose and documented |
| Onboarding | `/info` content, the welcome message and its channel fallback, the `pm!` prefix, and that every command appears in `/help` |
| Footprint | dependency count, plugin count, the pinned command set, image pruning, log caps, memory ceilings — so the size gains cannot silently regress |

The config suite reaches the network to confirm the pinned Lavalink plugin
actually exists in its Maven repository — a wrong version there is the classic
reason a self-hosted bot silently fails to start. It skips itself when offline.

### Verifying the deployment itself

The test suite runs the bot's code, not the containers. After `docker compose up
-d` on the VPS, confirm the stack is healthy:

```bash
docker compose ps
```

Both services should be `running`, with `lavalink` marked `healthy`. Then:

```bash
docker compose logs lavalink | grep -iE "loaded plugin|ready to accept|error"
```

You should see `Lavalink is ready to accept connections`. There are no plugins
to download, so this is fast. The bot's own log will print
`Audio node "main" connected`.

## Project layout

```
src/
├── index.js                  entrypoint, wiring and graceful shutdown
├── config.js                 all environment parsing in one place
├── core/
│   ├── client.js             extended discord.js client with tuned caches
│   ├── context.js            one command body serves slash and text commands
│   ├── lavalink.js           Lavalink manager setup
│   ├── loader.js             discovers modules, commands and events
│   ├── runner.js             shared execution and error handling
│   ├── errors.js             CommandError, used to bail out with a nice reply
│   ├── ui.js                 shared embed builders
│   ├── deploy.js             slash-command registration
│   └── logger.js
└── modules/
    ├── core/                 help, info, ping + gateway event handlers
    └── music/
        ├── commands/         one file per command (16)
        ├── events/           Lavalink and voice event handlers
        └── lib/              embeds, buttons, guards, volume, formatting
```

### Adding a feature

Create `src/modules/<name>/commands/<command>.js`:

```js
import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder().setName("hello").setDescription("Say hi"),
  aliases: ["hi"],
  category: "Fun",
  async execute(ctx) {
    await ctx.reply(`Hello, ${ctx.user.username}!`);
  },
};
```

That is the whole contract. The loader picks it up on the next start, registers
the slash command, and wires the alias for text commands. Event handlers work the
same way in `src/modules/<name>/events/`, exporting `{ name, emitter, execute }`
where `emitter` is `client`, `lavalink`, `nodes` or `process`.

## Troubleshooting

**Slash commands do not appear.** Set `DEV_GUILD_ID` to your server ID and
restart — global commands take up to an hour on first publish. Also confirm the
bot was invited with the `applications.commands` scope.

**"The audio server is still starting up."** Lavalink has not finished booting.
Run `docker compose logs lavalink`; the first run downloads the plugin jar.

**The bot exits with "Used disallowed intents".** The Message Content intent is
off. Go to https://discord.com/developers/applications, pick your app, open
**Bot**, scroll to *Privileged Gateway Intents*, enable **MESSAGE CONTENT
INTENT** and save. Then `docker compose restart bot`. If you would rather not
enable it, set `ENABLE_MESSAGE_COMMANDS=false` and use slash commands only.

**Text commands are ignored.** Same intent as above, and make sure
`ENABLE_MESSAGE_COMMANDS=true`.

**A song will not play.** Check `docker compose logs lavalink`. If a single
track fails, the bot already retries it on another platform automatically before
giving up, so a persistent failure usually means the search found nothing rather
than that playback broke.

**A YouTube, Spotify, Apple Music or Deezer link does nothing.** That is by
design; see *Sources*. Search by song name instead and the bot will find it.

## Credits

Built by **Piyush Manna**, AI Engineer.

- LinkedIn: <https://www.linkedin.com/in/pcodesdaily/>
- Instagram: <https://www.instagram.com/piyushiitm/>

Standing on the shoulders of [Lavalink](https://lavalink.dev),
[lavalink-client](https://github.com/Tomato6966/lavalink-client) and
[discord.js](https://discord.js.org).

## Licence

MIT, see [LICENSE](LICENSE). You are responsible for how you use it: respect the
terms of service of the platforms you stream from and Discord's own guidelines.
