import {checkAmbientRouting} from './preflight.mjs';

const profiles=Object.freeze({
  workspace:Object.freeze({name:'workspace',runtime:'docker-sandbox',cni:'kindnet',mesh:'none',
    proves:Object.freeze({application:true,delivery:false,meshSecurity:false,ciliumPolicy:false})}),
  full:Object.freeze({name:'full',runtime:'linux',cni:'cilium',mesh:'ambient',
    proves:Object.freeze({application:true,delivery:true,meshSecurity:true,ciliumPolicy:true})}),
});
export function clusterProfile(name){
  if(!Object.hasOwn(profiles,name))throw Error('Select an explicit cluster profile: workspace or full');
  return profiles[name];
}
export function checkProfile(name,ambientProbe=checkAmbientRouting){
  const profile=clusterProfile(name);
  // Passing this gate does not prove complete compatibility (especially Cilium).
  return profile.mesh==='ambient'?ambientProbe():{ok:true,profile:name,mesh:'none'};
}
