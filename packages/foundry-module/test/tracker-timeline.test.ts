import assert from "node:assert/strict";
import test from "node:test";

// Test the pure logic extracted from tracker-timeline without importing the
// full module (which pulls in Foundry globals). We replicate the functions
// that are safe to unit-test here.

// ---------------------------------------------------------------------------
// Replicated logic (mirrors tracker-timeline.ts internals)
// ---------------------------------------------------------------------------

type TimelineEventType =
  | "npc-death" | "quest-complete" | "quest-start" | "faction-shift"
  | "location-discovered" | "major-decision" | "item-acquired"
  | "notable-combat" | "other";

type TimelineEvent = {
  session: number;
  realDate?: string;
  inWorldDate?: string;
  type: TimelineEventType;
  title: string;
  description: string;
  involvedActors?: string[];
  location?: string;
};

const VALID_TYPES: TimelineEventType[] = [
  "npc-death", "quest-complete", "quest-start", "faction-shift",
  "location-discovered", "major-decision", "item-acquired",
  "notable-combat", "other",
];

function normalizeType(raw: string | undefined): TimelineEventType {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, "-");
  return (VALID_TYPES as string[]).includes(s) ? (s as TimelineEventType) : "other";
}

function dedupeKey(event: TimelineEvent): string {
  return `${event.session}::${event.title.toLowerCase().trim()}`;
}

function mergeEvents(existing: TimelineEvent[], incoming: TimelineEvent[]): TimelineEvent[] {
  const merged = [...existing];
  const existingKeys = new Set(merged.map(dedupeKey));
  for (const event of incoming) {
    if (!existingKeys.has(dedupeKey(event))) {
      merged.push(event);
      existingKeys.add(dedupeKey(event));
    }
  }
  merged.sort((a, b) => a.session - b.session);
  return merged;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("normalizeType maps valid types correctly", () => {
  assert.equal(normalizeType("npc-death"), "npc-death");
  assert.equal(normalizeType("quest-complete"), "quest-complete");
  assert.equal(normalizeType("location-discovered"), "location-discovered");
  assert.equal(normalizeType("notable-combat"), "notable-combat");
});

test("normalizeType handles spacing and casing", () => {
  assert.equal(normalizeType("NPC-DEATH"), "npc-death");
  assert.equal(normalizeType("quest complete"), "quest-complete");
  assert.equal(normalizeType("Major Decision"), "major-decision");
});

test("normalizeType falls back to other for unknown values", () => {
  assert.equal(normalizeType("unknown"), "other");
  assert.equal(normalizeType(""), "other");
  assert.equal(normalizeType(undefined), "other");
  assert.equal(normalizeType("random stuff"), "other");
});

test("dedupeKey is case-insensitive and session-scoped", () => {
  const a: TimelineEvent = { session: 3, type: "other", title: "Dragon Attack", description: "" };
  const b: TimelineEvent = { session: 3, type: "other", title: "dragon attack", description: "" };
  const c: TimelineEvent = { session: 4, type: "other", title: "Dragon Attack", description: "" };
  assert.equal(dedupeKey(a), dedupeKey(b));
  assert.notEqual(dedupeKey(a), dedupeKey(c));
});

test("mergeEvents deduplicates by session+title", () => {
  const existing: TimelineEvent[] = [
    { session: 1, type: "npc-death", title: "Strahd Appears", description: "The vampire arrived." },
  ];
  const incoming: TimelineEvent[] = [
    { session: 1, type: "npc-death", title: "Strahd Appears", description: "Duplicate." },
    { session: 1, type: "quest-start", title: "Find the Sunsword", description: "New quest." },
  ];
  const merged = mergeEvents(existing, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.title, "Strahd Appears");
  assert.equal(merged[0]!.description, "The vampire arrived.");
  assert.equal(merged[1]!.title, "Find the Sunsword");
});

test("mergeEvents sorts by session number", () => {
  const existing: TimelineEvent[] = [
    { session: 3, type: "other", title: "Event C", description: "" },
    { session: 1, type: "other", title: "Event A", description: "" },
  ];
  const incoming: TimelineEvent[] = [
    { session: 2, type: "other", title: "Event B", description: "" },
  ];
  const merged = mergeEvents(existing, incoming);
  assert.equal(merged[0]!.session, 1);
  assert.equal(merged[1]!.session, 2);
  assert.equal(merged[2]!.session, 3);
});

test("mergeEvents preserves all fields from existing", () => {
  const existing: TimelineEvent[] = [
    {
      session: 2,
      realDate: "2024-01-15",
      inWorldDate: "15 Eleint 1492",
      type: "location-discovered",
      title: "Castle Ravenloft",
      description: "Party found the castle.",
      involvedActors: ["Ireena", "Rahadin"],
      location: "Barovia",
    },
  ];
  const merged = mergeEvents(existing, []);
  assert.equal(merged[0]!.realDate, "2024-01-15");
  assert.equal(merged[0]!.inWorldDate, "15 Eleint 1492");
  assert.deepEqual(merged[0]!.involvedActors, ["Ireena", "Rahadin"]);
  assert.equal(merged[0]!.location, "Barovia");
});

test("mergeEvents handles empty existing list", () => {
  const incoming: TimelineEvent[] = [
    { session: 1, type: "quest-start", title: "New Quest", description: "Started a quest." },
  ];
  const merged = mergeEvents([], incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.title, "New Quest");
});

test("mergeEvents handles empty incoming list", () => {
  const existing: TimelineEvent[] = [
    { session: 1, type: "other", title: "Old Event", description: "Existing." },
  ];
  const merged = mergeEvents(existing, []);
  assert.equal(merged.length, 1);
});

test("dedupeKey trims whitespace in titles", () => {
  const a: TimelineEvent = { session: 1, type: "other", title: "  Event  ", description: "" };
  const b: TimelineEvent = { session: 1, type: "other", title: "Event", description: "" };
  assert.equal(dedupeKey(a), dedupeKey(b));
});
