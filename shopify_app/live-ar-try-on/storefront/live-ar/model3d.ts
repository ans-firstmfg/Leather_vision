import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Torso } from './pose';
import { adaptiveTargets, influences, modelAnchors, neutralAdjustment, roundedChestDepth, roundedShoulderPoint, prominentCollarPoint, collarWeight, type PreviewAdjustment } from './adaptive-model';

/** Sample-specific procedural deformation, not cloth simulation or garment sizing. */
export class ThreeGarment {
  private renderer: THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10000);
  private model?: THREE.Group;
  private bounds=new THREE.Vector3();
  private width=0;
  private height=0;
  private disposed=false;
  private meshes: {geometry:THREE.BufferGeometry; original:Float32Array; weights:Float32Array}[]=[];
  private controls?: HTMLFieldSetElement;
  private adjustment=neutralAdjustment();
  constructor(host?: HTMLElement){
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x000000,0);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.75;
    this.camera.position.z=2000;
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x56645c,1.5));
    const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(-2,2,3);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xffffff,1);fill.position.set(2,1,-2);this.scene.add(fill);
    if(host)this.mountControls(host);
  }
  private mountControls(host:HTMLElement){
    const panel=host.querySelector('.fm-ar__controls');if(!panel)return;
    const field=document.createElement('fieldset');field.className='fm-ar__adjustments';
    const legend=document.createElement('legend');legend.textContent='Adjust 3D preview';field.append(legend);
    const note=document.createElement('p');note.textContent='Visual adjustment only. This does not select a clothing size. Resets when you change jackets or restart.';field.append(note);
    for(const [key,title] of [['width','Jacket width'],['length','Jacket length']] as const){
      const label=document.createElement('label'),input=document.createElement('input'),output=document.createElement('output');
      input.type='range';input.min='85';input.max='115';input.value='100';input.step='1';input.setAttribute('aria-label',title);
      label.append(title,input,output);output.textContent='100%';
      input.addEventListener('input',()=>{this.adjustment[key]=Number(input.value)/100;output.textContent=input.value+'%';});field.append(label);
    }
    const reset=document.createElement('button');reset.type='button';reset.className='fm-ar__button fm-ar__button--quiet';reset.textContent='Reset adjustments';
    reset.addEventListener('click',()=>{this.adjustment=neutralAdjustment();field.querySelectorAll('input').forEach(input=>input.value='100');field.querySelectorAll('output').forEach(output=>output.textContent='100%');});field.append(reset);
    panel.append(field);this.controls=field;
  }
  private release(model:THREE.Group){model.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)material.dispose();}});}
  async load(url:string){
    const gltf=await new GLTFLoader().loadAsync(url);
    if(this.disposed){this.release(gltf.scene);return;}
    if(this.model){this.scene.remove(this.model);this.release(this.model);}
    const box=new THREE.Box3().setFromObject(gltf.scene),center=box.getCenter(new THREE.Vector3());
    box.getSize(this.bounds);if(this.bounds.y<=0)throw new Error('Model has no height');
    this.model=new THREE.Group();this.meshes=[];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){
      const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);geometry.translate(-center.x,-center.y,-center.z);
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      const original=new Float32Array(geometry.attributes.position.array),weights=new Float32Array(original.length/3*modelAnchors.length);
      const colors=new Float32Array(original.length);
      for(let i=0;i<original.length/3;i++){
        const p={x:original[i*3]/this.bounds.x+.5,y:.5-original[i*3+1]/this.bounds.y};
        weights.set(influences(prominentCollarPoint(roundedShoulderPoint(p))),i*modelAnchors.length);
        // A subtle collar tint keeps its raised rim legible on the white sample.
        const tint=1-.22*collarWeight(p);colors.set([tint,tint,tint],i*3);
      }
      if(!geometry.attributes.uv)geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      const material=geometry.attributes.uv ? (Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone()) : new THREE.MeshStandardMaterial({color:0xe6e5de,roughness:.8,metalness:0,side:THREE.DoubleSide,vertexColors:true});
      this.model!.add(new THREE.Mesh(geometry,material));this.meshes.push({geometry,original,weights});
    }});
    this.release(gltf.scene);this.scene.add(this.model);
  }
  resize(width:number,height:number){
    if(this.width===width&&this.height===height)return;
    this.width=width;this.height=height;this.renderer.setSize(width,height,false);
    Object.assign(this.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});this.camera.updateProjectionMatrix();
  }
  draw(context:CanvasRenderingContext2D,torso:Torso){
    if(!this.model||this.disposed)return 'body_missing';
    const target=adaptiveTargets(torso,this.adjustment);
    if(!target)return 'arms_missing';
    if(!target.complete)return 'arms_missing';
    this.resize(context.canvas.width,context.canvas.height);
    const depthScale=torso.width/(this.bounds.x*.64);
    for(const {geometry,original,weights} of this.meshes){
      const position=geometry.attributes.position;
      for(let i=0;i<position.count;i++){
        let x=0,y=0;
        for(let j=0;j<target.points.length;j++){const w=weights[i*modelAnchors.length+j];x+=w*target.points[j].x;y+=w*target.points[j].y;}
        const depth=roundedChestDepth(original[i*3]/this.bounds.x+.5,.5-original[i*3+1]/this.bounds.y,original[i*3+2]*depthScale,(torso.body?.chest??torso.width/1.28)*this.adjustment.width);
        position.setXYZ(i,x-this.width/2+depth*Math.sin(torso.yaw??0),this.height/2-y-depth*Math.sin(torso.pitch??0),depth);
      }
      position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
    }
    this.model.scale.setScalar(1);this.model.rotation.set(0,0,0);this.model.position.set(0,0,0);
    this.renderer.render(this.scene,this.camera);
    context.drawImage(this.renderer.domElement,0,0);
    return 'model_preview';
  }
  preview(context:CanvasRenderingContext2D,yaw:number){
    if(!this.model||this.disposed)return;
    this.resize(context.canvas.width,context.canvas.height);
    for(const {geometry,original} of this.meshes){(geometry.attributes.position as THREE.BufferAttribute).copyArray(original);geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();}
    const scale=Math.min(this.width*.8/this.bounds.x,this.height*.8/this.bounds.y);
    this.model.scale.setScalar(scale);this.model.position.set(0,0,0);this.model.rotation.set(0,yaw,0);
    this.renderer.render(this.scene,this.camera);context.clearRect(0,0,this.width,this.height);context.drawImage(this.renderer.domElement,0,0);
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.controls?.remove();if(this.model)this.release(this.model);this.meshes=[];this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();}
}
