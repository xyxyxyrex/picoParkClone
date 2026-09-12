const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
global.window = global;
vm.runInThisContext(fs.readFileSync("src/campaignTemplates.js", "utf8"));
const D = require("../src/level-data.js");
test("all 30 preserved templates validate and retain gate connections", () => {
  const campaign = D.campaign();
  D.validate(campaign, true);
  for (let n = 1; n <= 6; n++)
    for (let r = 1; r <= 5; r++) {
      const source = CampaignTemplates.buildStage(r, n),
        rebuilt = D.blueprint(campaign.variants[n][r - 1]);
      assert.deepEqual(rebuilt.map, source.map);
      assert.equal(rebuilt.keys.length, source.keys.length);
      assert.equal(rebuilt.doors.length, source.doors.length);
      for (const b of rebuilt.buttons)
        assert.ok(rebuilt.doors.some((d) => d.id === b.gateId));
    }
});
test("Level Boundary objects validate as resizable editor-only reset zones", () => {
  const campaign = D.campaign(),
    level = campaign.variants[2][0];
  level.objects.push({
    id: "custom-boundary",
    type: "boundary",
    x: 8,
    y: 9,
    w: 7,
    h: 2,
    rotation: 0,
  });
  D.validate(campaign);
  const blueprint = D.blueprint(level);
  assert.ok(
    blueprint.boundaries.some(
      (b) => b.pos.x === 8 && b.pos.y === 9 && b.size.x === 7 && b.size.y === 2,
    ),
  );
});
test("rejects invalid data, dimensions, duplicate IDs and dangling switches", () => {
  for (const change of [
    (d) => d.variants[1].pop(),
    (d) => (d.variants[2][1].width = Infinity),
    (d) => (d.variants[1][0].objects[0].type = "script"),
    (d) => (d.variants[1][0].objects[1].id = d.variants[1][0].objects[0].id),
    (d) =>
      (d.variants[1][3].objects.find((o) => o.type === "switch").gateId =
        "missing"),
  ]) {
    const data = D.campaign();
    change(data);
    assert.throws(() => D.validate(data));
  }
});
test("edited player variants reach both versus lanes with independent checkpoints", () => {
  global.parkCampaign = D.campaign();
  global.ParkData = D;
  parkCampaign.variants[3][2].name = "Custom shield course";
  parkCampaign.variants[3][2].objects.push({
    id: "custom",
    type: "block",
    x: 3,
    y: 4,
    w: 2,
    h: 1,
    rotation: 0,
  });
  const race = CampaignTemplates.buildVersusCampaign({ team1: 3, team2: 3 });
  assert.equal(race.stageMeta.team1[3].name, "Custom shield course");
  assert.equal(race.stageMeta.team2[3].name, "Custom shield course");
  assert.notDeepEqual(race.spawnByTeam.team1[3], race.spawnByTeam.team2[3]);
  assert.deepEqual(race.stageMeta.team1[3].shields, [2]);
  assert.equal(race.doors.filter((d) => d.checkpoint).length, 10);
  global.parkCampaign = null;
});
