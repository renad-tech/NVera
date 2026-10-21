/** The real bounds of a found model. Some files carry a backdrop, a floor or a stray object far
 *  away from the model itself (Sketchfab scenes often do); fitting the camera to all of it would
 *  shrink the model to a dot. Parts far from the rest are removed (camera framing and the GLB
 *  export would still count hidden ones). */

import * as THREE from "three";

const OUTLIER = 8;  // a part this many "model sizes" away from the middle of the parts is stray

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Rigged (skinned) models are frozen in their rest pose as plain meshes. NVera never plays
 *  animations, and three.js measures, culls and exports skinned meshes through their bones, which
 *  for many converted Sketchfab rigs gives wrong sizes or an invisible model. */
export function freezeRig(root: THREE.Object3D) {
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((obj) => { if ((obj as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(obj as THREE.SkinnedMesh); });
  for (const sk of skinned) {
    const mesh = new THREE.Mesh(sk.geometry, sk.material);
    mesh.name = sk.name;
    mesh.position.copy(sk.position);
    mesh.quaternion.copy(sk.quaternion);
    mesh.scale.copy(sk.scale);
    mesh.visible = sk.visible;
    mesh.castShadow = sk.castShadow;
    mesh.receiveShadow = sk.receiveShadow;
    const parent = sk.parent!;
    parent.children[parent.children.indexOf(sk)] = mesh;
    mesh.parent = parent;
    sk.parent = null;
  }
}

export function modelBounds(root: THREE.Object3D): THREE.Box3 {
  freezeRig(root);
  root.updateWorldMatrix(true, true);
  const parts: { mesh: THREE.Mesh; box: THREE.Box3; center: THREE.Vector3; size: number }[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    parts.push({ mesh, box, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()).length() });
  });
  if (!parts.length) return new THREE.Box3().setFromObject(root);
  if (parts.length < 3) return parts.reduce((b, p) => b.union(p.box), new THREE.Box3());

  const mid = new THREE.Vector3(
    median(parts.map((p) => p.center.x)), median(parts.map((p) => p.center.y)), median(parts.map((p) => p.center.z)),
  );
  // How spread out the model's own parts are: the typical distance from the middle, or the
  // typical part size when every part sits in the same spot.
  const spread = Math.max(median(parts.map((p) => p.center.distanceTo(mid))), median(parts.map((p) => p.size)), 1e-6);

  const box = new THREE.Box3();
  for (const p of parts) {
    if (p.center.distanceTo(mid) > OUTLIER * spread) p.mesh.removeFromParent();  // stray backdrop or prop
    else box.union(p.box);
  }
  return box.isEmpty() ? parts.reduce((b, p) => b.union(p.box), new THREE.Box3()) : box;
}
