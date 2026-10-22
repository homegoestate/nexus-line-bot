import {createHandler} from '../lib/company-sso/http.mjs';
import {createRuntime} from '../lib/company-sso/runtime.mjs';
export default createHandler({service:createRuntime(),enabled:()=>process.env.HGE_SSO_ENABLED==='true'});
