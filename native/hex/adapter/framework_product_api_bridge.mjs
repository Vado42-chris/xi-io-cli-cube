import {pathToFileURL} from 'node:url';

const modulePath=process.argv[2];
if(!modulePath)process.exit(64);
let raw='';
for await(const chunk of process.stdin)raw+=chunk;
try{
 const input=JSON.parse(raw);
 const mod=await import(pathToFileURL(modulePath).href);
 let output;
 if(input.action==='compile'){
  if(typeof mod.compileProductApiDeclaration!=='function')throw Error('FRAMEWORK_PRODUCT_API_COMPILER_EXPORT_REQUIRED');
  output=await mod.compileProductApiDeclaration(input.declaration);
 }else if(input.action==='reopen'){
  if(typeof mod.reopenVerifiedProductApiDeclaration!=='function')throw Error('FRAMEWORK_PRODUCT_API_READER_EXPORT_REQUIRED');
  output=await mod.reopenVerifiedProductApiDeclaration({
   binding_receipt_path:input.binding_receipt_path,
   expected_dependency_id:input.expected_dependency_id,
   expected_owner_repo:input.expected_owner_repo,
   expected_generation:input.expected_generation,
   expected_declaration_ref:input.expected_declaration_ref,
   expected_product_ref:input.expected_product_ref,
   expected_api_ref:input.expected_api_ref,
  });
 }else{
  throw Error('FRAMEWORK_PRODUCT_API_ACTION_INVALID');
 }
 process.stdout.write(JSON.stringify(output));
}catch(error){
 process.stderr.write(String(error?.code||error?.message||error));
 process.exit(65);
}
