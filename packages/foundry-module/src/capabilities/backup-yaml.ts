/**
 * Minimal YAML serializer for the Raven's Eye backup format.
 * Handles the specific nested structures needed for:
 * - Campaign manifests (ravens-eye.yaml)
 * - Core record frontmatter (entry/*.md, place/*.md)
 * - Foundry extension resources (folder and scene YAML sidecars)
 *
 * No YAML library is imported — all structures are serialized manually.
 * Scalar quoting follows YAML 1.2 safe-quoting rules.
 */

function yamlScalar(s: string): string {
  if (
    s === "" ||
    /[:#\[\]{},>|&*!'"%@`\n\r\t\\]/.test(s) ||
    /^(true|false|yes|no|null|~)$/i.test(s) ||
    /^\d/.test(s) ||
    s.trim() !== s
  ) {
    return JSON.stringify(s);
  }
  return s;
}

function isComplexValue(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v)) return (v as unknown[]).length > 0;
  return true;
}

/**
 * Recursively serialize a value into YAML fragment.
 * Objects and non-empty arrays produce a leading newline for each entry so
 * callers can safely concatenate `key:${serializeYaml(v, indent+1)}`.
 */
export function serializeYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return yamlScalar(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return (value as unknown[])
      .map((item) => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          // Inline first key with dash; align continuation keys after dash.
          const entries = Object.entries(item as Record<string, unknown>);
          if (entries.length === 0) return `\n${pad}- {}`;
          const lines: string[] = [];
          for (let i = 0; i < entries.length; i++) {
            const [k, v] = entries[i]!;
            const complex = isComplexValue(v);
            if (i === 0) {
              lines.push(
                complex
                  ? `\n${pad}- ${k}:${serializeYaml(v, indent + 2)}`
                  : `\n${pad}- ${k}: ${serializeYaml(v, indent)}`,
              );
            } else {
              // Continuation lines are aligned 2 spaces after the dash.
              lines.push(
                complex
                  ? `\n${pad}  ${k}:${serializeYaml(v, indent + 2)}`
                  : `\n${pad}  ${k}: ${serializeYaml(v, indent)}`,
              );
            }
          }
          return lines.join("");
        }
        return `\n${pad}- ${serializeYaml(item, indent + 1)}`;
      })
      .join("");
  }

  // Plain object
  const obj = value as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) return "{}";
  return entries
    .map(([key, val]) => {
      if (isComplexValue(val)) {
        return `\n${pad}${key}:${serializeYaml(val, indent + 1)}`;
      }
      return `\n${pad}${key}: ${serializeYaml(val, indent)}`;
    })
    .join("");
}

/**
 * Serialize a top-level object as a YAML document (no leading newline on root
 * keys, trailing newline appended).
 */
export function toYamlDoc(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (isComplexValue(val)) {
      lines.push(`${key}:${serializeYaml(val, 1)}`);
    } else {
      lines.push(`${key}: ${serializeYaml(val, 0)}`);
    }
  }
  return lines.join("\n") + "\n";
}
