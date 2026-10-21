/** CREDITS.txt for a scene: every model, its creator and what its license asks of you. */

import type { SceneModel } from "./api";

function licenseNote(license: string): string {
  const l = license.toLowerCase();
  if (l.includes("cc0") || l.includes("public domain")) return "Free to use. No credit needed (but it's kind to give it).";
  if (l.includes("non") && l.includes("commercial")) return "Credit the creator. Not for commercial use.";
  if (l.includes("attribution") || l.includes("cc-by") || l.includes("cc by")) return "Free to use. You must credit the creator.";
  if (l.includes("smithsonian")) return "Smithsonian Open Access: check the terms at si.edu/openaccess.";
  return "Check the license at the link before using it.";
}

export function creditsText(title: string, models: SceneModel[]): string {
  const unique = [...new Map(models.map((m) => [m.id, m])).values()];
  const lines = [
    `${title}`,
    "Scene built with NVera (https://nvera.onrender.com) from free 3D models.",
    "",
    "MODELS",
    "",
  ];
  unique.forEach((m, i) => {
    lines.push(
      `${i + 1}. ${m.name}`,
      `   Creator: ${m.author || "unknown"}${m.author_url ? ` (${m.author_url})` : ""}`,
      `   License: ${m.license || "unknown"} - ${licenseNote(m.license || "")}`,
      `   Source:  ${m.source_label} - ${m.url}`,
      "",
    );
  });
  const credit = unique.map((m) => `"${m.name}" by ${m.author || "unknown"} (${m.license || "see source"})`).join(", ");
  lines.push("READY-TO-PASTE CREDIT LINE", "", `3D models: ${credit}. Scene assembled with NVera.`, "");
  return lines.join("\r\n");
}
