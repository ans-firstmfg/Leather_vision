import { torsoFromPose,type Landmark } from './pose';
import { silhouetteWidths,type BodyMask } from './body-mask';

interface VisionMask {width:number;height:number;getAsFloat32Array():Float32Array;close():void}
export interface TrackingFrame {
  landmarks:Landmark[][];worldLandmarks?:Landmark[][];segmentationMasks?:VisionMask[];
  hands?:Landmark[][];mask?:BodyMask;release?:()=>void;
}
export interface Tracker {detectForVideo(video:HTMLVideoElement,timestamp:number):TrackingFrame;close():void;handReady?:Promise<boolean>}
interface HandTracker {detectForVideo(video:HTMLVideoElement,timestamp:number):{landmarks:Landmark[][]};close():void}
interface VisionModule {
  FilesetResolver:{forVisionTasks(path:string):Promise<unknown>};
  PoseLandmarker:{createFromOptions(files:unknown,options:unknown):Promise<Tracker>};
  HandLandmarker:{createFromOptions(files:unknown,options:unknown):Promise<HandTracker>};
}

export async function createTracker():Promise<Tracker>{
  const base='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
  const runtime=await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`) as VisionModule;
  const files=await runtime.FilesetResolver.forVisionTasks(`${base}/wasm`);
  const pose=await runtime.PoseLandmarker.createFromOptions(files,{
    baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'CPU'},
    runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6,outputSegmentationMasks:true,
  });
  return combineTrackers(pose,()=>runtime.HandLandmarker.createFromOptions(files,{
    baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'CPU'},
    runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.7,minHandPresenceConfidence:.7,minTrackingConfidence:.7,
  }));
}

/** Extra hand model never blocks pose startup. This also owns late-load cleanup. */
export function combineTrackers(pose:Tracker,loadHand:()=>Promise<HandTracker>):Tracker {
  let hand:HandTracker|undefined,closed=false;
  const handReady=Promise.resolve().then(loadHand).then(value=>{
    if(closed){value.close();return false;}hand=value;return true;
  }).catch(()=>{console.warn('[Live AR] Hand tracking unavailable; using garment preview without hand occlusion.');return false;});
  return {
    handReady,
    detectForVideo(video,timestamp){
      const before=performance.now(),raw=pose.detectForVideo(video,timestamp);
      let hands:Landmark[][]|undefined;
      if(hand&&raw.landmarks.length&&performance.now()-before<80){
        try{hands=hand.detectForVideo(video,timestamp).landmarks;}catch{hand.close();hand=undefined;console.warn('[Live AR] Hand tracking stopped; pose preview remains available.');}
      }
      return {landmarks:raw.landmarks,worldLandmarks:raw.worldLandmarks,segmentationMasks:raw.segmentationMasks,hands,
        release:()=>{for(const mask of raw.segmentationMasks??[])mask.close();}};
    },
    close(){if(closed)return;closed=true;pose.close();hand?.close();hand=undefined;},
  };
}

export function prepareTorso(frame:TrackingFrame,width:number,height:number){
  frame.mask=undefined;
  const torso=torsoFromPose(frame.landmarks[0]??[],width,height,frame.worldLandmarks?.[0]);
  if(!torso)return null;
  const mask=frame.segmentationMasks?.[0];
  if(mask)try{
    const data=mask.getAsFloat32Array();
    if(mask.width<8||mask.height<8||data.length!==mask.width*mask.height)return torso;
    frame.mask={width:mask.width,height:mask.height,data};
    torso.body=silhouetteWidths(frame.mask,torso,width,height);
  }catch{frame.mask=undefined;}
  return torso;
}
export function releaseFrame(frame:TrackingFrame){
  try{if(frame.release)frame.release();else for(const mask of frame.segmentationMasks??[])mask.close();}
  finally{frame.mask=undefined;frame.segmentationMasks=undefined;frame.hands=undefined;frame.release=undefined;}
}
