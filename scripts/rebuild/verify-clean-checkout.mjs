import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { resolveBrowserPaths, npmInvocation } from './source-paths.mjs';

const paths=resolveBrowserPaths(),directory=await mkdtemp(join(tmpdir(),'linkage-clean-'));
const parent=join(paths.local,'evidence/g10');await mkdir(parent,{recursive:true});
const output=await mkdtemp(join(parent,'clean-checkout-'));
for(const name of ['src','public','tests','scripts','.github','docs'])await cp(join(paths.candidate,name),join(directory,name),{recursive:true});
for(const name of ['package.json','package-lock.json','index.html','redirect.html','vite.config.ts','eslint.config.js','tsconfig.json','tsconfig.app.json','tsconfig.node.json','.gitignore'])await cp(join(paths.candidate,name),join(directory,name));
const env={...process.env,CAD_PYTHON:process.env.CAD_PYTHON??join(paths.local,'cad-tooling/Scripts/python.exe'),REQUIRE_LEGACY_FIXTURES:'0'};
for(const name of ['LINKAGE_CANDIDATE_DIR','LINKAGE_FIXTURE_DIR','LINKAGE_CLOUD_MOCK','VITE_BASE_PATH'])delete env[name];
execFileSync('git',['init','--initial-branch=codex/clean-verification'],{cwd:directory,windowsHide:true,stdio:'ignore'});
const npm=npmInvocation(),results=[];
async function command(label,args){
  const started=Date.now();let log='';
  const code=await new Promise((resolve,reject)=>{const child=spawn(npm.file,[...npm.prefix,...args],{cwd:directory,env,windowsHide:true,shell:npm.shell});child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});child.once('error',reject);child.once('exit',resolve);});
  await writeFile(join(output,label+'.log'),log);const result={label,code,elapsedMs:Date.now()-started};results.push(result);console.log(JSON.stringify(result));if(code!==0)throw new Error(label+' failed');
}
let failure;
try{
  await command('clean-ci',['ci','--legacy-peer-deps=false','--force=false','--no-fund']);
  await command('peer-validation',['ls','--all','--json']);
  await command('typecheck',['run','typecheck']);await command('lint',['run','lint']);
  await command('unit',['test']);await command('tooling',['run','test:tooling']);await command('build',['run','build']);await command('production-audit',['audit','--omit=dev','--json']);
  // No private data or original-fixture claims: explicit skipped assertions must remain visible.
  const unit=await readFile(join(output,'unit.log'),'utf8');
  const tests=Number(/\btests (\d+)/.exec(unit)?.[1]),passed=Number(/\bpass (\d+)/.exec(unit)?.[1]),skipped=Number(/\bskipped (\d+)/.exec(unit)?.[1]);
  if(tests<914||skipped!==15||passed+skipped!==tests)throw new Error('Expected preserved test coverage and exactly 15 explicit private-fixture skips in a clean public checkout.');
}catch(e){failure=e.stack;}
const report={directory,output,results,failure,passed:!failure,qualification:'Fresh temporary source checkout outside the workspace, no private fixtures/worktrees/runtime config or existing node_modules copied. CAD parser uses the explicitly configured pinned local Python runtime. Browser/download execution and GitHub-hosted CI are separate checks.'};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,directory,passed:report.passed,failure}));if(!report.passed)process.exitCode=1;
