import { mountTopicPlanning } from "./topic-planning.mjs";
import { uid, fail } from "./store.mjs";
import { Intelligence } from "./intelligence.mjs";
import { Publishing } from "./publishing.mjs";
import { MediaIntake } from "./media-intake.mjs";
import { SocialConnectors } from "./social-connectors.mjs";

export function mountSocial(
  app,
  store,
  {
    connector,
    env = process.env,
    clock,
    runner,
    mediaDownload,
    paused = () => false,
  } = {},
) {
  let publishing;
  let requests = 0;
  app.use("/api/social", (req, res, next) => {
    if (req.method !== "GET") {
      requests++;
      let done = false;
      const release = () => {
        if (!done) {
          done = true;
          requests--;
        }
      };
      res.once("finish", release);
      res.once("close", release);
    }
    next();
  });
  mountTopicPlanning(app, store, { runner });
  connector ||= new SocialConnectors({ env, token: () => publishing?.token() });
  const intelligence = new Intelligence(store, connector, { clock });
  publishing = new Publishing(store, connector, { env, clock });
  const media = new MediaIntake(store, intelligence, {
    runner,
    download: mediaDownload,
  });
  app.post("/api/social/instagram/import", async (req, res) =>
    res.json(await media.import(req.body.url, req.body.keep ?? false)),
  );
  app.get("/api/social/posts/:id/media/:index", async (req, res) => {
    const file = await media.asset(req.params.id, req.params.index);
    res.type(file.type).sendFile(file.path);
  });
  app.post("/api/social/posts/:id/analyze-media", async (req, res) =>
    res.json(await media.analyze(req.params.id)),
  );
  app.patch("/api/social/posts/:id/media-retention", async (req, res) =>
    res.json(await media.retain(req.params.id, req.body.keep)),
  );
  app.post("/api/social/posts/:id/delete-media", async (req, res) =>
    res.json(await media.discard(req.params.id)),
  );
  const mediaTimer = setInterval(() => {
    if (!paused()) media.cleanup().catch(() => {});
  }, 60000);
  mediaTimer.unref();
  const previews = new Map();
  const session = (req) => req.headers["x-csrf-token"];
  app.get("/api/social/status", (req, res) =>
    res.json({
      providers: connector.status(),
      publishing: publishing.status(),
    }),
  );
  app.get("/api/social/posts", (req, res) =>
    res.json(intelligence.list(req.query)),
  );
  app.post("/api/social/preview", async (req, res) => {
    const p = await intelligence.preview(req.body.url);
    for (const [k, v] of previews)
      if (v.expires < Date.now()) previews.delete(k);
    const id = uid();
    previews.set(id, {
      post: p,
      session: session(req),
      expires: Date.now() + 600000,
      epoch: store.get("settings", "main").epoch,
    });
    res.json({ id, post: p });
  });
  app.post("/api/social/import", (req, res) => {
    if (req.body.previewId) {
      const p = previews.get(req.body.previewId);
      if (
        !p ||
        p.expires < Date.now() ||
        p.session !== session(req) ||
        p.epoch !== store.get("settings", "main").epoch
      )
        throw fail("預覽已失效，請重新解析。");
      res.json(intelligence.save(p.post));
    } else
      res.json(
        intelligence.save(
          {
            body: req.body.body,
            platform: req.body.platform,
            url: req.body.url,
            author: req.body.author,
          },
          { manual: true },
        ),
      );
  });
  app.patch("/api/social/posts/:id", (req, res) =>
    res.json(intelligence.patch(req.params.id, req.body)),
  );
  app.post("/api/social/posts/:id/draft", (req, res) =>
    res.json(intelligence.draft(req.params.id)),
  );
  app.get("/api/social/sources", (req, res) =>
    res.json(intelligence.sources()),
  );
  app.post("/api/social/sources", async (req, res) =>
    res.json(await intelligence.addSource(req.body.url)),
  );
  app.patch("/api/social/sources/:id", async (req, res) =>
    res.json(await intelligence.setSource(req.params.id, req.body)),
  );
  app.post("/api/social/sources/:id/collect", async (req, res) =>
    res.json(await intelligence.collect(req.params.id)),
  );
  app.get("/api/social/schedule", (req, res) =>
    res.json(intelligence.config()),
  );
  app.patch("/api/social/schedule", (req, res) =>
    res.json(intelligence.configure(req.body)),
  );
  app.get("/api/social/runs", (req, res) =>
    res.json(
      store
        .all("collectionRun")
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 30),
    ),
  );
  app.post("/api/social/threads/connect", (req, res) =>
    res.json(publishing.start(session(req))),
  );
  app.post("/api/social/threads/complete", async (req, res) =>
    res.json(await publishing.complete(req.body.url, session(req))),
  );
  app.post("/api/social/threads/refresh", async (req, res) =>
    res.json(await publishing.refresh()),
  );
  app.post("/api/social/threads/disconnect", (req, res) =>
    res.json(publishing.disconnect()),
  );
  app.get("/api/social/publications", (req, res) =>
    res.json(publishing.list()),
  );
  app.post("/api/social/publications", async (req, res) => {
    const p = publishing.create(req.body);
    res.json(req.body.scheduledAt ? p : (await publishing.publish(p.id)) || p);
  });
  app.post("/api/social/publications/:id/cancel", (req, res) =>
    res.json(publishing.cancel(req.params.id)),
  );
  app.post("/api/social/publications/:id/reschedule", (req, res) =>
    res.json(publishing.reschedule(req.params.id, req.body)),
  );
  app.post("/api/social/publications/:id/check", async (req, res) =>
    res.json(await publishing.check(req.params.id)),
  );
  let collecting = false,
    publishingTick = false;
  const timer = setInterval(async () => {
    if (collecting || paused()) return;
    collecting = true;
    try {
      await intelligence.tick();
    } catch {
    } finally {
      collecting = false;
    }
  }, 15000);
  const publishTimer = setInterval(async () => {
    if (publishingTick || paused()) return;
    publishingTick = true;
    try {
      await publishing.tick();
    } catch {
    } finally {
      publishingTick = false;
    }
  }, 15000);
  timer.unref();
  publishTimer.unref();
  return {
    intelligence,
    publishing,
    get busy() {
      return (
        media.busy ||
        requests > 0 ||
        collecting ||
        publishingTick ||
        intelligence.inFlight.size > 0 ||
        publishing.busy
      );
    },
    close() {
      clearInterval(mediaTimer);
      media.close();
      clearInterval(timer);
      clearInterval(publishTimer);
      intelligence.close();
      publishing.close();
    },
  };
}
