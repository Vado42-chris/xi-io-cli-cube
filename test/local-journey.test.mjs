import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/LocalJourneyControls.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
test('existing steps bind finite local actions, selected workspace and exact review',()=>{
 for(const action of ['local_ai_status','safe_task_prepare','safe_task_apply'])assert.ok(source.includes(action));
 assert.match(source,/approval_digest:review.approval_digest,approved:true/);
 assert.match(source,/disabled=\{busy\|\|!approved\|\|attempted\|\|!reviewMatches\|\|!eligible\}/);
 assert.match(source,/setAttempted\(true\)/);
 assert.match(source,/context.current!==requestedContext/);
 assert.match(source,/review\?\.plan_id===planId&&review\?\.workspace===workspace/);
 for(const step of [4,5])assert.ok(app.includes(`LocalJourneyControls step={${step}} workspace={selectedFolder}`));
 assert.doesNotMatch(app,/Apply Example \(No File Write\)|Preview example:/);
});
test('source explicitly separates local observation from authority and inference',()=>{
 assert.match(source,/No model load, download, runtime startup, inference/);
 assert.match(source,/not command-sandbox, remote BINS or Ward admission proof/);
 assert.match(source,/No browser example is treated as a real test/);
 assert.match(source,/remaining fixture is preserved/);
 assert.match(source,/attempted&&\(error\|\|result\?\.do_not_retry\)/);
});

test('journey navigation is numbered, not evidence-derived success',()=>{
 const navigation=app.slice(app.indexOf('{/* Step Indicators */}'),app.indexOf('{/* STEP 1:'));
 assert.doesNotMatch(navigation,/journeyStep > s|text-workspace-success|✓/);
 assert.match(navigation,/Navigation only — not a completed check/);
 assert.match(navigation,/aria-current=\{journeyStep === s/);
});
