import test from 'node:test';
import assert from 'node:assert/strict';
import {PLUGINS,PLUGIN_CATEGORIES,projectPluginProfiles,statusForPlugin} from '../src/lib/pluginCatalog.mjs';

const p=(id,workspace,principal,profile,state='AUTHORIZED')=>({
  plugin_id:id,workspace_ref:workspace,principal_ref:principal,profile_ref:profile,status:state,
});
test('ChatGPT is a plugin, not an installed base product',()=>{
  const chat=PLUGINS.find(x=>x.id==='chatgpt');
  assert.equal(chat?.kind,'MCP_PLUGIN');
  assert.equal(chat?.category,'ai');
  assert.equal(chat?.credentials,'PROVIDER_OWNED');
});
test('three usable plugin category groups with no duplicate IDs',()=>{
  assert.deepEqual(PLUGIN_CATEGORIES.map(x=>x.id),['ai','accounts','developer']);
  assert.equal(new Set(PLUGINS.map(x=>x.id)).size,PLUGINS.length);
  assert.ok(PLUGINS.every(x=>PLUGIN_CATEGORIES.some(c=>c.id===x.category)));
});
test('multiple ChatGPT profiles coexist for same user and workspace',()=>{
  const result=projectPluginProfiles([
    p('chatgpt','work:family','user:a','profile:family'),
    p('chatgpt','work:family','user:a','profile:work'),
  ]);
  assert.equal(result.profiles.length,2);
  assert.equal(result.effect_authority,0);
});
test('different customer principals and workspaces stay distinct',()=>{
  const rows=[
    p('chatgpt','work:private','user:a','profile:a'),
    p('chatgpt','work:private','user:b','profile:b'),
    p('chatgpt','work:tenant','user:a','profile:c'),
  ];
  assert.equal(projectPluginProfiles(rows,{principal_ref:'user:a'}).profiles.length,2);
  assert.equal(projectPluginProfiles(rows,{workspace_ref:'work:tenant'}).profiles.length,1);
  assert.equal(projectPluginProfiles(rows,{principal_ref:'user:b',workspace_ref:'work:tenant'}).profiles.length,0);
});
test('duplicate identity tuples cannot inflate profile count',()=>{
  const one=p('github','work:client','user:a','profile:repo');
  assert.equal(projectPluginProfiles([one,one]).profiles.length,1);
});
test('forbid secret-bearing records without exporting values',()=>{
  const rows=[{...p('chatgpt','work:client','user:a','profile:one'),access_token:'sk-unsafe'},
              p('chatgpt','work:client','user:a','profile:two')];
  const result=projectPluginProfiles(rows);
  assert.equal(result.profiles.length,1);
  assert.equal(JSON.stringify(result).includes('sk-unsafe'),false);
  assert.equal(result.credential_values_present,false);
});
test('reject malformed or unregistered provider identities',()=>{
  const rows=[p('random','work:client','user:a','profile:x'),
              p('chatgpt','work:client','../bad','profile:y'),
              {...p('chatgpt','work:client','user:a','profile:z'),status:'GRANTED'}];
  assert.equal(projectPluginProfiles(rows).profiles.length,0);
});
test('invalid caller scope does not bypass ownership',()=>{
  assert.equal(projectPluginProfiles([p('chatgpt','ws:a','user:a','profile:a')],{capability:'admin'}).state,'BLOCKED');
});
test('no fixed cardinality; 100 independent profiles accepted',()=>{
  const rows=Array.from({length:100},(_,i)=>p('chatgpt','work:client','user:a','profile:'+i));
  assert.equal(projectPluginProfiles(rows).profiles.length,100);
});
test('receipt presence is not plugin authorization',()=>{
  const obs={aries_mcp:{state:'ARIES_MCP_STDIO_INSTALLED_READBACK_VERIFIED'},tunnel:{state:'NOT_VERIFIED'}};
  assert.equal(statusForPlugin(obs,'chatgpt'),'LOCAL_MCP_INSTALLED_CHATGPT_NOT_CONNECTED');
});
test('even locally ready tunnel cannot claim ChatGPT plugin attached',()=>{
  const obs={aries_mcp:{state:'ARIES_MCP_STDIO_INSTALLED_READBACK_VERIFIED'},tunnel:{state:'TUNNEL_LOCAL_CLIENT_READY',live_checked:true}};
  assert.equal(statusForPlugin(obs,'chatgpt'),'TUNNEL_LOCAL_VERIFIED_PLUGIN_NOT_ATTACHED');
});
test('non-ChatGPT plugins do not borrow a ChatGPT credential/receipt',()=>{
  assert.equal(statusForPlugin({aries_mcp:{state:'ARIES_MCP_STDIO_INSTALLED_READBACK_VERIFIED'}},'gmail'),'NOT_OBSERVED');
});
