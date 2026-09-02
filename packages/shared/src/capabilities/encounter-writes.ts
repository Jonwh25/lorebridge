export type EncounterCombatant = {
  name: string;
  quantity: number;
  actorId: string | undefined;
  initiativeModifier: number;
  positionZone: string;
  disposition: number;
};

export type EncounterCreateApprovalPayload = {
  encounterName: string;
  sceneId: string;
  combatants: EncounterCombatant[];
  startCombat: boolean;
  hookText: string | undefined;
  rationale: string | undefined;
};

export type SceneUpdateApprovalPayload = {
  sceneId: string;
  sceneName: string;
  diff: Record<string, unknown>;
  instruction: string;
  rationale: string | undefined;
};
