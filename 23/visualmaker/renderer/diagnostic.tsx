import React from 'react';
import {AbsoluteFill, Composition, registerRoot, useCurrentFrame} from 'remotion';
import {DIAGNOSTIC_ID,DIAGNOSTIC_RECIPE} from './contract';


function Pattern(){
  const frame=useCurrentFrame();
  const x=40+Math.round(frame*7);
  return <AbsoluteFill style={{backgroundColor:'#111827',fontFamily:'Arial, sans-serif',color:'#ffffff'}}>
    <div style={{position:'absolute',top:48,left:x,width:112,height:112,backgroundColor:'#29b6d2',borderRadius:12}}/>
    <div style={{position:'absolute',top:198,left:36,width:568,height:4,backgroundColor:'#64748b'}}/>
    <div style={{position:'absolute',bottom:36,left:36,fontSize:20,fontWeight:700,letterSpacing:1}}>ENGINE DIAGNOSTIC · NOT A CUT PREVIEW</div>
    <div style={{position:'absolute',top:44,right:36,fontSize:18}}>FRAME {String(frame).padStart(2,'0')}</div>
  </AbsoluteFill>;
}

function DiagnosticRoot(){return <Composition id={DIAGNOSTIC_ID} component={Pattern} width={DIAGNOSTIC_RECIPE.width} height={DIAGNOSTIC_RECIPE.height} fps={DIAGNOSTIC_RECIPE.fps} durationInFrames={DIAGNOSTIC_RECIPE.durationInFrames}/>;}
registerRoot(DiagnosticRoot);
