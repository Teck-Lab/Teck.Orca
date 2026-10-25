import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ambientRoutingReport} from '../runtime/kubernetes/preflight.mjs';

test('healthy controllers and iptables do not imply that ambient IPv4 routing is supported',()=>{
  const report=ambientRoutingReport('# CONFIG_IP_ADVANCED_ROUTER is not set\nCONFIG_FIB_RULES=y\nCONFIG_IP_NF_IPTABLES=y\n',{ok:false,error:'Rule family not supported'});
  assert.equal(report.ok,false);assert.ok(report.missing.includes('CONFIG_IP_ADVANCED_ROUTER'));
  assert.match(report.error,/kernel|routing/i);
});
test('ambient routing requires a successful live routing probe even with compiled kernel support',()=>{
  const config='CONFIG_IP_ADVANCED_ROUTER=y\nCONFIG_IP_MULTIPLE_TABLES=y\nCONFIG_FIB_RULES=y\n';
  assert.equal(ambientRoutingReport(config,{ok:true}).ok,true);
  assert.equal(ambientRoutingReport(config,{ok:false,error:'Operation not permitted'}).ok,false);
  assert.equal(ambientRoutingReport(config,undefined).ok,false);
});
test('an unreadable config is not treated as a known unsupported kernel',()=>{
  const report=ambientRoutingReport(undefined,{ok:true});assert.equal(report.ok,true);assert.equal(report.configAvailable,false);
  assert.equal(ambientRoutingReport(undefined,{ok:false,error:'unavailable'}).ok,false);
});
test('known disabled routing support cannot be hidden by a successful stale probe',()=>{
  assert.equal(ambientRoutingReport('# CONFIG_IP_MULTIPLE_TABLES is not set\n',{ok:true}).ok,false);
});
