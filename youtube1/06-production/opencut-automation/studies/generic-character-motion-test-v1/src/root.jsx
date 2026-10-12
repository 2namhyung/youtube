import React from 'react';
import {Composition} from 'remotion';
import {MotionTest} from './scene';
import {CharacterActionTest} from './action-scene';
import {ArticulatedCharacterTest} from './articulated-scene';
import {DrawnCharacterActionTest} from './drawn-action-scene';
import {DrawnCharacterActionNoFlicker} from './drawn-action-no-flicker';
import {ContinuousArmMeshTest} from './continuous-arm-scene';
import {Separated22CharacterTest} from './separated-22-scene';

export const Root = () => <>
  <Composition id="GenericCharacterMotionTest" component={MotionTest} durationInFrames={72} fps={24} width={1080} height={1920}/>
  <Composition id="CharacterPhonePickupTest" component={CharacterActionTest} durationInFrames={72} fps={24} width={1080} height={1920}/>
  <Composition id="ArticulatedCharacterPhonePickup" component={ArticulatedCharacterTest} durationInFrames={72} fps={24} width={1080} height={1920}/>
  <Composition id="DrawnCharacterPhonePickup" component={DrawnCharacterActionTest} durationInFrames={72} fps={24} width={1080} height={1920}/>
  <Composition id="DrawnCharacterPhonePickupNoFlicker" component={DrawnCharacterActionNoFlicker} durationInFrames={72} fps={24} width={1080} height={1920}/>
  <Composition id="ContinuousArmMeshTest" component={ContinuousArmMeshTest} durationInFrames={72} fps={24} width={1080} height={1920}/>
  <Composition id="Separated22CharacterTest" component={Separated22CharacterTest} durationInFrames={72} fps={24} width={1080} height={1920}/>
</>;
