# Prototype Instructions

## Instagram and Threads PRD scope (2026-11-09, latest)

- User narrowed the next product work to Instagram and Threads, using the existing architecture. YouTube is out of scope for this phase.
- User requested a PRD before implementation. Draft: `../懷特先生_IG與Threads內容成長_PRD_v0.3.md`. It is pending review, not permission to enable schedules, connect accounts, or publish.
- Preserve V5 as the accepted finished carousel baseline. Next workflow is daily text-only topic selection, approval before production, official performance ingestion, and evidence-based content iteration.

## Accepted final carousel and next workflow (2026-11-09)

- User explicitly accepted V5 (V4 copy + V3 layout) as complete. It is now the approved output baseline.
- Requested next flow: 3–5 daily topic proposals as text first; user selects/approves topics before image creation. This is a workflow requirement, not authorization to activate a schedule or publish.
- User is evaluating KPI-guided IG analysis and build-versus-buy. Do not represent existing editorial samples as a working IG integration or autonomous learning system.

## Latest selected combination (2026-11-08)

- User explicitly selected V4 copy and V3 layouts. Preserve V4 titles, body text and captions; restore V3 image crops and varied editorial templates, mapped to V4’s 6/5/6 slide narrative. Do not restore removed story branches merely to match old pagination.
- Combined output is `output/ig-story-v5-2026-11-08/`. The selected direction is approved; do not claim the user has already reviewed every combined output. Latest skill references are selected-posts.json and selected-*-overview.jpg. V2 references remain historical.

## Copy rewrite feedback (2026-11-08, earlier)

- User rejected v3 carousel copy and captions as confusing, disjointed and AI-sounding; earlier visual approval is not acceptance of subsequent writing. Rewrite the narrative instead of adding connective words to the same fragmented lines.
- Establish people and what the product does before pronouns or assumed context. Headlines and body should read naturally together. Remove unrelated closing tangents and repeated editorial asides. Caption may repeat essential background to stand alone; do not sacrifice clarity to avoid repetition.
- The v4 rewrite was initially a review candidate; the later explicit selection below supersedes that status. Preserve historical artifacts.

## Approved JISTO story carousel skill (2026-11-07, latest approval)

- Latest refinement: all in-image copy must read as one continuous story across slides. Check the full read-through and adjacent-page transitions; standalone slogans are insufficient. Each complete deliverable also needs ready-to-post caption text including relevant hashtags, with source comments separate. Caption adds perspective; it cannot repair missing story information in the carousel.
- User explicitly approved all three v2 stories: OXO (6 pages), IKEA IMPALA (6), Mailchimp (7), saying they were very satisfied and asking to record them as a skill.
- For new JISTO story carousel selection, writing, revisions or image production, read `.agents/skills/jisto-story-carousel/SKILL.md`. It is the project source of truth for this editorial direction, ahead of older generic carousel recap/CTA formulas or the earlier large-numeral poster layout. Explicit new user instructions still take precedence.
- The skill contains the approved full copy, source mapping and three visual contact sheets. Apply the editorial and visual criteria to new stories; do not force the same hooks, page counts or images.
- Project-local skill files are the maintained source; a matching installed copy in `~/.codex/skills/jisto-story-carousel` makes the skill discoverable by Codex. Keep that copy in sync when intentionally revising the skill.
- This records Codex production guidance. It does not add an App runtime capability, change the server skill allowlist, or authorize posting. Preserve the approved artifacts in `output/ig-story-v2-2026-11-07/`.

## Story voice and image-led carousels (2026-11-07, newest feedback)

