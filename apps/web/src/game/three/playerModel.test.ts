import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cpuEasyTeam, createMatch, starterLikeTeam, type MatchState } from '@pitch/sim';
import { ModelActor, ModelMaterials, type PlayerModel } from './playerModel';

/** Model tối giản: một xương hông, mỗi clip đặt hông ở một độ cao riêng. */
function fakeModel(): PlayerModel {
  const scene = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  scene.add(hips);
  const clip = (name: string, y: number, duration: number) =>
    new THREE.AnimationClip(name, duration, [
      new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, duration], [0, y, 0, 0, y, 0]),
    ]);
  const clips = [clip('idle', 1, 1), clip('jog', 1, 1), clip('pass', 0.2, 0.5)];
  return { scene, clips: new Map(clips.map((c) => [c.name, c])), speeds: {} };
}

describe('ModelActor', () => {
  it('clip một lần phát xong thì nhả hẳn về clip lặp, không kẹt khung cuối (đứng nghiêng)', () => {
    const state: MatchState = {
      ...createMatch({ home: starterLikeTeam, away: cpuEasyTeam, difficulty: 'easy', seed: 1 }),
      phase: 'play',
    };
    const p = state.players[2]!;
    const actor = new ModelActor(fakeModel(), p, new ModelMaterials());
    const hips = actor.root.getObjectByName('mixamorigHips')!;
    actor.update(0.5, p, state, 0);
    actor.trigger('pass');
    for (let i = 0; i < 120; i++) actor.update(1 / 60, p, state, 0);
    expect(hips.position.y).toBeCloseTo(1, 3);
  });
});
