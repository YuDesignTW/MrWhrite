import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  createTeam,
  createProject,
  reducer,
  parseState,
} from "../src/team-state.mjs";
import {
  demoCalendar,
  demoAccounts,
  activeAccount,
  DEMO_TODAY,
  demoDaily,
  demoVideos,
  showcaseFiles,
  designFiles,
} from "../src/workspace-demo.mjs";

test("account calendar is deterministic, distinct, and shares schedule/status records", () => {
  const totals = [];
  for (const account of demoAccounts) {
    const calendar = demoCalendar(account.id),
      posts = calendar.flatMap((d) => d.posts);
    assert.equal(calendar.length, 98);
    assert.equal(new Set(calendar.map((d) => d.date)).size, 98);
    assert.deepEqual(calendar, demoCalendar(account.id));
    assert.equal(new Set(posts.map((p) => p.id)).size, posts.length);
    for (const day of calendar)
      for (const post of day.posts) {
        assert.equal(post.date, day.date);
        assert.equal(post.status, day.date > DEMO_TODAY ? "已排程" : "已發佈");
        assert.ok(post.id.startsWith(account.id + ":"));
      }
    assert.ok(posts.some((p) => p.status === "已排程"));
    totals.push(posts.length);
  }
  assert.ok(new Set(totals).size >= 3);
});
test("account selection is per project and keeps existing social data", () => {
  let s = initialState();
  const teamId = s.activeTeamId,
    projectId = s.teams[0].activeProjectId;
  s = reducer(s, {
    type: "addProject",
    teamId,
    project: createProject("other"),
  });
  s = reducer(s, {
    type: "patchRole",
    teamId,
    projectId,
    role: "social",
    patch: { bio: "existing" },
  });
  s = reducer(s, {
    type: "patchRole",
    teamId,
    projectId,
    role: "social",
    patch: { showcaseAccount: "threads-example" },
  });
  assert.equal(activeAccount(s.teams[0].projects[0]).id, "threads-example");
  assert.equal(activeAccount(s.teams[0].projects[1]).id, "ig-example");
  assert.equal(s.teams[0].projects[0].roleData.social.bio, "existing");
});
test("analytics daily values reconcile with displayed video totals", () => {
  assert.equal(
    demoDaily.reduce((a, b) => a + b, 0),
    demoVideos.reduce((s, v) => s + v.views, 0),
  );
  const totals = Object.fromEntries(
    ["views", "comments", "saves", "likes"].map((key) => [
      key,
      demoVideos.reduce((s, v) => s + v[key], 0),
    ]),
  );
  assert.deepEqual(totals, {
    views: 37800,
    comments: 166,
    saves: 877,
    likes: 2407,
  });
});
test("file rename/delete/restore persist without changing fixtures, another project, or old data", () => {
  let s = initialState();
  const teamId = s.activeTeamId,
    projectId = s.teams[0].activeProjectId;
  s = reducer(s, {
    type: "addProject",
    teamId,
    project: createProject("other"),
  });
  const otherTeam = createTeam("same template");
  otherTeam.projects = [createProject("other team project")];
  s = reducer(s, { type: "addTeam", team: otherTeam });
  s = reducer(s, {
    type: "patchRole",
    teamId,
    projectId,
    role: "designer",
    patch: { style: "preserve old setting" },
  });
  const change = (patch) =>
    (s = reducer(s, {
      type: "updateShowcaseFile",
      teamId,
      projectId,
      role: "designer",
      id: "design-1",
      patch,
    }));
  change({ name: "renamed.png", deleted: true });
  s = parseState(JSON.stringify(s));
  assert.equal(
    showcaseFiles(s.teams[0].projects[0], "designer")[0].deleted,
    true,
  );
  assert.equal(
    showcaseFiles(s.teams[0].projects[0], "designer")[0].name,
    "renamed.png",
  );
  assert.equal(
    showcaseFiles(s.teams[0].projects[1], "designer")[0].deleted,
    false,
  );
  assert.equal(
    showcaseFiles(s.teams[1].projects[0], "designer")[0].name,
    designFiles[0].name,
  );
  assert.equal(designFiles[0].deleted, false);
  assert.equal(
    s.teams[0].projects[0].roleData.designer.style,
    "preserve old setting",
  );
  change({ deleted: false });
  assert.equal(
    showcaseFiles(s.teams[0].projects[0], "designer")[0].deleted,
    false,
  );
});
test("successive imports append without losing fixtures, modifications, or prior files", () => {
  let s = initialState();
  const teamId = s.activeTeamId,
    projectId = s.teams[0].activeProjectId;
  s = reducer(s, {
    type: "updateShowcaseFile",
    teamId,
    projectId,
    role: "writer",
    id: "writing-1",
    patch: { name: "mine.md" },
  });
  for (const id of ["upload-a", "upload-b"])
    s = reducer(s, {
      type: "appendShowcaseFile",
      teamId,
      projectId,
      role: "writer",
      item: { id, name: id + ".md", blob: true, deleted: false },
    });
  const files = showcaseFiles(s.teams[0].projects[0], "writer");
  assert.equal(files.length, 6);
  assert.equal(files[0].name, "mine.md");
  assert.deepEqual(
    files.slice(-2).map((f) => f.id),
    ["upload-a", "upload-b"],
  );
  assert.equal(showcaseFiles(s.teams[0].projects[0], "designer").length, 6);
});