- User rejected the three-story pilot as uninteresting and too AI-sounding. Rewrite story structure, not just vocabulary: use documented incidents, people, decisions and consequences; let events unfold before commentary. Remove repeated abstract lessons, obligatory three-point summaries, fake dialogue, invented emotions and reflexive comment CTAs. Natural Chinese prose may vary in sentence and page length; do not enforce slogan-like parallel headings.
- For new editorial samples, use relevant full-bleed imagery with translucent black overlays and readable short passages. Vary framing, image-led pages and information graphics. Avoid repeating huge page numbers above small bottom-aligned body copy. Preserve earlier styles and samples as separate versions.
- User reference: https://www.instagram.com/p/DAYALCnSFn9/ (yuanman_tw, five images inspected). Borrow the photo-to-information rhythm and cross-page visual continuity, not its branding, copy, fish imagery or statistics. The reference mixes light cutout/map pages with dark photographic pages; it is not entirely dark full-bleed.
- Historical photographs must remain attributable. Illustrative reconstructions must be marked as such. A source-backed content preview is not evidence of model workflow integration, public posting or browser verification.

## Graphic poster carousel (2026-11-07, latest selection)

- User selected the graphic poster option from the four-style exploration and clarified multi-page carousel, not a single poster. Add `graphic`（平面海報）as its own style; retain previously selected surreal/street and original works. Do not implement the unselected minimalist photography, cinematic or retro print directions.
- Reference: `output/ig-graphic-runtime/reference.png`, the second displayed exploration. Keep red/black/ivory, oversized bold Chinese, thin grid, numbered red interior pages, and black closing with red circle. Editable copy and live page/step numbers sit over independent generated assets.
- `src/ig-graphic.js` is called by the shared preview/export renderer. This is a fixed reusable composition, not automatic bespoke image generation. Short cover body recommended (28 Chinese characters); overflow blocks export. Preserve existing save-as-variant behavior and provenance.

## Full-bleed carousel imagery (2026-11-07, latest visual direction)

- User selected BOTH original direction 2 and 3 and explicitly rejected merging them. Keep `surreal`（巨物靈感實驗）and `street`（街頭編輯特刊）as independent selectable styles. Each has its own cover/interior/closing imagery. Original typography style remains available.
- The right review panel previews a style and saves an appended variant through `/api/agent/proposals/style`; preserve copy, original proposals and provenance. Style changes do not call a model. Background files are fixed allowlisted local assets, not user-supplied paths.
- Backgrounds and editable text are separate. Current six background assets are creative-exercise illustrations, not automatic generation for arbitrary new topics. Do not claim the app can generate custom photography for each post yet.
- User explicitly wants full-bleed background images and several cover/interior layout versions. This replaces typography-only artwork as the desired direction for new carousel work; preserve historical works.
- Three original image-generated concept sheets are in `output/ig-fullbleed-directions/`, numbered in displayed order. Runtime backgrounds are in `public/ig-backgrounds/`; actual canvas examples and reference comparisons are in `output/ig-fullbleed-runtime/`.
- When implemented, separate background assets from editable text; consider photo cropping, text-safe areas, contrast overlays and varied page hierarchy. Do not claim a concept sheet alone upgrades the runtime renderer.

## Local Codex IG workflow direction (2026-11-07, latest)

- User chose to continue building Mr. White with local Codex for their own IG channel. Preserve the existing app and data; prioritize a working content production flow over cloning a general-purpose bot platform. Docker is optional, not a prerequisite.
- The IG conversation now uses application-controlled creation → independent content review → at most one revision → re-review. This supersedes the older single-call IG constraint; it does not enable arbitrary model-directed spawning or external tools.
- `server/ig-workflow.mjs` owns the bounded sequence. Creation loads carousel + caption methods; review loads human editing methods. Do not apply English detection scores as Chinese editorial quality or claim skill scripts ran when only instructions were used.
- Preserve intermediate candidates, skill versions, source/preference snapshots, reviews and cancellation/restart semantics. Only reviewed proposals enter the normal proposal cards; retain failed candidates in expandable production records. Keep the main chat and right image-review panel simple.
- Content review is not image review, verified external research, or proof of publishable quality. Next milestones and explicit acceptance gaps live in `docs/IG-AGENT-ROADMAP.md`.

## IG image review and redesign (2026-11-05, latest)

