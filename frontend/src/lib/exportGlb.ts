/** Save the restyled model (and its ground) as a .glb file, entirely in the browser. */

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

export async function exportGlb(objects: THREE.Object3D[], filename: string) {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(objects, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".glb") ? filename : `${filename}.glb`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
