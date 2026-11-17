import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRevision,revisionUrl,artifactUrl} from '../web/revision-core.mjs';
const catalog={current:'current',versions:[{id:'revD',artifacts:{model:'review/revD/board.glb',assembly:null}},{id:'current',artifacts:{model:'board.glb',assembly:'files/assembly-DRAFT.zip'}}]};
test('Explicit revision wins; absent selection defaults to current',()=>{
  assert.equal(selectRevision(catalog,'?rev=revD').id,'revD');assert.equal(selectRevision(catalog,'').id,'current');
});
test('Invalid or empty revision fails closed without fallback',()=>{
  assert.throws(()=>selectRevision(catalog,'?rev=missing'),/Unknown revision/);assert.throws(()=>selectRevision(catalog,'?rev='),/Unknown revision/);
});
test('Navigation retains page, other parameters and anchor',()=>{
  assert.equal(revisionUrl('explore.html?view=model#inspect','revD','http://127.0.0.1/project/index.html'),'http://127.0.0.1/project/explore.html?view=model&rev=revD#inspect');
});
test('Unavailable historical artifact never resolves to current',()=>{
  assert.equal(artifactUrl(catalog.versions[0],'assembly'),null);assert.equal(artifactUrl(catalog.versions[0],'model'),'review/revD/board.glb');
});
test('Artifact paths stay within the generated site',()=>{
  for(const path of ['../source.zip','https://remote/model.glb','/board.glb','folder\\board.glb'])assert.throws(()=>artifactUrl({artifacts:{model:path}},'model'),/Unsafe/);
});
