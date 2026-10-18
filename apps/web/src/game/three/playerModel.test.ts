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

describe('ModelActor — bóng trong tay', () => {
  /** Model có xương hông + hai tay; clip `throw_in` dài 2 s, hông đi từ 0 lên 2 (hông = giây). */
  function handsModel(handGap: number): PlayerModel {
    const scene = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorigHips';
    const right = new THREE.Bone();
    right.name = 'mixamorigRightHand';
    right.position.set(-handGap / 2, 1, 0);
    const left = new THREE.Bone();
    left.name = 'mixamorigLeftHand';
    left.position.set(handGap / 2, 1, 0);
    scene.add(hips, right, left);
    const track = (y0: number, y1: number, d: number) =>
      new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, d], [0, y0, 0, 0, y1, 0]);
    const clips = [
      new THREE.AnimationClip('idle', 1, [track(1, 1, 1)]),
      new THREE.AnimationClip('throw_in', 2, [track(0, 2, 2)]),
    ];
    return { scene, clips: new Map(clips.map((c) => [c.name, c])), speeds: {} };
  }
  const match = createMatch({
    home: starterLikeTeam,
    away: cpuEasyTeam,
    difficulty: 'easy',
    seed: 1,
  });

  it('chờ ném biên: đứng yên ở tư thế giơ bóng, hết cảnh thì nhả về clip lặp', () => {
    const p = match.players[2]!;
    const restart = { type: 'throw_in', team: p.team, spot: p.pos, takerId: p.id, startTick: 0 };
    const waiting = { ...match, phase: 'dead_ball', restart } as MatchState;
    const actor = new ModelActor(handsModel(0.3), p, new ModelMaterials());
    const hips = actor.root.getObjectByName('mixamorigHips')!;
    for (let i = 0; i < 120; i++) actor.update(1 / 60, p, waiting, 0);
    expect(hips.position.y).toBeCloseTo(1.2, 3);
    const playing = { ...match, phase: 'play', restart: null } as MatchState;
    for (let i = 0; i < 60; i++) actor.update(1 / 60, p, playing, 0);
    expect(hips.position.y).toBeCloseTo(1, 3);
  });

  it('hai tay khép → bóng giữa hai tay; tay buông → lệch ra ngoài tay phải', () => {
    const p = match.players[0]!;
    const out = new THREE.Vector3();
    const close = new ModelActor(handsModel(0.3), p, new ModelMaterials());
    expect(close.ballInHands(out)).toBe(true);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(1, 6);
    const apart = new ModelActor(handsModel(0.8), p, new ModelMaterials());
    apart.ballInHands(out);
    expect(out.x).toBeLessThan(-0.4);
  });
});
