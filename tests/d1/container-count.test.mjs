import test from 'node:test'
import assert from 'node:assert/strict'
import {normaliseContainerCount,requestContainerCount} from '../../lib/requests/container-count.ts'
test('container count accepts safe positive integers and Arabic digits without multiplying per service',()=>{
 for(const [input,expected] of [[1,1],[10,10],['٢٥',25],['۱۲',12]])assert.equal(normaliseContainerCount(input),expected)
 for(const value of [0,-1,1.5,'abc','1e3',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>normaliseContainerCount(value))
 assert.equal(requestContainerCount({services:[{details:{containerCount:3}},{details:{containerCount:3}}]}),3)
 assert.throws(()=>requestContainerCount({containerCount:4,services:[{details:{containerCount:3}}]}))
 assert.equal(requestContainerCount({}),undefined)
})
