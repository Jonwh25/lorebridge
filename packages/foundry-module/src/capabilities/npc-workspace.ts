import { getLoreBridgeSettings } from "../settings.js";
import { addHistoryEntry } from "../generation-history.js";
import { type NpcMemoryEntry, getMemories, deleteMemory, clearMemories } from "./npc-mention.js";

// ---------------------------------------------------------------------------
// Types — mirror the backend NpcProfileSections model
// ---------------------------------------------------------------------------

type NpcSection =
  | "overview"
  | "gender"
  | "appearance"
  | "personalityAndMotivation"
  | "relationships"
  | "secretsAndStory"
  | "history"
  | "gameplay";

type NpcProfileSections = {
  overview?: Record<string, string>;
  gender?: Record<string, string>;
  appearance?: Record<string, string>;
  personalityAndMotivation?: Record<string, string>;
  relationships?: Record<string, string>;
  secretsAndStory?: Record<string, string>;
  history?: Record<string, string>;
  gameplay?: Record<string, string>;
};

type FieldMeta = { key: string; label: string; editType?: "gender" | "presentation" | "background"; panelHidden?: boolean };

type SectionMeta = {
  id: NpcSection;
  label: string;
  shortLabel: string;
  icon: string;
  fields: FieldMeta[];
};

const SECTION_META: SectionMeta[] = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Overview",
    icon: "fas fa-id-card",
    fields: [
      { key: "race", label: "Race" },
      { key: "occupation", label: "Occupation" },
      { key: "alignment", label: "Alignment", panelHidden: true },
      { key: "age", label: "Age" },
      { key: "faith", label: "Faith" },
      { key: "socialClass", label: "Social Class" },
      { key: "reputation", label: "Reputation" },
      { key: "residence", label: "Residence" },
      { key: "languages", label: "Languages", panelHidden: true },
      { key: "background", label: "Background", editType: "background" },
    ],
  },
  {
    id: "gender",
    label: "Gender",
    shortLabel: "Gender",
    icon: "fas fa-venus-mars",
    fields: [
      { key: "gender", label: "Gender", editType: "gender" },
      { key: "genderPresentation", label: "Presentation", editType: "presentation" },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    shortLabel: "Appearance",
    icon: "fas fa-eye",
    fields: [
      { key: "height", label: "Height" },
      { key: "build", label: "Build" },
      { key: "hair", label: "Hair" },
      { key: "eyes", label: "Eyes" },
      { key: "skin", label: "Skin" },
      { key: "distinguishingFeatures", label: "Distinguishing Features" },
      { key: "clothing", label: "Clothing" },
      { key: "equipment", label: "Equipment" },
      { key: "voice", label: "Voice" },
      { key: "accent", label: "Accent" },
    ],
  },
  {
    id: "personalityAndMotivation",
    label: "Personality & Motivation",
    shortLabel: "Personality",
    icon: "fas fa-brain",
    fields: [
      { key: "personality", label: "Personality" },
      { key: "mannerisms", label: "Mannerisms" },
      { key: "goal", label: "Goal" },
      { key: "fear", label: "Fear" },
      { key: "ideal", label: "Ideal", panelHidden: true },
      { key: "bond", label: "Bond", panelHidden: true },
      { key: "flaw", label: "Flaw", panelHidden: true },
    ],
  },
  {
    id: "relationships",
    label: "Relationships",
    shortLabel: "Relationships",
    icon: "fas fa-users",
    fields: [
      { key: "family", label: "Family" },
      { key: "allies", label: "Allies" },
      { key: "enemies", label: "Enemies" },
      { key: "rivals", label: "Rivals" },
      { key: "organizations", label: "Organizations" },
      { key: "employer", label: "Employer" },
      { key: "mentorStudent", label: "Mentor / Student" },
    ],
  },
  {
    id: "secretsAndStory",
    label: "Secrets & Story",
    shortLabel: "Secrets",
    icon: "fas fa-mask",
    fields: [
      { key: "secret", label: "Secret" },
      { key: "rumor", label: "Rumor" },
      { key: "hiddenAgenda", label: "Hidden Agenda" },
      { key: "currentProblem", label: "Current Problem" },
      { key: "adventureHook", label: "Adventure Hook" },
    ],
  },
  {
    id: "history",
    label: "History",
    shortLabel: "History",
    icon: "fas fa-book-open",
    fields: [
      { key: "publicHistory", label: "Public History", panelHidden: true },
      { key: "privateHistory", label: "Private History", panelHidden: true },
      { key: "gmNotes", label: "GM Notes", panelHidden: true },
    ],
  },
  {
    id: "gameplay",
    label: "Gameplay",
    shortLabel: "Gameplay",
    icon: "fas fa-dice-d20",
    fields: [
      { key: "role", label: "NPC Role" },
      { key: "disposition", label: "Disposition", panelHidden: true },
      { key: "currentStatus", label: "Current Status" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Test-safe ApplicationV2 base
// ---------------------------------------------------------------------------

const _TestSafeBase = class {
  static DEFAULT_OPTIONS = {};
  readonly rendered = false;
  readonly element: HTMLElement = document.createElement("div");
  render(_o?: boolean | { force?: boolean }): Promise<unknown> { return Promise.resolve(undefined); }
  close(_o?: { force?: boolean }): Promise<unknown> { return Promise.resolve(undefined); }
  bringToFront(): void { return; }
  async _renderHTML(_c: Record<string, unknown>, _o: unknown): Promise<HTMLElement> { return document.createElement("div"); }
  _replaceHTML(_r: HTMLElement, _c: HTMLElement, _o: unknown): void { return; }
  _onClickAction(_e: PointerEvent, _t: HTMLElement): void { return; }
} as unknown as typeof FoundryApplicationV2;

const _AppBase: typeof FoundryApplicationV2 = (
  globalThis as unknown as {
    foundry?: { applications?: { api?: { ApplicationV2?: typeof FoundryApplicationV2 } } };
  }
).foundry?.applications?.api?.ApplicationV2 ?? _TestSafeBase;

// ---------------------------------------------------------------------------
// Backend helper
// ---------------------------------------------------------------------------

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function postBackend<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Status / escape helpers
// ---------------------------------------------------------------------------

function sectionHasContent(data: Record<string, string> | undefined): boolean {
  if (!data) return false;
  return Object.values(data).some(v => v && v.trim().length > 0);
}

function sectionStatus(data: Record<string, string> | undefined, fields: FieldMeta[]): "empty" | "partial" | "full" {
  if (!data) return "empty";
  const filled = fields.filter(f => (data[f.key] ?? "").trim().length > 0).length;
  if (filled === 0) return "empty";
  if (filled < fields.length) return "partial";
  return "full";
}

function statusIcon(status: "empty" | "partial" | "full"): string {
  if (status === "full") return "✅";
  if (status === "partial") return "⚠";
  return "❌";
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Gender / Presentation select helpers
// ---------------------------------------------------------------------------

const GENDER_IDENTITY_OPTIONS = ["Male", "Female", "Nonbinary", "Genderfluid", "Agender"];
const GENDER_PRESENTATION_OPTIONS = ["Masculine", "Feminine", "Androgynous", "Neutral"];

function buildGenderSelectHtml(f: FieldMeta, value: string): string {
  const opts = f.editType === "gender" ? GENDER_IDENTITY_OPTIONS : GENDER_PRESENTATION_OPTIONS;
  const isPreset = opts.includes(value);
  const isCustom = value !== "" && !isPreset;
  const selectVal = isPreset ? value : (isCustom ? "__custom__" : "");
  const placeholder = f.editType === "gender" ? "Type gender identity…" : "Type presentation style…";
  return `<select class="lb-gender-select" data-lb-field="${f.key}">
    <option value=""${selectVal === "" ? " selected" : ""}>Unspecified / Random</option>
    ${opts.map(o => `<option value="${o}"${selectVal === o ? " selected" : ""}>${o}</option>`).join("")}
    <option value="__custom__"${isCustom ? " selected" : ""}>Other / Custom…</option>
  </select><input type="text" class="lb-gender-custom" name="${f.key}" data-lb-field="${f.key}" placeholder="${placeholder}" value="${escHtml(isCustom ? value : "")}" style="${isCustom ? "" : "display:none;"}">`;
}

function readGenderFieldValue(container: Element, fieldKey: string): string {
  const select = container.querySelector<HTMLSelectElement>(`select[data-lb-field="${fieldKey}"]`);
  if (!select) return "";
  if (select.value === "__custom__") {
    return container.querySelector<HTMLInputElement>(`input[data-lb-field="${fieldKey}"]`)?.value.trim() ?? "";
  }
  return select.value;
}

function setupGenderSelectListeners(root: Element): void {
  root.querySelectorAll<HTMLSelectElement>(".lb-gender-select").forEach(select => {
    select.addEventListener("change", () => {
      const fieldKey = select.dataset["lbField"] ?? "";
      const customInput = root.querySelector<HTMLInputElement>(`input[data-lb-field="${fieldKey}"]`);
      if (!customInput) return;
      const isCustom = select.value === "__custom__";
      customInput.style.display = isCustom ? "" : "none";
      if (!isCustom) customInput.value = "";
    });
  });
}

// ---------------------------------------------------------------------------
// Background select helpers
// ---------------------------------------------------------------------------

const SRD_BACKGROUNDS = [
  "Acolyte", "Charlatan", "Criminal", "Entertainer", "Folk Hero",
  "Guild Artisan", "Hermit", "Noble", "Outlander", "Sage",
  "Sailor", "Soldier", "Urchin",
];

function buildBackgroundSelectHtml(value: string): string {
  const isPreset = SRD_BACKGROUNDS.includes(value);
  const isCustom = value !== "" && !isPreset;
  const selectVal = isPreset ? value : (isCustom ? "__custom__" : "");
  return `<select class="lb-background-select" data-lb-field="background">
    <option value=""${selectVal === "" ? " selected" : ""}>Unspecified</option>
    ${SRD_BACKGROUNDS.map(b => `<option value="${b}"${selectVal === b ? " selected" : ""}>${b}</option>`).join("")}
    <option value="__custom__"${isCustom ? " selected" : ""}>Custom…</option>
  </select><input type="text" class="lb-background-custom" name="background" data-lb-field="background" placeholder="Type background name…" value="${escHtml(isCustom ? value : "")}" style="${isCustom ? "" : "display:none;"}">`;
}

function readBackgroundFieldValue(container: Element): string {
  const select = container.querySelector<HTMLSelectElement>('select[data-lb-field="background"]');
  if (!select) return "";
  if (select.value === "__custom__") {
    return container.querySelector<HTMLInputElement>('input[data-lb-field="background"]')?.value.trim() ?? "";
  }
  return select.value;
}

function setupBackgroundSelectListeners(root: Element): void {
  root.querySelectorAll<HTMLSelectElement>(".lb-background-select").forEach(select => {
    select.addEventListener("change", () => {
      const customInput = root.querySelector<HTMLInputElement>('input[data-lb-field="background"]');
      if (!customInput) return;
      const isCustom = select.value === "__custom__";
      customInput.style.display = isCustom ? "" : "none";
      if (!isCustom) customInput.value = "";
    });
  });
}

// ---------------------------------------------------------------------------
// SRD D&D 5e trait tables for Roll Traits (SRD 5.1, CC BY 4.0)
// ---------------------------------------------------------------------------

type TraitTable = { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] };

const SRD_TRAIT_TABLES: Record<string, TraitTable> = {
  acolyte: {
    traits: [
      "I idolize a particular hero of my faith and constantly refer to that person's deeds and example.",
      "I can find common ground between the fiercest enemies, empathizing with them and always working toward peace.",
      "I see omens in every event and action. The gods try to speak to us, we just need to listen.",
      "Nothing can shake my optimistic attitude.",
      "I quote (or misquote) sacred texts and proverbs in almost every situation.",
      "I am tolerant of other faiths and respect the worship of other gods.",
      "I've enjoyed fine food, drink, and high society among my temple's elite. Rough living grates on me.",
      "I've spent so long in the temple that I have little practical experience dealing with people in the outside world.",
    ],
    ideals: [
      "Tradition: The ancient traditions of worship and sacrifice must be preserved and upheld.",
      "Charity: I always try to help those in need, no matter what the personal cost.",
      "Change: We must help bring about the changes the gods are constantly working in the world.",
      "Power: I hope to one day rise to the top of my faith's religious hierarchy.",
      "Faith: I trust that my deity will guide my actions; I have faith that if I work hard, things will go well.",
      "Aspiration: I seek to prove myself worthy of my god's favor by matching my actions against the divine teachings.",
    ],
    bonds: [
      "I would die to recover an ancient relic of my faith that was lost long ago.",
      "I will someday get revenge on the corrupt temple hierarchy who branded me a heretic.",
      "I owe my life to the priest who took me in when my parents died.",
      "Everything I do is for the common people.",
      "I will do anything to protect the temple where I served.",
      "I seek to preserve a sacred text that my enemies consider heretical and seek to destroy.",
    ],
    flaws: [
      "I judge others harshly, and myself even more severely.",
      "I put too much trust in those in power of my organization.",
      "My piety sometimes leads me to blindly trust those that profess faith in my god.",
      "I am inflexible in my thinking.",
      "I am suspicious of strangers and expect the worst of them.",
      "Once I pick a goal, I become obsessed with it to the detriment of everything else in my life.",
    ],
  },
  charlatan: {
    traits: [
      "I fall in and out of love easily, and am always pursuing someone.",
      "I have a joke for every occasion, especially occasions where humor is inappropriate.",
      "Flattery is my preferred trick for getting what I want.",
      "I'm a born gambler who can't resist the risk of a good bet.",
      "I lie about almost everything, even when there's no good reason to.",
      "Sarcasm and insults are my weapons of choice.",
      "I keep multiple holy symbols on me and invoke whatever deity seems most appropriate for my needs.",
      "I pocket anything I see that might have some value.",
    ],
    ideals: [
      "Independence: I am a free spirit—no one tells me what to do.",
      "Fairness: I never target people who can't afford to lose a little coin.",
      "Charity: I distribute the money I acquire to the people who really need it.",
      "Creativity: I never run the same con twice.",
      "Friendship: Material goods come and go. Bonds of friendship last a lifetime.",
      "Aspiration: I'm determined to make something of myself.",
    ],
    bonds: [
      "I fleeced the wrong person and must work to avoid their vengeful wrath.",
      "I owe everything to my mentor—a horrible person who's probably rotting in jail somewhere.",
      "Somewhere out there, I have a child who doesn't know me. I'm making the world better for them.",
      "I come from a noble family, and one day I'll reclaim my lands and title from those who stole them.",
      "A powerful person killed someone I love. Some day soon, I'll have my revenge.",
      "I swindled and ruined a person who didn't deserve it. I seek to atone for my misdeeds.",
    ],
    flaws: [
      "I can't resist a pretty face.",
      "I'm always in debt. I spend my ill-gotten gains on decadent luxuries faster than I bring them in.",
      "I'm convinced that no one could ever fool me the way I fool others.",
      "I'm too greedy for my own good. I can't resist taking a cut of any treasure I handle.",
      "I can't resist swindling people who are smarter than me.",
      "I'll run and preserve my own hide if the going gets tough.",
    ],
  },
  criminal: {
    traits: [
      "I always have a plan for when things go wrong.",
      "I am always calm, no matter what the situation. I never raise my voice or let my emotions control me.",
      "The first thing I do in a new place is note the locations of everything valuable—or where such things could be hidden.",
      "I would rather make a new friend than a new enemy.",
      "I am incredibly slow to trust. Those who seem the fairest often have the most to hide.",
      "I don't pay attention to the risks in a situation. Never tell me the odds.",
      "The best way to get me to do something is to tell me I can't do it.",
      "I blow up at the slightest insult.",
    ],
    ideals: [
      "Honor: I don't steal from others in the trade.",
      "Freedom: Chains are meant to be broken, as are those who would forge them.",
      "Charity: I steal from the wealthy so that I can help people in need.",
      "Greed: I will do whatever it takes to become wealthy.",
      "People: I'm loyal to my friends, not to any ideals, and everyone else can take a trip down the Styx for all I care.",
      "Redemption: There's a spark of good in everyone.",
    ],
    bonds: [
      "I'm trying to pay off an old debt I owe to a generous benefactor.",
      "My ill-gotten gains go to support my family.",
      "Something important was taken from me, and I aim to steal it back.",
      "I will become the greatest thief that ever lived.",
      "I'm guilty of a terrible crime. I hope I can redeem myself for it.",
      "Someone I loved died because of a mistake I made. That will never happen again.",
    ],
    flaws: [
      "When I see something valuable, I can't think about anything but how to steal it.",
      "When faced with a choice between money and my friends, I usually choose the money.",
      "If there's a plan, I'll forget it. If I don't forget it, I'll ignore it.",
      "I have a 'tell' that reveals when I'm lying.",
      "I turn tail and run when things look bad.",
      "An innocent person is in prison for a crime that I committed. I'm okay with that.",
    ],
  },
  entertainer: {
    traits: [
      "I know a story relevant to almost every situation.",
      "Whenever I come to a new place, I collect local rumors and spread gossip.",
      "I'm a hopeless romantic, always searching for that 'special someone.'",
      "Nobody stays angry at me or around me for long, since I can defuse any amount of tension.",
      "I love a good insult, even one directed at me.",
      "I get bitter if I'm not the center of attention.",
      "I'll settle for nothing less than perfection.",
      "I change my mood or my mind as quickly as I change key in a song.",
    ],
    ideals: [
      "Beauty: When I perform, I make the world better than it was.",
      "Tradition: The stories, legends, and songs of the past must never be forgotten.",
      "Creativity: The world is in need of new ideas and bold action.",
      "Greed: I'm only in it for the money and fame.",
      "People: I like seeing the smiles on people's faces when I perform. That's all that matters.",
      "Honesty: Art should reflect the soul; it should come from within and reveal who we really are.",
    ],
    bonds: [
      "My instrument is my most treasured possession, and it reminds me of someone I love.",
      "Someone stole my precious instrument, and someday I'll get it back.",
      "I want to be famous, whatever it takes.",
      "I idolize a hero of the old tales and measure my deeds against that person's.",
      "I will do anything to prove myself superior to my hated rival.",
      "I would do anything for the other members of my old troupe.",
    ],
    flaws: [
      "I'll do anything to win fame and renown.",
      "I'm a sucker for a pretty face.",
      "A scandal prevents me from ever going home again. That kind of trouble seems to follow me around.",
      "I once satirized a noble who still wants my head. It was a mistake that I will likely repeat.",
      "I have trouble keeping my true feelings hidden. My sharp tongue lands me in trouble.",
      "Despite my best efforts, I am unreliable to my friends.",
    ],
  },
  "folk hero": {
    traits: [
      "I judge people by their actions, not their words.",
      "If someone is in trouble, I'm always ready to lend help.",
      "When I set my mind to something, I follow through no matter what gets in my way.",
      "I have a strong sense of fair play and always try to find the most equitable solution to arguments.",
      "I'm confident in my own abilities and do what I can to instill confidence in others.",
      "Thinking is for other people. I prefer action.",
      "I misuse long words in an attempt to sound smarter.",
      "I get bored easily. When am I going to get on with my destiny?",
    ],
    ideals: [
      "Respect: People deserve to be treated with dignity and respect.",
      "Fairness: No one should get preferential treatment before the law, and no one is above the law.",
      "Freedom: Tyrants must not be allowed to oppress the people.",
      "Might: If I become strong, I can take what I want—what I deserve.",
      "Sincerity: There's no good in pretending to be something I'm not.",
      "Destiny: Nothing and no one can steer me away from my higher calling.",
    ],
    bonds: [
      "I have a family, but I have no idea where they are. One day, I hope to see them again.",
      "I worked the land, I love the land, and I will protect the land.",
      "A proud noble once gave me a horrible beating, and I will take my revenge on any bully I encounter.",
      "My tools are symbols of my past life, and I carry them so that I will never forget my roots.",
      "I protect those who cannot protect themselves.",
      "I wish my childhood sweetheart had come with me to pursue my destiny.",
    ],
    flaws: [
      "The tyrant who rules my land will stop at nothing to see me killed.",
      "I'm convinced of the significance of my destiny, and blind to my shortcomings and the risk of failure.",
      "The people who knew me when I was young know my shameful secret, so I can never go home again.",
      "I have a weakness for the vices of the city, especially hard drink.",
      "Secretly, I believe that things would be better if I were a tyrant lording over the land.",
      "I have trouble trusting in my allies.",
    ],
  },
  "guild artisan": {
    traits: [
      "I believe that anything worth doing is worth doing right. I can't help it—I'm a perfectionist.",
      "I'm a snob who looks down on those who can't appreciate fine craftsmanship.",
      "I always want to know how things work and what makes people tick.",
      "I'm full of witty aphorisms and have a proverb for every occasion.",
      "I'm rude to people who slack off, especially those who claim to follow a craft.",
      "I like to talk at length about my profession.",
      "I don't part with my money easily and will haggle tirelessly to get the best deal possible.",
      "I'm well known for my work, and I want to make sure everyone appreciates it.",
    ],
    ideals: [
      "Community: It is the duty of all civilized people to strengthen the bonds of community and the security of civilization.",
      "Generosity: My talents were given to me so that I could use them to benefit the world.",
      "Freedom: Everyone should be free to pursue his or her own livelihood.",
      "Greed: I'm only in it for the money.",
      "People: I'm committed to the people I care about, not to ideals.",
      "Aspiration: I work hard to be the best there is at my craft.",
    ],
    bonds: [
      "The workshop where I learned my trade is the most important place in the world to me.",
      "I created a great work for someone, and then found them unworthy to receive it. I'm still looking for someone worthy.",
      "I owe my guild a great debt for forging me into the person I am today.",
      "I pursue wealth to secure someone's love.",
      "One day I will return to my guild and prove that I am the greatest artisan of them all.",
      "I will get revenge on the evil forces that destroyed my place of business and ruined my livelihood.",
    ],
    flaws: [
      "I'll do anything to get my hands on something rare or priceless.",
      "I'm quick to assume that someone is trying to cheat me.",
      "No one must ever learn that I once stole money from guild coffers.",
      "I'm never satisfied with what I have—I always want more.",
      "I would kill to acquire a particularly beautiful or rare item.",
      "I'm horribly jealous of anyone who can outshine my handiwork. Everywhere I go, I'm surrounded by rivals.",
    ],
  },
  hermit: {
    traits: [
      "I've been isolated for so long that I rarely speak, preferring gestures and the occasional grunt.",
      "I am utterly serene, even in the face of disaster.",
      "The leader of my community had something wise to say on every topic, and I am eager to share that wisdom.",
      "I feel tremendous empathy for all who suffer.",
      "I'm oblivious to etiquette and social expectations.",
      "I connect everything that happens to me to a grand, cosmic plan.",
      "I often get lost in my own thoughts and contemplation, becoming oblivious to my surroundings.",
      "I am working on a grand philosophical theory and love sharing my ideas.",
    ],
    ideals: [
      "Greater Good: My gifts are meant to be shared with all, not used for my own benefit.",
      "Logic: Emotions must not cloud our sense of what is right and true.",
      "Free Thinking: Inquiry and curiosity are the pillars of progress.",
      "Power: Solitude and contemplation are paths toward mystical or magical power.",
      "Live and Let Live: Meddling in the affairs of others only causes trouble.",
      "Self-Knowledge: If you know yourself, there's nothing left to know.",
    ],
    bonds: [
      "Nothing is more important than the other members of my hermitage, order, or association.",
      "I entered seclusion to hide from the ones who might still be hunting me. I must someday confront them.",
      "I'm still seeking the enlightenment I pursued in my seclusion, and it still eludes me.",
      "I entered seclusion because I loved someone I could never have.",
      "Should my discovery come to light, it could bring ruin to the world.",
      "My isolation gave me great insight into a great evil that only I can destroy.",
    ],
    flaws: [
      "Now that I've returned to the world, I enjoy its delights a little too much.",
      "I harbor dark, bloodthirsty thoughts that my gentle exterior hides.",
      "I am dogmatic in my thinking, unable to accept other points of view.",
      "I let my need for isolation lead me to flee when I should stand and fight.",
      "I have little patience for those who don't share my devotion.",
      "I'm oblivious to the politics and machinations of those around me.",
    ],
  },
  noble: {
    traits: [
      "My eloquent flattery makes everyone I talk to feel like the most wonderful and important person in the world.",
      "The common folk love me for my kindness and generosity.",
      "No one could doubt by looking at my regal bearing that I am a cut above the unwashed masses.",
      "I take great pains to always look my best and follow the latest fashions.",
      "I don't like to get my hands dirty, and I won't be caught dead in unsuitable accommodations.",
      "Despite my noble birth, I do not place myself above other folk. We all have the same blood.",
      "My favor, once lost, is lost forever.",
      "If you do me an injury, I will crush you, ruin your name, and salt your fields.",
    ],
    ideals: [
      "Respect: Respect is due to me because of my position, but all people regardless of station deserve to be treated with dignity.",
      "Responsibility: It is my duty to respect the authority of those above me, just as those below me must respect mine.",
      "Independence: I must prove that I can handle myself without the coddling of my family.",
      "Power: If I can attain more power, no one will tell me what to do.",
      "Family: Blood runs thicker than water.",
      "Noble Obligation: It is my duty to protect and care for the people beneath me.",
    ],
    bonds: [
      "I will face any challenge to win the approval of my family.",
      "My house's alliance with another noble family must be sustained at all costs.",
      "Nothing is more important than the other members of my family.",
      "I am in love with the heir of a family that my family despises.",
      "My loyalty to my sovereign is unwavering.",
      "The common folk must see me as a hero of the people.",
    ],
    flaws: [
      "I secretly believe that everyone is beneath me.",
      "I hide a truly scandalous secret that could ruin my family forever.",
      "I too often hear veiled insults and threats in every word addressed to me, and I'm quick to anger.",
      "I have an insatiable desire for carnal pleasures.",
      "In fact, the world does revolve around me.",
      "By my words and actions, I often bring shame to my family.",
    ],
  },
  outlander: {
    traits: [
      "I'm driven by a wanderlust that led me away from home.",
      "I watch over my friends as if they were a litter of newborn pups.",
      "I once ran twenty-five miles without stopping to warn my clan of an approaching threat. I'd do it again.",
      "I have a lesson for every situation, drawn from observing nature.",
      "I place no stock in wealthy or well-mannered folk. Money and manners won't save you from a hungry owlbear.",
      "I'm always picking things up, absently fiddling with them, and sometimes accidentally breaking them.",
      "I feel far more comfortable around animals than people.",
      "I was, in fact, raised by wolves.",
    ],
    ideals: [
      "Change: Life is like the seasons, in constant change, and we must change with it.",
      "Greater Good: It is each person's responsibility to make the most happiness for the whole tribe.",
      "Honor: If I dishonor myself, I dishonor my whole clan.",
      "Might: The strongest are meant to rule.",
      "Nature: The natural world is more important than all the constructs of civilization.",
      "Glory: I must earn glory in battle, for myself and my clan.",
    ],
    bonds: [
      "My family, clan, or tribe is the most important thing in my life, even when they are far from me.",
      "An injury to the unspoiled wilderness of my home is an injury to me.",
      "I will bring terrible wrath down on the evildoers who destroyed my homeland.",
      "I am the last of my tribe, and it is up to me to ensure their names enter legend.",
      "I suffer awful visions of a coming disaster and will do anything to prevent it.",
      "It is my duty to provide children of my tribe with strong, capable parents.",
    ],
    flaws: [
      "I am too enamored of ale, wine, and other intoxicants.",
      "There's no room for caution in a life lived to the fullest.",
      "I remember every insult I've received and nurse a silent resentment toward anyone who's ever wronged me.",
      "I am slow to trust members of other races, tribes, and societies.",
      "Violence is my answer to almost any challenge.",
      "Don't expect me to save those who can't save themselves. It is nature's way that the strong thrive and the weak perish.",
    ],
  },
  sage: {
    traits: [
      "I use polysyllabic words that convey the impression of great erudition.",
      "I've read every book in the world's greatest libraries—or I like to boast that I have.",
      "I'm used to helping out those who aren't as smart as I am, and I patiently explain anything and everything to others.",
      "There's nothing I like more than a good mystery.",
      "I'm willing to listen to every side of an argument before I make my own judgment.",
      "I speak slowly when talking to those I consider less learned, which is almost everyone.",
      "I am horribly, horribly awkward in social situations.",
      "I'm convinced that people are always trying to steal my secrets.",
    ],
    ideals: [
      "Knowledge: The path to power and self-improvement is through knowledge.",
      "Beauty: What is beautiful points us beyond itself toward what is true.",
      "Logic: Emotions must not cloud our logical thinking.",
      "No Limits: Nothing should fetter the infinite possibility inherent in all existence.",
      "Power: Knowledge is the path to power and domination.",
      "Self-Improvement: The goal of a life of study is the betterment of oneself.",
    ],
    bonds: [
      "It is my duty to protect my students.",
      "I have an ancient text that holds terrible secrets that must not fall into the wrong hands.",
      "I work to preserve a library, university, scriptorium, or monastery.",
      "My life's work is a series of tomes related to a specific field of lore.",
      "I've been searching my whole life for the answer to a certain question.",
      "I sold my soul for knowledge. I hope to do great deeds and win it back.",
    ],
    flaws: [
      "I am easily distracted by the promise of information.",
      "Most people scream and run when they see a demon. I stop and take notes on its anatomy.",
      "Unlocking an ancient mystery is worth the price of a civilization.",
      "I overlook obvious solutions in favor of complicated ones.",
      "I speak without really thinking through my words, invariably insulting others.",
      "I can't keep a secret to save my life, or anyone else's.",
    ],
  },
  sailor: {
    traits: [
      "My friends know they can rely on me, no matter what.",
      "I work hard so that I can play hard when the work is done.",
      "I enjoy sailing into new ports and making new friends over a flagon of ale.",
      "I stretch the truth for the sake of a good story.",
      "To me, a tavern brawl is a nice way to get to know a new city.",
      "I never pass up a friendly wager.",
      "My language is as foul as an otyugh nest.",
      "I like a job well done, especially if I can convince someone else to do it.",
    ],
    ideals: [
      "Respect: The thing that keeps a ship together is mutual respect between captain and crew.",
      "Fairness: We all do the work, so we all share in the rewards.",
      "Freedom: The sea is freedom—the freedom to go anywhere and do anything.",
      "Mastery: I'm a predator, and the other ships on the sea are my prey.",
      "People: I'm committed to my crewmates, not to ideals.",
      "Aspiration: Someday I'll own my own ship and chart my own destiny.",
    ],
    bonds: [
      "I'm loyal to my captain first, everything else second.",
      "The ship is most important—crewmates and captains come and go.",
      "I'll always remember my first ship.",
      "In a harbor town, I have a paramour whose eyes nearly stole me from the sea.",
      "I was cheated out of my fair share of the profits, and I want to get my due.",
      "Ruthless pirates murdered my captain and crewmates, plundered our ship, and left me to die. Vengeance will be mine.",
    ],
    flaws: [
      "I follow orders, even if I think they're wrong.",
      "I'll say anything to avoid having to do extra work.",
      "Once someone questions my courage, I never back down no matter how dangerous the situation.",
      "Once I start drinking, it's hard for me to stop.",
      "I can't help but pocket loose coins and other trinkets I come across.",
      "My pride will probably lead to my destruction.",
    ],
  },
  soldier: {
    traits: [
      "I'm always polite and respectful.",
      "I'm haunted by memories of war. I fight to forget.",
      "I've lost too many friends, and I'm slow to make new ones.",
      "I'm full of inspiring and cautionary tales from my military experience relevant to almost every combat situation.",
      "I can stare down a hell hound without flinching.",
      "I enjoy being strong and like breaking things.",
      "I have a crude sense of humor.",
      "I face problems head-on. A simple, direct solution is the best path to success.",
    ],
    ideals: [
      "Greater Good: Our lot is to lay down our lives in defense of others.",
      "Responsibility: I do what I must and obey just authority.",
      "Independence: When people follow orders blindly, they embrace a kind of tyranny.",
      "Might: In life as in war, the stronger force wins.",
      "Live and Let Live: Ideals aren't worth killing over or going to war for.",
      "Nation: My city, nation, or people are all that matter.",
    ],
    bonds: [
      "I would still lay down my life for the people I served with.",
      "Someone saved my life on the battlefield. To this day, I will never leave a friend behind.",
      "My honor is my life.",
      "I'll never forget the crushing defeat my company suffered or the enemies who dealt it.",
      "Those who fight beside me are those worth dying for.",
      "I fight for those who cannot fight for themselves.",
    ],
    flaws: [
      "The monstrous enemy we faced in battle still leaves me quivering with fear.",
      "I have little respect for anyone who is not a proven warrior.",
      "I made a terrible mistake in battle that cost many lives—and I would do anything to keep that mistake quiet.",
      "My hatred of my enemies is blinding and unreasoning.",
      "I obey the law, even if the law causes misery.",
      "I'd rather eat my armor than admit when I'm wrong.",
    ],
  },
  urchin: {
    traits: [
      "I hide scraps of food and trinkets away in my pockets.",
      "I ask a lot of questions.",
      "I like to squeeze into small places where no one else can get to me.",
      "I sleep with my back to a wall or tree, with everything I own wrapped in a bundle in my arms.",
      "I eat like a pig and have bad manners.",
      "I think anyone who's nice to me is hiding evil intent.",
      "I don't like to bathe.",
      "I bluntly say what other people are hinting at or tiptoeing around.",
    ],
    ideals: [
      "Respect: All people, rich or poor, deserve respect.",
      "Community: We have to take care of each other, because no one else is going to do it.",
      "Change: The low are lifted up, and the high and mighty are brought down. Change is the nature of things.",
      "Retribution: The rich need to be shown what life and death are like in the gutters.",
      "People: I help the people who help me—that's what keeps us alive.",
      "Aspiration: I'm going to prove that I'm worthy of a better life.",
    ],
    bonds: [
      "My town or city is my home, and I'll fight to defend it.",
      "I sponsor an orphanage to keep others from enduring what I was forced to endure.",
      "I owe my survival to another urchin who taught me to live on the streets.",
      "I owe a debt I can never repay to the person who took pity on me.",
      "I escaped my life of poverty by robbing an important person, and I'm wanted for it.",
      "No one else should have to suffer the way I did.",
    ],
    flaws: [
      "If I'm outnumbered, I will run away from a fight.",
      "Gold seems like a lot of money to me, and I'll do just about anything for more of it.",
      "I will never fully trust anyone other than myself.",
      "I'd rather kill someone in their sleep than fight fair.",
      "It's not stealing if I need it more than someone else.",
      "People who can't take care of themselves get what they deserve.",
    ],
  },
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function rollTraits(background: string): { personality: string; ideal: string; bond: string; flaw: string } {
  const key = background.toLowerCase().trim();
  const tables = SRD_TRAIT_TABLES[key];
  if (tables) {
    return {
      personality: pickRandom(tables.traits),
      ideal: pickRandom(tables.ideals),
      bond: pickRandom(tables.bonds),
      flaw: pickRandom(tables.flaws),
    };
  }
  const allTraits  = Object.values(SRD_TRAIT_TABLES).flatMap(t => t.traits);
  const allIdeals  = Object.values(SRD_TRAIT_TABLES).flatMap(t => t.ideals);
  const allBonds   = Object.values(SRD_TRAIT_TABLES).flatMap(t => t.bonds);
  const allFlaws   = Object.values(SRD_TRAIT_TABLES).flatMap(t => t.flaws);
  return {
    personality: pickRandom(allTraits),
    ideal: pickRandom(allIdeals),
    bond: pickRandom(allBonds),
    flaw: pickRandom(allFlaws),
  };
}

// ---------------------------------------------------------------------------
// Shared profile I/O via actor flags
// ---------------------------------------------------------------------------

function getProfile(actor: FoundryActor): NpcProfileSections {
  return (actor.getFlag("lorebridge", "npcProfile") as NpcProfileSections | undefined) ?? {};
}

// Map of display names / aliases → dnd5e language key.
const LANGUAGE_KEY_MAP: Record<string, string> = {
  common: "common", "common sign language": "commonSign", "common sign": "commonSign",
  draconic: "draconic", dwarvish: "dwarvish", dwarven: "dwarvish",
  elvish: "elvish", elven: "elvish", giant: "giant", gnomish: "gnomish",
  goblin: "goblin", halfling: "halfling", orc: "orc", orcish: "orc",
  aarakocra: "aarakocra", abyssal: "abyssal", celestial: "celestial",
  "deep speech": "deep", druidic: "druidic", gith: "gith", gnoll: "gnoll",
  infernal: "infernal", primordial: "primordial",
  aquan: "aquan", auran: "auran", ignan: "ignan", terran: "terran",
  sylvan: "sylvan", "thieves' cant": "cant", "thieves cant": "cant", cant: "cant",
  undercommon: "undercommon", "all languages": "all", "all": "all",
};

function parseLanguages(raw: string): { known: string[]; custom: string } {
  const tokens = raw.split(/[,;]+/)
    .map(t => t.replace(/\band\b/gi, "").trim())
    .filter(Boolean);
  const known: string[] = [];
  const custom: string[] = [];
  for (const token of tokens) {
    const key = LANGUAGE_KEY_MAP[token.toLowerCase()];
    if (key) { if (!known.includes(key)) known.push(key); }
    else custom.push(token);
  }
  return { known, custom: custom.join("; ") };
}

// Write generated values back to native dnd5e actor fields so the stock
// sheet stays in sync without the GM needing to copy-paste.
async function syncToNativeFields(actor: FoundryActor, section: NpcSection, data: Record<string, string>): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (section === "overview") {
    if (data["alignment"]) updates["system.details.alignment"] = data["alignment"];
    if (data["background"] !== undefined) updates["system.details.background"] = data["background"];
    if (data["languages"]) {
      const { known, custom } = parseLanguages(data["languages"]);
      updates["system.traits.languages.value"] = known;
      updates["system.traits.languages.custom"] = custom;
    }
  }

  if (section === "personalityAndMotivation") {
    if (data["ideal"]) updates["system.details.ideal"] = data["ideal"];
    if (data["bond"])  updates["system.details.bond"]  = data["bond"];
    if (data["flaw"])  updates["system.details.flaw"]  = data["flaw"];
  }

  if (section === "gameplay") {
    // Map text disposition to the Foundry token disposition constant.
    if (data["disposition"]) {
      const d = data["disposition"].toLowerCase();
      // CONST.TOKEN_DISPOSITIONS: HOSTILE=-1, NEUTRAL=0, FRIENDLY=1, SECRET=-2
      const num = d.includes("friendly") ? 1 : d.includes("hostile") ? -1 : d.includes("secret") ? -2 : 0;
      updates["prototypeToken.disposition"] = num;
    }
  }

  if (section === "history") {
    if (data["publicHistory"]) {
      updates["system.details.biography.public"] = `<p>${data["publicHistory"]}</p>`;
    }
    const privParts: string[] = [];
    if (data["privateHistory"]) privParts.push(`<h3>History</h3><p>${data["privateHistory"]}</p>`);
    if (data["gmNotes"])        privParts.push(`<h3>GM Notes</h3><p>${data["gmNotes"]}</p>`);
    if (privParts.length > 0)  updates["system.details.biography.value"] = privParts.join("\n");
  }

  if (Object.keys(updates).length === 0) return;
  await (actor as unknown as { update(d: Record<string, unknown>): Promise<void> }).update(updates);
}

async function persistSection(actor: FoundryActor, section: NpcSection, data: Record<string, string>): Promise<void> {
  const profile = getProfile(actor);
  profile[section] = data;
  await actor.setFlag("lorebridge", "npcProfile", profile);
  await syncToNativeFields(actor, section, data);
  if (section === "appearance") {
    const overview = (profile.overview ?? {}) as Record<string, string>;
    const genderData = (profile.gender ?? {}) as Record<string, string>;
    const pres = genderData["genderPresentation"] ? `${genderData["genderPresentation"]} presentation` : "";
    const parts = [overview["race"], pres, data["height"], data["build"], data["hair"], data["eyes"], data["clothing"]]
      .filter(Boolean).join(", ");
    if (parts) await actor.setFlag("lorebridge", "portraitDescription", parts);
  }
}

function getBiography(actor: FoundryActor): string {
  const raw = (actor.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
  return raw.replace(/<[^>]+>/g, "").slice(0, 1000);
}

async function generateSection(actor: FoundryActor, section: NpcSection): Promise<void> {
  const profile = getProfile(actor);
  const result = await postBackend<{ section: NpcSection; data: NpcProfileSections; provider: string }>(
    "v1/generate/npc-profile-section",
    {
      section,
      actorName: actor.name ?? "",
      actorBiography: getBiography(actor),
      existingProfile: profile as Record<string, unknown>,
      tone: "neutral",
      worldName: game.world?.title ?? "",
    },
  );
  const sectionData = (result.data[section] ?? {}) as Record<string, string>;
  await persistSection(actor, section, sectionData);

  const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
  const summary = Object.entries(sectionData).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  void addHistoryEntry({
    type: "npc-profile",
    label: `NPC Profile — ${actor.name ?? ""} / ${meta.label}`,
    prompt: `Section: ${section}`,
    content: summary,
  });
}

// ---------------------------------------------------------------------------
// ===========================================================================
// INLINE SHEET PANEL — embedded directly in the NPC actor sheet
// ===========================================================================
// ---------------------------------------------------------------------------

const PANEL_ID = "lb-npc-profile-panel";

// Detect Foundry's active color scheme.
// Foundry v14 stores the UI color scheme in game.settings.get("core", "uiConfig")
// as { colorScheme: { applications: "dark" | "light" | "" } }.
// (Tip sourced from Tidy 5e Sheets — github.com/kgar/foundry-vtt-tidy-5e-sheets)
function detectDarkMode(): boolean {
  // 1. Foundry v14 uiConfig — the authoritative source.
  try {
    type UiConfig = { colorScheme?: { applications?: string } };
    const uiConfig = (game.settings as unknown as { get(m: string, k: string): UiConfig })
      .get("core", "uiConfig");
    const scheme = uiConfig?.colorScheme?.applications ?? "";
    if (scheme === "dark") return true;
    if (scheme === "light") return false;
    // "" means "browser default" — fall through
  } catch { /* uiConfig not available (older Foundry or not yet initialised) */ }

  // 2. Legacy Foundry setting key used in earlier v14 builds.
  try {
    const scheme = (game.settings as unknown as { get(m: string, k: string): string })
      .get("core", "colorScheme");
    if (scheme === "dark") return true;
    if (scheme === "light") return false;
  } catch { /* key not registered */ }

  // 3. System preference (used when "Browser Default" is selected).
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Apply theme colours as inline styles so they beat dnd5e's parchment CSS
// unconditionally — inline styles win over every stylesheet rule.
function applyPanelThemeStyles(panel: HTMLElement, dark: boolean): void {
  const bg1     = dark ? "#2a2a2a" : "#e8e3d8";
  const bg2     = dark ? "#252525" : "#f0ebe0";
  const bg1h    = dark ? "#333333" : "#ddd8c8";
  const bg2h    = dark ? "#303030" : "#e8e3d8";
  const border  = dark ? "#555555" : "#aaaaaa";
  const border2 = dark ? "#3a3a3a" : "#cccccc";
  const text    = dark ? "#c9c7b8" : "#191813";
  const muted   = dark ? "#999999" : "#555555";

  panel.style.setProperty("color", text);

  const hdr = panel.querySelector<HTMLElement>(".lb-panel__header");
  if (hdr) {
    hdr.style.setProperty("background", bg1);
    hdr.style.setProperty("border-color", border);
    hdr.onmouseenter = () => hdr.style.setProperty("background", bg1h);
    hdr.onmouseleave = () => hdr.style.setProperty("background", bg1);
  }

  panel.querySelectorAll<HTMLElement>(".lb-sec").forEach(el =>
    el.style.setProperty("border-bottom-color", border2));

  panel.querySelectorAll<HTMLElement>(".lb-sec__header").forEach(el => {
    el.style.setProperty("background", bg2);
    el.onmouseenter = () => el.style.setProperty("background", bg2h);
    el.onmouseleave = () => el.style.setProperty("background", bg2);
  });

  panel.querySelectorAll<HTMLElement>(".lb-sec__content").forEach(el =>
    el.style.setProperty("background", "transparent"));

  panel.querySelectorAll<HTMLElement>(".lb-sec__btn:not(.lb-sec__btn--primary)").forEach(el => {
    el.style.setProperty("background", bg1);
    el.style.setProperty("border-color", border);
    el.style.setProperty("color", text);
    el.onmouseenter = () => el.style.setProperty("background", bg1h);
    el.onmouseleave = () => el.style.setProperty("background", bg1);
  });

  panel.querySelectorAll<HTMLElement>(".lb-sec__value").forEach(el =>
    el.style.setProperty("color", text));
  panel.querySelectorAll<HTMLElement>(".lb-sec__label, .lb-sec__empty, .lb-sec__field-label").forEach(el =>
    el.style.setProperty("color", muted));
}

const PANEL_STYLES = `
<style id="lb-npc-profile-styles">
  /* Layout — theme-neutral */
  #lb-npc-profile-panel {
    margin-top: 8px;
    font-size: 0.82em;
  }
  .lb-panel__header {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; cursor: pointer; user-select: none;
    border-top: 2px solid; border-bottom: 1px solid;
  }
  .lb-panel__title { flex: 1; font-weight: bold; font-size: 0.9em; }
  .lb-panel__toggle { font-size: 0.75em; opacity: 0.6; }
  .lb-panel__gen-all, .lb-panel__gen-gendered {
    padding: 2px 8px; border: 1px solid #3a5e9e; border-radius: 3px;
    background: #4e7ac7; color: #fff; cursor: pointer; font-size: 0.78em; white-space: nowrap;
  }
  .lb-panel__gen-gendered { background: #5a7a4e; border-color: #3a5e30; }
  .lb-panel__gen-all:hover:not(:disabled) { background: #3a5e9e; }
  .lb-panel__gen-gendered:hover:not(:disabled) { background: #3a5e30; }
  .lb-panel__gen-all:disabled, .lb-panel__gen-gendered:disabled { opacity: 0.5; cursor: not-allowed; }
  .lb-panel__body { padding: 4px 0; }
  .lb-panel__body.hidden { display: none; }
  .lb-sec { border-bottom: 1px solid; }
  .lb-sec__header { display: flex; align-items: center; gap: 5px; padding: 4px 8px; cursor: pointer; }
  .lb-sec__status { width: 16px; text-align: center; flex-shrink: 0; }
  .lb-sec__icon { opacity: 0.6; flex-shrink: 0; }
  .lb-sec__name { flex: 1; font-weight: bold; }
  .lb-sec__actions { display: flex; gap: 3px; }
  .lb-sec__btn {
    padding: 1px 6px; border: 1px solid; border-radius: 3px;
    cursor: pointer; font-size: 0.76em; white-space: nowrap;
  }
  .lb-sec__btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .lb-sec__btn--primary { background: #4e7ac7 !important; color: #fff !important; border-color: #3a5e9e !important; }
  .lb-sec__btn--primary:hover:not(:disabled) { background: #3a5e9e !important; }
  .lb-sec__content { padding: 4px 8px 6px; display: none; }
  .lb-sec__content.open { display: block; }
  .lb-sec__empty { font-style: italic; padding: 2px 0; }
  .lb-sec__fields { display: grid; grid-template-columns: 130px 1fr; gap: 2px 8px; }
  .lb-sec__label { font-size: 0.9em; }
  .lb-sec__value { font-size: 0.9em; line-height: 1.4; }
  .lb-sec__edit-form { display: flex; flex-direction: column; gap: 3px; }
  .lb-sec__field-row { display: flex; flex-direction: column; gap: 1px; }
  .lb-sec__field-label { font-size: 0.8em; }
  .lb-sec__textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 36px; font-size: 0.85em; }
  .lb-sec__edit-actions { display: flex; gap: 4px; margin-top: 4px; }
  .lb-sec__spinner { display: inline-block; animation: lb-spin 1s linear infinite; }
  @keyframes lb-spin { to { transform: rotate(360deg); } }
  .lb-gender-select { width: 100%; font-size: 0.85em; margin-bottom: 2px; }
  .lb-gender-custom { width: 100%; box-sizing: border-box; font-size: 0.85em; margin-top: 2px; }
  .lb-background-select { width: 100%; font-size: 0.85em; margin-bottom: 2px; }
  .lb-background-custom { width: 100%; box-sizing: border-box; font-size: 0.85em; margin-top: 2px; }

  /* === DARK theme — !important beats dnd5e parchment overrides === */
  #lb-npc-profile-panel[data-lb-theme="dark"] {
    color: #c9c7b8 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-panel__header {
    background: #2a2a2a !important; border-color: #555 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-panel__header:hover { background: #333 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec { border-bottom-color: #3a3a3a !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__header { background: #252525 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__header:hover { background: #303030 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__btn {
    background: #2a2a2a !important; border-color: #555 !important; color: #c9c7b8 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__btn:hover:not(:disabled) { background: #333 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__content { background: transparent !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__empty,
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__label,
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__value,
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__field-label { color: #999 !important; }
  #lb-npc-profile-panel[data-lb-theme="dark"] .lb-sec__value { color: #c9c7b8 !important; }

  /* === LIGHT theme — !important beats any inherited dark overrides === */
  #lb-npc-profile-panel[data-lb-theme="light"] {
    color: #191813 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-panel__header {
    background: #e8e3d8 !important; border-color: #aaa !important;
  }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-panel__header:hover { background: #ddd8c8 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec { border-bottom-color: #ccc !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__header { background: #f0ebe0 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__header:hover { background: #e8e3d8 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__btn {
    background: #f0ebe0 !important; border-color: #aaa !important; color: #191813 !important;
  }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__btn:hover:not(:disabled) { background: #e0dac8 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__content { background: transparent !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__empty,
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__label,
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__field-label { color: #555 !important; }
  #lb-npc-profile-panel[data-lb-theme="light"] .lb-sec__value { color: #191813 !important; }

  /* Memories section */
  .lb-memory { display:flex; flex-direction:column; gap:2px; padding:5px 0; border-bottom:1px solid; }
  .lb-memory:last-child { border-bottom:none; }
  .lb-memory__meta { font-size:0.75em; opacity:0.6; display:flex; justify-content:space-between; align-items:center; }
  .lb-memory__text { font-size:0.82em; line-height:1.4; }
  .lb-memory__delete {
    padding:0 4px; border:1px solid; border-radius:2px; cursor:pointer;
    font-size:0.75em; background:transparent; opacity:0.5; flex-shrink:0;
  }
  .lb-memory__delete:hover { opacity:1; }
  .lb-memories-empty { font-style:italic; font-size:0.85em; padding:4px 0; opacity:0.7; }
  .lb-memories-list { max-height:200px; overflow-y:auto; }
</style>`;

function buildMemoriesPanelHtml(memories: NpcMemoryEntry[]): string {
  const count = memories.length;
  const clearBtn = count > 0
    ? `<button class="lb-sec__btn" data-lb-action="clear-memories" title="Clear all memories" style="color:#c44;border-color:#c44">Clear All</button>`
    : "";
  let listHtml: string;
  if (count === 0) {
    listHtml = `<p class="lb-memories-empty">No memories yet. Memories accumulate automatically from @NPC chat interactions.</p>`;
  } else {
    const entries = [...memories].reverse().map(m => {
      const date = new Date(m.timestamp).toLocaleDateString();
      return `
        <div class="lb-memory" data-memory-id="${escHtml(m.id)}">
          <div class="lb-memory__meta">
            <span>${escHtml(date)} · ${escHtml(m.playerName)}</span>
            <button class="lb-memory__delete lb-sec__btn" data-lb-action="delete-memory" data-memory-id="${escHtml(m.id)}" title="Delete this memory">✕</button>
          </div>
          <div class="lb-memory__text"><strong>Player:</strong> ${escHtml(m.playerMessage)}</div>
          <div class="lb-memory__text"><strong>NPC:</strong> ${escHtml(m.npcResponse)}</div>
        </div>`;
    }).join("");
    listHtml = `<div class="lb-memories-list">${entries}</div>`;
  }
  return `
    <div class="lb-sec" data-lb-section="memories">
      <div class="lb-sec__header" data-lb-action="toggle-section" data-lb-section="memories">
        <span class="lb-sec__status"><i class="fas fa-brain"></i></span>
        <i class="fas fa-brain lb-sec__icon"></i>
        <span class="lb-sec__name">Memories${count > 0 ? ` (${count})` : ""}</span>
        <span class="lb-sec__actions">${clearBtn}</span>
      </div>
      <div class="lb-sec__content" data-lb-content="memories">
        ${listHtml}
      </div>
    </div>`;
}

function buildSectionHtml(meta: SectionMeta, data: Record<string, string> | undefined): string {
  const status = sectionStatus(data, meta.fields);
  const icon = statusIcon(status);
  const hasData = sectionHasContent(data);

  const rollTraitsBtn = meta.id === "personalityAndMotivation"
    ? `<button class="lb-sec__btn" data-lb-action="roll-traits" title="Roll random 5e traits"><i class="fas fa-dice-d6"></i> Roll</button>`
    : "";

  const actionsHtml = hasData
    ? `${rollTraitsBtn}
       <button class="lb-sec__btn" data-lb-action="regen-section" data-lb-section="${meta.id}" title="Regenerate ${meta.label}">
         <i class="fas fa-sync-alt"></i>
       </button>
       <button class="lb-sec__btn" data-lb-action="edit-section" data-lb-section="${meta.id}" title="Edit">
         <i class="fas fa-edit"></i>
       </button>`
    : `${rollTraitsBtn}
       <button class="lb-sec__btn lb-sec__btn--primary" data-lb-action="gen-section" data-lb-section="${meta.id}">
         <i class="fas fa-magic"></i> Generate
       </button>
       <button class="lb-sec__btn" data-lb-action="edit-section" data-lb-section="${meta.id}" title="Set manually">
         <i class="fas fa-edit"></i>
       </button>`;

  // Fields synced to native sheet locations are hidden in the panel view to avoid
  // showing the same content twice. They remain visible in the Workspace window.
  const panelVisible = meta.fields.filter(f => !f.panelHidden);

  let contentHtml: string;
  if (!hasData) {
    contentHtml = `<p class="lb-sec__empty">Not yet generated. Click Generate or the edit icon to set manually.</p>`;
  } else if (panelVisible.length === 0) {
    contentHtml = `<p class="lb-sec__empty">Content synced to native sheet fields.</p>`;
  } else {
    const fieldRows = panelVisible
      .filter(f => (data?.[f.key] ?? "").trim())
      .map(f => `<span class="lb-sec__label">${f.label}</span><span class="lb-sec__value">${escHtml(data?.[f.key] ?? "")}</span>`)
      .join("");
    contentHtml = `<div class="lb-sec__fields">${fieldRows || `<p class="lb-sec__empty">—</p>`}</div>`;
  }

  return `
    <div class="lb-sec" data-lb-section="${meta.id}">
      <div class="lb-sec__header" data-lb-action="toggle-section" data-lb-section="${meta.id}">
        <span class="lb-sec__status">${icon}</span>
        <i class="${meta.icon} lb-sec__icon"></i>
        <span class="lb-sec__name">${meta.label}</span>
        <span class="lb-sec__actions">${actionsHtml}</span>
      </div>
      <div class="lb-sec__content" data-lb-content="${meta.id}">
        ${contentHtml}
      </div>
    </div>`;
}

function buildPanelHtml(actor: FoundryActor, collapsed: boolean): string {
  const profile = getProfile(actor);
  const memories = getMemories(actor);
  const sectionsHtml = SECTION_META.map(m => buildSectionHtml(m, profile[m.id])).join("") + buildMemoriesPanelHtml(memories);
  const theme = detectDarkMode() ? "dark" : "light";
  return `
    ${PANEL_STYLES}
    <div id="${PANEL_ID}" data-lb-actor="${actor.id}" data-lb-theme="${theme}">
      <div class="lb-panel__header" data-lb-action="toggle-panel">
        <span>🤖</span>
        <span class="lb-panel__title">LoreBridge NPC Profile</span>
        <button class="lb-panel__gen-all" data-lb-action="gen-all" title="Generate all sections including gender">
          <i class="fas fa-magic"></i> Generate Full
        </button>
        <button class="lb-panel__gen-gendered" data-lb-action="gen-all-hold-gender" title="Generate all sections except gender (keeps current gender settings)">
          <i class="fas fa-venus-mars"></i> Hold Gender
        </button>
        <span class="lb-panel__toggle">${collapsed ? "▶" : "▼"}</span>
      </div>
      <div class="lb-panel__body${collapsed ? " hidden" : ""}">
        ${sectionsHtml}
      </div>
    </div>`;
}

function findInsertTarget(frame: HTMLElement): HTMLElement | null {
  // Selectors for the dnd5e NPC biography tab in order of specificity.
  // dnd5e v4 (Foundry v14) uses ApplicationV2 PARTS: [data-application-part="biography"].
  // Older layouts used [data-tab="biography"].
  // No fallback to .window-content — if no biography tab, skip injection entirely.
  const candidates = [
    '[data-application-part="biography"]',
    '[data-tab="biography"]',
    '.tab.biography',
  ];
  for (const sel of candidates) {
    const el = frame.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

function injectProfilePanel(frame: HTMLElement, actor: FoundryActor): void {
  // Remove stale panel (re-renders replace it)
  frame.querySelector(`#${PANEL_ID}`)?.remove();
  frame.querySelector("#lb-npc-profile-styles")?.remove();

  const target = findInsertTarget(frame);
  if (!target) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = buildPanelHtml(actor, false);

  // Append at end of the target section
  target.appendChild(wrapper);

  const injected = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
  if (injected) applyPanelThemeStyles(injected, detectDarkMode());

  attachPanelListeners(frame, actor);
}

function refreshPanel(frame: HTMLElement, actor: FoundryActor): void {
  const panel = frame.querySelector(`#${PANEL_ID}`);
  if (!panel) return;

  const body = panel.querySelector(".lb-panel__body");
  const isCollapsed = body?.classList.contains("hidden") ?? false;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = buildPanelHtml(actor, isCollapsed);

  // Preserve open/collapsed state of individual sections
  const openSections = new Set<string>();
  panel.querySelectorAll(".lb-sec__content.open").forEach(el => {
    const section = (el as HTMLElement).dataset["lbContent"];
    if (section) openSections.add(section);
  });

  panel.replaceWith(...Array.from(wrapper.childNodes));

  // Restore open sections and re-apply inline theme styles
  const newPanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
  if (newPanel) {
    openSections.forEach(section => {
      const contentEl = newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      contentEl?.classList.add("open");
    });
    applyPanelThemeStyles(newPanel, detectDarkMode());
  }

  attachPanelListeners(frame, actor);
}

function setGeneratingState(panel: HTMLElement, section: NpcSection, busy: boolean): void {
  const secEl = panel.querySelector<HTMLElement>(`[data-lb-section="${section}"].lb-sec`);
  if (!secEl) return;
  const header = secEl.querySelector<HTMLElement>(".lb-sec__header");
  if (!header) return;
  const statusEl = header.querySelector<HTMLElement>(".lb-sec__status");
  if (statusEl) statusEl.innerHTML = busy ? '<i class="fas fa-spinner lb-sec__spinner"></i>' : "";
  secEl.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = busy; });
}

function buildPanelEditForm(meta: SectionMeta, sectionData: Record<string, string>, section: NpcSection): string {
  const fieldRows = meta.fields.map(f => {
    const val = sectionData[f.key] ?? "";
    let input: string;
    if (f.editType === "gender" || f.editType === "presentation") {
      input = buildGenderSelectHtml(f, val);
    } else if (f.editType === "background") {
      input = buildBackgroundSelectHtml(val);
    } else {
      input = `<textarea class="lb-sec__textarea" name="${f.key}" rows="2">${escHtml(val)}</textarea>`;
    }
    return `<div class="lb-sec__field-row"><label class="lb-sec__field-label">${f.label}</label>${input}</div>`;
  }).join("");
  return `
    <form class="lb-sec__edit-form">
      ${fieldRows}
      <div class="lb-sec__edit-actions">
        <button type="button" class="lb-sec__btn lb-sec__btn--primary" data-lb-action="save-section" data-lb-section="${section}">
          <i class="fas fa-save"></i> Save
        </button>
        <button type="button" class="lb-sec__btn" data-lb-action="cancel-edit" data-lb-section="${section}">
          Cancel
        </button>
      </div>
    </form>`;
}

function attachPanelListeners(frame: HTMLElement, actor: FoundryActor): void {
  const panel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
  if (!panel) return;

  panel.addEventListener("click", (e) => {
    const target = (e.target as Element).closest<HTMLElement>("[data-lb-action]");
    if (!target) return;

    // Stop clicks on buttons from also triggering parent handlers
    if (target.tagName === "BUTTON" || target.closest("button")) e.stopPropagation();

    const action = target.dataset["lbAction"];
    const section = target.dataset["lbSection"] as NpcSection | undefined;

    if (action === "toggle-panel") {
      // Don't let button clicks inside header toggle the panel
      if ((e.target as Element).closest("button")) return;
      const body = panel.querySelector(".lb-panel__body");
      const toggle = panel.querySelector(".lb-panel__toggle");
      if (body) {
        const nowHidden = !body.classList.contains("hidden");
        body.classList.toggle("hidden", nowHidden);
        if (toggle) toggle.textContent = nowHidden ? "▶" : "▼";
      }
      return;
    }

    if (action === "toggle-section" && section) {
      // Don't toggle when clicking action buttons inside the header
      if ((e.target as Element).closest(".lb-sec__actions")) return;
      const content = panel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      content?.classList.toggle("open");
      return;
    }

    if ((action === "gen-section" || action === "regen-section") && section) {
      e.stopPropagation();
      void (async () => {
        const genAllBtn = panel.querySelector<HTMLButtonElement>(".lb-panel__gen-all");
        if (genAllBtn) genAllBtn.disabled = true;
        setGeneratingState(panel, section, true);
        try {
          await generateSection(actor, section);
          refreshPanel(frame, actor);
          const meta = SECTION_META.find(s => s.id === section)?.label ?? section;
          ui.notifications.info(`LoreBridge: ${meta} generated for ${actor.name ?? "NPC"}.`);
          // Auto-expand the section after generation
          const newPanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
          if (newPanel) {
            const content = newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
            content?.classList.add("open");
          }
        } catch (err) {
          ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Generation failed."}`);
          setGeneratingState(panel, section, false);
          if (genAllBtn) genAllBtn.disabled = false;
        }
      })();
      return;
    }

    if (action === "gen-all" || action === "gen-all-hold-gender") {
      e.stopPropagation();
      const holdGender = action === "gen-all-hold-gender";
      void (async () => {
        // Disable both generate buttons for the duration
        panel.querySelectorAll<HTMLButtonElement>(".lb-panel__gen-all, .lb-panel__gen-gendered")
          .forEach(b => { b.disabled = true; });

        // Mark every target section as queued (⏳) upfront so the user sees
        // what's coming before the first section even starts.
        for (const meta of SECTION_META) {
          if (holdGender && meta.id === "gender") continue;
          const secEl = panel.querySelector<HTMLElement>(`[data-lb-section="${meta.id}"].lb-sec`);
          const statusEl = secEl?.querySelector<HTMLElement>(".lb-sec__status");
          if (statusEl) statusEl.textContent = "⏳";
          secEl?.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = true; });
        }

        let errCount = 0;
        for (const meta of SECTION_META) {
          if (holdGender && meta.id === "gender") continue;

          // Re-query panel each iteration — setGeneratingState needs a live reference.
          const livePanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
          if (!livePanel) break;
          setGeneratingState(livePanel, meta.id, true);

          try {
            await generateSection(actor, meta.id);
            // Mark done without a full refresh — just update the status icon.
            const p = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
            const statusEl = p?.querySelector<HTMLElement>(`[data-lb-section="${meta.id}"] .lb-sec__status`);
            if (statusEl) statusEl.innerHTML = "✅";
          } catch {
            errCount++;
            const p = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
            const statusEl = p?.querySelector<HTMLElement>(`[data-lb-section="${meta.id}"] .lb-sec__status`);
            if (statusEl) statusEl.innerHTML = "❌";
          }
        }

        const label = holdGender ? "Profile (gender preserved)" : "Full profile";
        if (errCount > 0) {
          ui.notifications.warn(`LoreBridge: ${label} generated with ${errCount} error(s).`);
        } else {
          ui.notifications.info(`LoreBridge: ${label} generated for ${actor.name ?? "NPC"}.`);
        }
        void addHistoryEntry({
          type: "npc-profile",
          label: `NPC ${label} — ${actor.name ?? ""}`,
          prompt: holdGender ? "Full profile generation (gender held)" : "Full profile generation",
          content: JSON.stringify(getProfile(actor), null, 2),
        });
        // Single full rebuild at the end to show all generated content.
        refreshPanel(frame, actor);
      })();
      return;
    }

    if (action === "edit-section" && section) {
      e.stopPropagation();
      const content = panel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      if (!content) return;
      const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
      const profile = getProfile(actor);
      const sectionData = (profile[section] ?? {}) as Record<string, string>;

      content.classList.add("open");
      content.innerHTML = buildPanelEditForm(meta, sectionData, section);
      setupGenderSelectListeners(content);
      setupBackgroundSelectListeners(content);
      return;
    }

    if (action === "roll-traits") {
      e.stopPropagation();
      const content = panel.querySelector<HTMLElement>('[data-lb-content="personalityAndMotivation"]');
      if (!content) return;
      const meta = SECTION_META.find(s => s.id === "personalityAndMotivation")!;
      const profile = getProfile(actor);
      const sectionData = { ...(profile.personalityAndMotivation ?? {}) } as Record<string, string>;
      const bg = ((profile.overview ?? {}) as Record<string, string>)["background"] ?? "";
      const rolled = rollTraits(bg);
      sectionData["personality"] = rolled.personality;
      sectionData["ideal"]       = rolled.ideal;
      sectionData["bond"]        = rolled.bond;
      sectionData["flaw"]        = rolled.flaw;
      content.classList.add("open");
      content.innerHTML = buildPanelEditForm(meta, sectionData, "personalityAndMotivation");
      setupGenderSelectListeners(content);
      return;
    }

    if (action === "save-section" && section) {
      e.stopPropagation();
      const content = panel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`);
      if (!content) return;
      const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
      const data: Record<string, string> = {};
      for (const f of meta.fields) {
        if (f.editType === "gender" || f.editType === "presentation") {
          data[f.key] = readGenderFieldValue(content, f.key);
        } else if (f.editType === "background") {
          data[f.key] = readBackgroundFieldValue(content);
        } else {
          const ta = content.querySelector<HTMLTextAreaElement>(`textarea[name="${f.key}"]`);
          data[f.key] = ta?.value.trim() ?? "";
        }
      }
      void persistSection(actor, section, data).then(() => {
        refreshPanel(frame, actor);
        const newPanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
        if (newPanel) {
          newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`)?.classList.add("open");
        }
        ui.notifications.info(`LoreBridge: ${meta.label} saved.`);
      });
      return;
    }

    if (action === "cancel-edit" && section) {
      e.stopPropagation();
      refreshPanel(frame, actor);
      const newPanel = frame.querySelector<HTMLElement>(`#${PANEL_ID}`);
      if (newPanel) {
        newPanel.querySelector<HTMLElement>(`[data-lb-content="${section}"]`)?.classList.add("open");
      }
      return;
    }

    if (action === "delete-memory") {
      e.stopPropagation();
      const memoryId = target.dataset["memoryId"] ?? "";
      if (!memoryId) return;
      void deleteMemory(actor, memoryId).then(() => {
        const wasOpen = panel.querySelector(`[data-lb-content="memories"]`)?.classList.contains("open") ?? false;
        refreshPanel(frame, actor);
        if (wasOpen) {
          frame.querySelector<HTMLElement>(`#${PANEL_ID} [data-lb-content="memories"]`)?.classList.add("open");
        }
      });
      return;
    }

    if (action === "clear-memories") {
      e.stopPropagation();
      void clearMemories(actor).then(() => {
        const wasOpen = panel.querySelector(`[data-lb-content="memories"]`)?.classList.contains("open") ?? false;
        refreshPanel(frame, actor);
        if (wasOpen) {
          frame.querySelector<HTMLElement>(`#${PANEL_ID} [data-lb-content="memories"]`)?.classList.add("open");
        }
        ui.notifications.info(`LoreBridge: Memories cleared for ${actor.name}.`);
      });
      return;
    }
  });
}