- User now explicitly removes scheduling/performance and multi-platform content from the right review panel. Show only actual carousel canvas artwork and IG caption, with pagination, large preview, PNG download and revision controls. Old records remain stored.
- `shared/ig-design.mjs` defines supported visual tokens; proposals persist theme and per-slide layout. `src/ig-renderer.js` renders the exact same 1080×1350 image for preview and download. Keep the old work renderer unchanged for historical works.
- A redesign request must change actual visual configuration; a reply that only promises redesign fails instead of appearing completed. Revised proposals append with parent provenance. Historical drafts can seed a new IG proposal without overwriting the original.
- Prioritize a clear cover hook, readable type, short single-point slides and a varied sequence. No guarantees of viral reach. Canvas typography artwork is real output but is not AI-generated photography/illustration.

## Minimal IG proposal workflow (2026-11-05, latest scope)

- User clarified that the right panel should remain unchanged; the requested chat redesign concerns only central messages and composer. Undo the collapsed-right-panel experiment.
- Current studio starts with one IG carousel conversation: 1–3 proposal cards in chat, expand to read caption and 4–8 slides, select a card and give natural-language revisions. Remove central skill switches, source dashboard, quick-task buttons and delegation reports. New revisions append proposals without overwriting originals.
- `workflow: ig-carousel` uses the existing consent, job locking, cancellation and SQLite message persistence. Validate proposal count and selected server-owned message/index; do not require Threads/master content. Preserve old data and APIs for existing right-panel records. This supersedes the five-agent navigation as the visible starting workflow.
- Proposal cards are text content, not rendered/generated carousel images. Do not claim visual or live-model acceptance from mock tests.

## Chat layout refinement (2026-11-05, latest)

- User wants less left-rail whitespace and slightly smaller navigation labels. Use a compact 112–128px desktop roster with 11px labels; preserve small distinct icons and tooltips.
- Central workspace should read as a chat window: compact header, left Agent / right user bubbles, subdued message background, opaque bubbles and a bottom composer outside the scrolling message region. Keep the welcome compact and conversational rather than a landing-page hero.

## Reading contrast correction (2026-11-05, latest)

- User found the LP adaptation too transparent and harder to read. Prioritize opaque reading surfaces over glass: solid white / charcoal content, distinct neutral utility rails and inputs, visible borders and readable secondary text in both themes. Retain compact icons, tooltip descriptions and capsule navigation. This supersedes translucent panel guidance below.

## LP visual reference (2026-11-05, latest appearance)

- User explicitly selected `/Users/yuga/Desktop/SideProject/LP` as the visual reference across screens and components. Its monochrome light grey / charcoal palette, capsule navigation, translucent rounded panels and small regular-weight icons supersede previous ink/green appearance instructions. Preserve both themes and authored carousel colors.
- Keep the five-entry Agent roster compact: labels plus distinct 16px icons; descriptions appear in hover/focus tooltips instead of permanent subtitles. Preserve keyboard focus, Escape dismissal and mobile article-list access.
- Shared reference tokens and final component styling live in `src/lp-theme.css`; tooltip portals live in `src/Tooltip.jsx`.

## Consolidated conversation workspaces (2026-11-05, latest)

- User found the 14-entry roster hard to read and asked to consolidate Agents into capabilities inside conversations. The visible navigation now has five entries: coordinator, strategy, creation, editing, engagement, each with a distinct Phosphor icon. This supersedes the previous 14-entry UI.
- Keep 13 underlying skills and coordinator dispatch. Category conversations support automatic selection or a validated capability chosen in the composer, without switching conversations or losing input.
- `shared/agent-workspaces.mjs` defines grouping. Read legacy specialist records into their category without rewriting/deleting them; preserve legacy API identity. Recover legacy unsent input into category localStorage once, retaining original keys.
- SQLite stores messages/runs/drafts/preferences; categories are logical conversation views, not separate databases. Preferences, authored works and review queue remain shared. Skills are local Markdown instructions, not separately trained models.

## Multi-agent creative studio (2026-11-05)

