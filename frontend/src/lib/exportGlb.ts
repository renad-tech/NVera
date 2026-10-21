/** Save the restyled model (and its ground) as a .glb file, entirely in the browser. */

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/** The objects as one binary glTF file (creator credits in `userData` become glTF "extras"). */
export async function glbBlob(objects: THREE.Object3D[]): Promise<Blob> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(objects, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  return new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function exportGlb(objects: THREE.Object3D[], filename: string) {
  saveBlob(await glbBlob(objects), filename.endsWith(".glb") ? filename : `${filename}.glb`);
}
