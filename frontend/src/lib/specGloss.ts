/** Older glTF files (many Sketchfab and Objaverse models) describe materials with the retired
 *  KHR_materials_pbrSpecularGlossiness extension. three.js no longer reads it, so those models
 *  show up white. This loader plugin turns them into normal PBR materials and keeps their textures. */

import * as THREE from "three";
import type { GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTFLoader as DreiGLTFLoader } from "three-stdlib";

const NAME = "KHR_materials_pbrSpecularGlossiness";

interface SpecGloss {
  diffuseFactor?: number[];
  diffuseTexture?: { index: number };
  glossinessFactor?: number;
}

class SpecGlossPlugin implements GLTFLoaderPlugin {
  readonly name = NAME;
  constructor(private parser: GLTFParser) {}

  private ext(materialIndex: number): SpecGloss | undefined {
    return this.parser.json.materials?.[materialIndex]?.extensions?.[NAME];
  }

  getMaterialType(materialIndex: number) {
    return this.ext(materialIndex) ? THREE.MeshStandardMaterial : null;
  }

  extendMaterialParams(materialIndex: number, params: Record<string, unknown>) {
    const ext = this.ext(materialIndex);
    if (!ext) return Promise.resolve();
    const f = ext.diffuseFactor ?? [1, 1, 1, 1];
    params.color = new THREE.Color().setRGB(f[0], f[1], f[2], THREE.LinearSRGBColorSpace);
    params.opacity = f[3];
    params.metalness = 0;
    params.roughness = 1 - (ext.glossinessFactor ?? 0.2);
    return ext.diffuseTexture
      ? this.parser.assignTexture(params, "map", ext.diffuseTexture, THREE.SRGBColorSpace)
      : Promise.resolve();
  }
}

/** Pass to drei's useGLTF as `extendLoader`. (drei types its loader with three-stdlib; at runtime
 *  it is three's own GLTFLoader, which is what the plugin talks to.) */
export function withSpecGloss(loader: DreiGLTFLoader) {
  loader.register((parser) => new SpecGlossPlugin(parser as unknown as GLTFParser) as never);
}