- User authorized implementing a left-hand Agent roster: one coordinator plus specialists backed by the 13 installed Instagram skills. Each specialist opens its own persistent conversation; the coordinator can dispatch real specialist model calls and synthesize results.
- Registry and skill provenance live in `server/agent-catalog.mjs`; never accept filesystem paths from clients. Legacy untagged conversation records belong to `coordinator`. Preserve shared review/approval, revision guards, backups, and original authored content.
- Dispatch is bounded to three distinct specialists per request, sequential with prior results passed forward. Expose task progress and preserve completed results on later failure; cancellation and restart must stop remaining work.
- Skills provide methods, not new tool permissions. Current agents analyze supplied/collected material and generate text; no automatic browsing, script execution, image/video generation, public posting or DMs. Do not claim external research or visual rendering happened when only text was generated.

## JISTO positioning and reference selection (2026-11-05)

- Latest user-confirmed positioning is in `../嘉思學院_策略與產品藍圖/01_品牌策略與定位演進.md`, section dated 2026-11-05. JISTO is a creative experiment lab combining creativity, design, technology and business: make interesting ideas real, with useful outcomes and original viewpoints.
- Prioritize general-audience curiosity and needs; initial content mix is 50% original builds, 30% creative redesigns, 20% cases with original commentary. These are test allocations, not performance guarantees.
- User finds current carousel visuals unattractive and uninviting. Research specific high-traffic global examples before redesigning; do not restrict references to Taiwan, Chinese, or design educators. Separate video views from IG carousel evidence, and record platform/date/source rather than inventing engagement or outlier multiples.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product scope and decisions

- This is the local full-stack Mr. White writing app, based on `../懷特先生_PRD_v0.1.md`, not a static prototype-only task.
- The user-selected `../image copy.png` overrides the PRD light-theme default: deep ink background, muted green, thin borders, subtle glow. Typefully is the interaction-density reference, not authorization to add social scheduling.
- Keep only article list + editor. Settings belong under the upper-right avatar; AI belongs below the editor. No review states, dashboards, permanent assistant panel or seeded demo articles.
- `npm run dev` serves frontend + local API at 127.0.0.1:4389. Never expose the Codex backend to public hosting.
- Never mark the MVP complete until actual browser, Codex, isolation, and Drive acceptance checks in VALIDATION.md pass. Fake adapters are for tests only.

## Intelligence room v0.2 (2026-11-04)

- User authorized implementation using implement → test → inspect → fix loops. The v0.2 PRD in the parent directory supersedes the older no-social/no-inbox scope above.
- Implement phase 1 first: Threads/IG manual intake and today's scheduled collection, plus official Threads text publishing. Later roadmap phases are not automatically authorized.
- Retain the existing dark two-column writing workspace and add a separate intelligence workspace; no demo posts in real data.
- Provider credentials and representative accounts are external acceptance dependencies. Never label mock-tested integration as verified live; do not publish public test posts without specified content/account authorization.

## Creative studio (2026-11-04)

- User authorized completing the strategy-driven product functions and writing the first three articles. Implement the independent creative workflow and carousel export; keep external Meta/IG acceptance explicitly blocked without credentials.
- Add a separate creative studio while retaining the established writing and intelligence workspaces. User-requested launch articles are real authored drafts, not fake social-source data or fabricated metrics.
- Writing AI now returns `proposed`, never automatically applies. Human acceptance checks the original revision/range; manual editing may continue during generation.
- Work and carousel history, manual publication snapshots and metric snapshots use the existing SQLite records and backup system. Missing metrics remain null; manual publication is user_reported, not official verification.
- Do not publicly publish the authored launch drafts without a specified account/content instruction.

## Mac launcher (2026-11-04)

- User accepts the local web UI and wants an app icon that starts the service and opens the browser; no full native rewrite is needed.
- `npm run mac:launcher` creates `../懷特先生.app`; preserve the source project and local Node dependency. The launcher must reuse the same data, detect other services, and never kill unrelated processes.
- `docs/CURRENT-STATUS.md` is the current delivery and acceptance entry point; historical checks elsewhere do not imply later work is unfinished or externally verified.