// ---------------------------------------------------------------------------
// ===========================================================================
// WORKSPACE WINDOW — full editing window (opened from three-dots menu)
// ===========================================================================
// ---------------------------------------------------------------------------

function _buildNpcWorkspaceClass(windowTitle: string) {
  return class extends _AppBase {
    static override DEFAULT_OPTIONS = {
      id: "lorebridge-npc-workspace",
      classes: ["lorebridge-npc-workspace"],
      window: { title: windowTitle, resizable: true },
      position: { width: 720, height: 560 },
    };

    actorId: string = "";
    private _selectedSection: NpcSection | "memories" = "overview";
    private _editMode = false;
    private _generatingSection: NpcSection | null = null;
    private _generatingFull = false;
    private _pendingTraits: Record<string, string> | null = null;

    private _getActor(): FoundryActor | undefined {
      return game.actors.get(this.actorId) as FoundryActor | undefined;
    }

    override async _renderHTML(_context: Record<string, unknown>, _options: unknown): Promise<HTMLElement> {
      const actor = this._getActor();
      if (!actor) {
        const el = document.createElement("div");
        el.style.padding = "1rem";
        el.textContent = "Actor not found.";
        return el;
      }
      const profile = getProfile(actor);
      const memories = getMemories(actor);
      const selectedView = this._selectedSection;
      const isMemoriesView = selectedView === "memories";
      const section = isMemoriesView ? "overview" as NpcSection : selectedView as NpcSection;
      const meta = SECTION_META.find(s => s.id === section) ?? SECTION_META[0]!;
      const sectionData = isMemoriesView ? {} : (profile[section] ?? {});
      const isGenerating = !isMemoriesView && (this._generatingSection === section || this._generatingFull);
      const hasContent = !isMemoriesView && sectionHasContent(sectionData);
      const isGeneratingAny = this._generatingSection !== null || this._generatingFull;

      const navItems = SECTION_META.map(s => {
        const d = profile[s.id];
        const st = sectionStatus(d, s.fields);
        const isActive = !isMemoriesView && s.id === section;
        const isGen = this._generatingSection === s.id || this._generatingFull;
        return `
          <li class="lb-ws-nav__item${isActive ? " active" : ""}" data-action="selectSection" data-section="${s.id}">
            <span class="lb-ws-nav__status">${isGen ? '<i class="fas fa-spinner" style="animation:lb-ws-spin 1s linear infinite"></i>' : statusIcon(st)}</span>
            <span class="lb-ws-nav__label"><i class="${s.icon}"></i> ${s.shortLabel}</span>
          </li>`;
      }).join("") + `
        <li class="lb-ws-nav__item${isMemoriesView ? " active" : ""}" data-action="selectSection" data-section="memories">
          <span class="lb-ws-nav__status"><i class="fas fa-brain" style="font-size:0.85em"></i></span>
          <span class="lb-ws-nav__label"><i class="fas fa-brain"></i> Memories${memories.length > 0 ? ` (${memories.length})` : ""}</span>
        </li>`;

      let sectionContent: string;
      if (isMemoriesView) {
        sectionContent = this._buildMemoriesContent(actor, memories);
      } else if (isGenerating) {
        sectionContent = `<div class="lb-ws-generating"><i class="fas fa-spinner" style="animation:lb-ws-spin 1s linear infinite"></i> Generating ${meta.label}…</div>`;
      } else if (this._editMode) {
        const baseData = sectionData as Record<string, string>;
        const mergedData = this._pendingTraits
          ? { ...baseData, ...this._pendingTraits }
          : baseData;
        this._pendingTraits = null;
        const fieldRows = meta.fields.map(f => {
          const val = mergedData[f.key] ?? "";
          let input: string;
          if (f.editType === "gender" || f.editType === "presentation") {
            input = buildGenderSelectHtml(f, val);
          } else if (f.editType === "background") {
            input = buildBackgroundSelectHtml(val);
          } else {
            input = `<textarea class="lb-ws-field__textarea" name="${f.key}" rows="2">${escHtml(val)}</textarea>`;
          }
          return `<div class="lb-ws-field--edit"><label class="lb-ws-field__label">${f.label}</label>${input}</div>`;
        }).join("");
        sectionContent = `
          <form class="lb-ws-edit-form">
            ${fieldRows}
            <div class="lb-ws-edit-actions">
              <button type="button" class="lb-ws-btn lb-ws-btn--primary" data-action="saveSection"><i class="fas fa-save"></i> Save</button>
              <button type="button" class="lb-ws-btn" data-action="cancelEdit"><i class="fas fa-times"></i> Cancel</button>
            </div>
          </form>`;
      } else if (!hasContent) {
        sectionContent = `
          <div class="lb-ws-empty">
            <p class="lb-ws-empty__msg">No content yet for <strong>${meta.label}</strong>.</p>
            <button type="button" class="lb-ws-btn lb-ws-btn--primary" data-action="generateSection" data-section="${section}">
              <i class="fas fa-magic"></i> Generate ${meta.label}
            </button>
            <button type="button" class="lb-ws-btn" data-action="editSection">
              <i class="fas fa-edit"></i> Set Manually
            </button>
          </div>`;
      } else {
        const data = sectionData as Record<string, string>;
        const fieldRows = meta.fields
          .filter(f => (data[f.key] ?? "").trim())
          .map(f => `<div class="lb-ws-field__label">${f.label}</div><div class="lb-ws-field__value">${escHtml(data[f.key] ?? "")}</div>`)
          .join("");
        sectionContent = `<div class="lb-ws-fields">${fieldRows || "<p style='color:var(--color-text-light-tertiary)'>—</p>"}</div>`;
      }

      const rollTraitsBtnWs = !isMemoriesView && section === "personalityAndMotivation" && !isGeneratingAny
        ? `<button type="button" class="lb-ws-btn" data-action="rollTraits" title="Roll random 5e traits"><i class="fas fa-dice-d6"></i> Roll Traits</button>`
        : "";

      const sectionBar = (!isMemoriesView && !isGenerating && !this._editMode) ? `
        <div class="lb-ws-section-actions">
          ${rollTraitsBtnWs}
          ${hasContent
            ? `<button type="button" class="lb-ws-btn" data-action="regenerateSection" data-section="${section}" ${isGeneratingAny ? "disabled" : ""}>
                 <i class="fas fa-sync-alt"></i> Regenerate
               </button>
               <button type="button" class="lb-ws-btn" data-action="editSection"><i class="fas fa-edit"></i> Edit</button>
               <button type="button" class="lb-ws-btn" data-action="copySection"><i class="fas fa-copy"></i> Copy</button>`
            : ""
          }
        </div>` : "";

      const portrait = actor.img ? `<img class="lb-ws-portrait" src="${actor.img}" alt="">` : "";

      const container = document.createElement("div");
      container.innerHTML = `
        <style>
          @keyframes lb-ws-spin { to { transform: rotate(360deg); } }
          .lorebridge-npc-workspace .window-content {
            display:flex; flex-direction:column; overflow:hidden; padding:0; height:100%;
          }
          .lb-ws { display:flex; flex:1; min-height:0; overflow:hidden; }
          .lb-ws-sidebar {
            width:160px; min-width:120px; flex-shrink:0; display:flex; flex-direction:column;
            border-right:1px solid var(--color-border-dark, #444);
            background:var(--color-bg-option, #252525);
          }
          .lb-ws-portrait { width:100%; max-height:100px; object-fit:cover; display:block; }
          .lb-ws-full-gen, .lb-ws-full-gen-gendered {
            display:block; width:calc(100% - 10px); margin:5px 5px 0; padding:4px;
            background:#4e7ac7; color:#fff; border:none; border-radius:3px;
            cursor:pointer; font-size:0.76em; text-align:center;
          }
          .lb-ws-full-gen-gendered { background:#5a7a4e; margin-top:3px; }
          .lb-ws-full-gen:hover:not(:disabled) { background:#3a5e9e; }
          .lb-ws-full-gen-gendered:hover:not(:disabled) { background:#3a5e30; }
          .lb-ws-full-gen:disabled, .lb-ws-full-gen-gendered:disabled { opacity:0.5; cursor:not-allowed; }
          .lb-ws-nav { list-style:none; margin:0; padding:0; flex:1; overflow-y:auto; }
          .lb-ws-nav__item {
            display:flex; align-items:center; gap:6px; padding:7px 8px;
            cursor:pointer; border-bottom:1px solid var(--color-border-dark, #3a3a3a);
          }
          .lb-ws-nav__item:hover { background:var(--color-bg-secondary, #333); }
          .lb-ws-nav__item.active { background:var(--color-bg-secondary, #2e2e2e); font-weight:bold; }
          .lb-ws-nav__status { width:16px; text-align:center; flex-shrink:0; font-size:0.85em; }
          .lb-ws-nav__label { font-size:0.82em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
          .lb-ws-content { flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden; }
          .lb-ws-section-header {
            display:flex; align-items:center; justify-content:space-between;
            padding:6px 10px; border-bottom:1px solid var(--color-border-dark, #444);
            flex-shrink:0; background:var(--color-bg-secondary, #2a2a2a);
          }
          .lb-ws-section-header h3 { margin:0; font-size:0.9em; }
          .lb-ws-section-actions { display:flex; gap:4px; }
          .lb-ws-body { flex:1; min-height:0; overflow-y:auto; padding:10px 12px; }
          .lb-ws-fields { display:grid; grid-template-columns:130px 1fr; gap:4px 8px; }
          .lb-ws-field--edit { display:flex; flex-direction:column; gap:2px; margin-bottom:4px; }
          .lb-ws-field__label { font-size:0.78em; color:var(--color-text-light-tertiary, #999); font-weight:bold; padding-top:2px; }
          .lb-ws-field__value { font-size:0.86em; line-height:1.4; }
          .lb-ws-field__textarea { width:100%; box-sizing:border-box; resize:vertical; min-height:40px; font-size:0.85em; }
          .lb-ws-edit-form { display:flex; flex-direction:column; }
          .lb-ws-edit-actions { display:flex; gap:6px; margin-top:8px; }
          .lb-ws-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:10px; padding:20px; text-align:center; }
          .lb-ws-empty__msg { color:var(--color-text-light-tertiary, #999); font-size:0.9em; margin:0; }
          .lb-ws-generating { display:flex; align-items:center; justify-content:center; gap:8px; height:100%; font-size:0.9em; color:var(--color-text-light-tertiary, #999); }
          .lb-ws-btn {
            padding:3px 8px; border:1px solid var(--color-border-dark, #555); border-radius:3px;
            background:var(--color-bg-secondary, #2a2a2a); color:var(--color-text-primary, inherit);
            cursor:pointer; font-size:0.8em; white-space:nowrap;
          }
          .lb-ws-btn:hover:not(:disabled) { background:var(--color-bg-option, #333); }
          .lb-ws-btn:disabled { opacity:0.5; cursor:not-allowed; }
          .lb-ws-btn--primary { background:#4e7ac7; color:#fff; border-color:#3a5e9e; }
          .lb-ws-btn--primary:hover:not(:disabled) { background:#3a5e9e; }
        </style>
        <div class="lb-ws">
          <aside class="lb-ws-sidebar">
            ${portrait}
            <button type="button" class="lb-ws-full-gen" data-action="generateFull" ${isGeneratingAny ? "disabled" : ""}>
              <i class="fas fa-magic"></i> Generate Full
            </button>
            <button type="button" class="lb-ws-full-gen-gendered" data-action="generateFullHoldGender" ${isGeneratingAny ? "disabled" : ""}>
              <i class="fas fa-venus-mars"></i> Hold Gender
            </button>
            <ul class="lb-ws-nav">${navItems}</ul>
          </aside>
          <div class="lb-ws-content">
            <div class="lb-ws-section-header">
              <h3>${isMemoriesView ? '<i class="fas fa-brain"></i> Memories' : `<i class="${meta.icon}"></i> ${meta.label}`}</h3>
              ${sectionBar}
            </div>
            <div class="lb-ws-body">${sectionContent}</div>
          </div>
        </div>`;
      return container;
    }

    override _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
      content.replaceChildren(...Array.from(result.childNodes));
      setupGenderSelectListeners(content);
      setupBackgroundSelectListeners(content);
    }

    override _onClickAction(event: PointerEvent, target: HTMLElement): void | Promise<void> {
      const action = target.dataset["action"];
      const actor = this._getActor();
      if (!actor) return;

      if (action === "selectSection") {
        const section = target.dataset["section"] as NpcSection | "memories";
        if (section && section !== this._selectedSection) {
          this._selectedSection = section;
          this._editMode = false;
          void this.render({ force: true });
        }
        return;
      }
      if (action === "generateSection" || action === "regenerateSection") {
        const section = (target.dataset["section"] ?? this._selectedSection) as NpcSection;
        void this._doGenerate(section, actor);
        return;
      }
      if (action === "generateFull") { void this._doGenerateFull(actor, false); return; }
      if (action === "generateFullHoldGender") { void this._doGenerateFull(actor, true); return; }
      if (action === "editSection") { this._editMode = true; void this.render({ force: true }); return; }
      if (action === "cancelEdit") { this._editMode = false; this._pendingTraits = null; void this.render({ force: true }); return; }
      if (action === "saveSection") { void this._doSaveEdit(actor); return; }
      if (action === "copySection") { void this._doCopy(actor); return; }
      if (action === "rollTraits") {
        const profile = getProfile(actor);
        const bg = ((profile.overview ?? {}) as Record<string, string>)["background"] ?? "";
        this._pendingTraits = rollTraits(bg);
        this._editMode = true;
        void this.render({ force: true });
        return;
      }
      if (action === "wsMemoryDelete") {
        const memoryId = target.dataset["memoryId"] ?? "";
        if (!memoryId) return;
        void deleteMemory(actor, memoryId).then(() => this.render({ force: true }));
        return;
      }
      if (action === "wsMemoryClearAll") {
        void clearMemories(actor).then(() => {
          ui.notifications.info(`LoreBridge: Memories cleared for ${actor.name}.`);
          void this.render({ force: true });
        });
        return;
      }
    }

    private _buildMemoriesContent(actor: FoundryActor, memories: NpcMemoryEntry[]): string {
      if (memories.length === 0) {
        return `<div class="lb-ws-empty">
          <p class="lb-ws-empty__msg">No memories yet.</p>
          <p class="lb-ws-empty__msg" style="font-size:0.85em">Memories accumulate automatically when players interact with this NPC via <code>@${escHtml(actor.name)}</code> in chat.</p>
        </div>`;
      }
      const clearBtn = `<button type="button" class="lb-ws-btn" data-action="wsMemoryClearAll" style="color:#c44;border-color:#c44"><i class="fas fa-trash"></i> Clear All Memories</button>`;
      const entries = [...memories].reverse().map(m => {
        const date = new Date(m.timestamp).toLocaleDateString();
        return `
          <div style="padding:8px 0;border-bottom:1px solid var(--color-border-dark,#3a3a3a)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:0.75em;opacity:0.6">${escHtml(date)} · ${escHtml(m.playerName)}</span>
              <button type="button" class="lb-ws-btn" data-action="wsMemoryDelete" data-memory-id="${escHtml(m.id)}" title="Delete" style="padding:1px 5px;font-size:0.75em">✕</button>
            </div>
            <div style="font-size:0.84em;margin-bottom:2px"><strong>Player:</strong> ${escHtml(m.playerMessage)}</div>
            <div style="font-size:0.84em;color:var(--color-text-light-secondary,#bbb)"><strong>NPC:</strong> ${escHtml(m.npcResponse)}</div>
          </div>`;
      }).join("");
      return `
        <div style="display:flex;flex-direction:column;height:100%">
          <div style="padding:6px 12px 4px;flex-shrink:0;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:0.82em;opacity:0.7">${memories.length} memor${memories.length === 1 ? "y" : "ies"} stored</span>
            ${clearBtn}
          </div>
          <div style="flex:1;min-height:0;overflow-y:auto;padding:0 12px 12px">
            ${entries}
          </div>
        </div>`;
    }

    private async _doGenerate(section: NpcSection, actor: FoundryActor): Promise<void> {
      this._generatingSection = section;
      this._editMode = false;
      await this.render({ force: true });
      try {
        await generateSection(actor, section);
        const label = SECTION_META.find(s => s.id === section)?.label ?? section;
        ui.notifications.info(`LoreBridge: ${label} generated.`);
      } catch (err) {
        ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Generation failed."}`);
      } finally {
        this._generatingSection = null;
        await this.render({ force: true });
      }
    }

    private async _doGenerateFull(actor: FoundryActor, holdGender: boolean): Promise<void> {
      this._editMode = false;
      let errCount = 0;
      for (const meta of SECTION_META) {
        if (holdGender && meta.id === "gender") continue;
        // Show which section is actively spinning in the nav before each call.
        this._generatingSection = meta.id;
        await this.render({ force: true });
        try { await generateSection(actor, meta.id); } catch { errCount++; }
      }
      this._generatingSection = null;
      const label = holdGender ? "Profile (gender preserved)" : "Full NPC profile";
      if (errCount > 0) ui.notifications.warn(`LoreBridge: ${label} generated with ${errCount} error(s).`);
      else ui.notifications.info(`LoreBridge: ${label} generated.`);
      void addHistoryEntry({ type: "npc-profile", label: `NPC ${label} — ${actor.name ?? ""}`, prompt: holdGender ? "Full profile (gender held)" : "Full profile generation", content: JSON.stringify(getProfile(actor), null, 2) });
      await this.render({ force: true });
    }

    private async _doSaveEdit(actor: FoundryActor): Promise<void> {
      const form = this.element?.querySelector(".lb-ws-edit-form");
      if (!form) return;
      const meta = SECTION_META.find(s => s.id === this._selectedSection) ?? SECTION_META[0]!;
      const data: Record<string, string> = {};
      for (const f of meta.fields) {
        if (f.editType === "gender" || f.editType === "presentation") {
          data[f.key] = readGenderFieldValue(form, f.key);
        } else if (f.editType === "background") {
          data[f.key] = readBackgroundFieldValue(form);
        } else {
          const ta = form.querySelector<HTMLTextAreaElement>(`textarea[name="${f.key}"]`);
          data[f.key] = ta?.value.trim() ?? "";
        }
      }
      await persistSection(actor, this._selectedSection as NpcSection, data);
      this._editMode = false;
      await this.render({ force: true });
      ui.notifications.info(`LoreBridge: ${meta.label} saved.`);
    }

    private async _doCopy(actor: FoundryActor): Promise<void> {
      const profile = getProfile(actor);
      const profileSection = this._selectedSection as NpcSection;
      const meta = SECTION_META.find(s => s.id === profileSection) ?? SECTION_META[0]!;
      const data = (profile[profileSection] ?? {}) as Record<string, string>;
      const text = meta.fields.filter(f => data[f.key]).map(f => `${f.label}: ${data[f.key]}`).join("\n");
      if (!text) return;
      await navigator.clipboard.writeText(text);
      ui.notifications.info(`LoreBridge: ${meta.label} copied.`);
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _workspaceInstance: InstanceType<ReturnType<typeof _buildNpcWorkspaceClass>> | undefined;

export function openNpcWorkspace(actorId: string): void {
  const actor = game.actors.get(actorId) as FoundryActor | undefined;
  const title = actor ? `NPC Workspace — ${actor.name}` : "LoreBridge — NPC Workspace";

  if (_workspaceInstance?.rendered && _workspaceInstance.actorId === actorId) {
    _workspaceInstance.bringToFront();
    return;
  }
  if (_workspaceInstance?.rendered) void _workspaceInstance.close({ force: true });

  const WorkspaceClass = _buildNpcWorkspaceClass(title);
  const instance = new WorkspaceClass();
  instance.actorId = actorId;
  _workspaceInstance = instance;
  void instance.render({ force: true });
}

export function registerNpcProfileSheetSection(): void {
  Hooks.on("renderApplicationV2", (app: unknown) => {
    const appAny = app as { document?: FoundryActor; element?: HTMLElement };
    const actor = appAny.document;
    const frame = appAny.element;
    if (!actor || !frame) return;
    if (actor.type !== "npc") return;
    if (!game.user?.isGM) return;
    if (!getLoreBridgeSettings().uiButtonsEnabled) return;
    // dnd5e NPCActorSheet sets class "npc" on its element.
    // Sub-windows (Skill Proficiencies, etc.) do not have this class,
    // so this gates injection to only the main NPC actor sheet.
    if (!frame.classList.contains("npc")) return;
    injectProfilePanel(frame, actor);
  });
}

export function registerNpcWorkspaceMenuHook(): void {
  Hooks.on("getHeaderControlsActorSheetV2", (...args: unknown[]) => {
    const [app, controls] = args as [{ document?: FoundryActor }, unknown[]];
    if (!game.user?.isGM) return;
    const actor = app.document;
    if (!actor || actor.type !== "npc") return;
    if ((controls as Array<{ class?: string }>).some(c => c.class === "lorebridge-npc-workspace")) return;
    controls.push({
      label: "NPC Workspace",
      class: "lorebridge-npc-workspace",
      icon: "fas fa-robot",
      onClick: () => { openNpcWorkspace(actor.id); },
    });
  });
}
