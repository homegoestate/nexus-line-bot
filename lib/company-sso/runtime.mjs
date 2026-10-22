import {createFirebase} from './firebase.mjs';
import {createGateway} from './gateway.mjs';
import {Fault} from './core.mjs';
export function createRuntime({env=process.env,driverFactory=createFirebase}={}){
 let gateway;
 return {async handle(token,route,input){
  if(!env.HGE_SSO_SERVICE_ACCOUNT_JSON)throw new Fault(503,'configuration','後端資料庫憑證尚未設定');
  if(!gateway){
   const driver=driverFactory({apiKey:'AIzaSyCSOS-36oQ6hTyhtD2vrez3QGvPdvwMOIw',credentialJSON:env.HGE_SSO_SERVICE_ACCOUNT_JSON});
   gateway=createGateway({store:driver.store,verifyToken:driver.verify});
  }
  return gateway.handle(token,route,input);
 }};
}