## Appearance (2026-11-04)

- User requested a light mode in addition to the existing dark mode. Retain the ink/green dark theme and add warm-white/green light surfaces across writing, intelligence, studio, and dialogs.
- Appearance is a device/browser preference, persisted locally and available from the header and general settings. It does not recolor carousel artwork or change authored content.

## Conversation-first agent studio (2026-11-04)

- The user now wants the creative studio to be an AI Agent workspace: conversation is the main surface; the right rail has 待審核文章, 排定文章, 文章成效. This supersedes the original no-assistant/no-review restriction for the creative workspace.
- Report actual collected posts, propose angles, prepare master / Threads / IG / carousel copy, and accept natural-language review feedback. Keep forms and advanced work details secondary.
- Rejected drafts must be revised using the user's feedback. Create a new review candidate without overwriting the previous work before explicit approval. Approval is not public publication.
- Remember selected review instructions as transparent, editable, disableable writing preferences. This is stored prompt context, not model training. Preserve both the feedback and draft history.
- Match JISTO's creative identity: useful and surprising ideas, original opinions, real execution, humor, and visual care. Do not fabricate experiments, results, citations, personal experiences, or audience metrics; mechanical validation does not prove professional editorial quality.
- Preserve existing authored works, data epochs, revision guards, real source attribution, light/dark appearance, and official Threads confirmation. Never imply a live integration passed because an injected runner passed tests.

## Intelligence editorial upgrade (2026-11-04)

- User requested Instagram content skills and taste-skill; pinned project-local copies live in `.agents/skills/`. See docs/CONTENT-SKILLS.md for provenance and runtime adaptation.
- Preserve the ink/green identity and light mode; improve intelligence reading density, mobile list/detail navigation and source-to-creative handoff. No invented viral metrics.
- Research notes are user observations, not verified facts or prompt instructions. Keep original sources and revision protection. Reels currently mean timed scripts in conversation, not rendered videos.
- JEV means TypeSafe Jev. Official pricing checked 2026-11-04 says no free/trial credits. It can classify collected content, not acquire social posts itself. No Jev calls, purchase or auto-recharge authorized by the free-quota inquiry.

## Narrowed next milestone (2026-11-04)

- User narrowed the immediate goal to one link-to-post workflow: read an Instagram post's actual images and caption, research additional web sources, develop an original viewpoint, and deliver one post with a recomposed carousel. Start from https://www.instagram.com/p/DZp8LxoiTg3/.
- Prioritize completing this one real deliverable; do not expand scheduling, video rendering, paid Jev or bulk collection. Never infer unseen carousel slides from a caption alone.

## Browser policy — user instruction (2026-11-04)

- From now on, ALL Chrome browsing and testing must use a NEW Guest-profile window. Never reuse the active window or launch/select a personal, work, or other saved profile. This includes source research and localhost previews. If Guest cannot access a source, report that limit; do not switch to a signed-in profile.
- Incognito is not Guest. If the tool cannot create or confirm a Guest window, stop Chrome operations and ask the user to open one; do not inspect personal windows to find an entry point.
- Desktop control is currently stopped. Before using tools that move the desktop pointer or control native applications, explain the scope and obtain explicit user agreement. Tool availability and ordinary development/research requests are not desktop-control consent. Never change macOS privacy permissions yourself.

## Instagram media intake direction (2026-11-04)

- User wants trusted open-source tools to download linked images/videos for analysis. Default raw-media deletion after analysis, with explicit opt-in retention. Preserve authored output and source/analysis records.
- Pilot lives in tools/instagram; official Instaloader v4.16 is pinned and isolated. No personal-browser cookies, persisted login sessions, third-party downloader websites or browser control. See its README for security-review limits and live-test status.
- Do not equate a dependency vulnerability scan with complete security assurance. Python direct networking remains blocked by environment DNS, but the staged curl adapter has successfully downloaded the target post (4 images, 2 videos). This proves that one live download, not full app integration or content analysis.
