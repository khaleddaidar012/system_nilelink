import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {messageReceipt} from '../../lib/chat/receipts.ts'
import {MessageReceipt} from '../../components/chat/MessageReceipt.tsx'
test('old read markers imply delivery and missing acknowledgements never imply online presence',()=>{
  assert.equal(messageReceipt(5,'a',[{userId:'b',sequence:4}]),'sent')
  assert.equal(messageReceipt(5,'a',[{userId:'b',sequence:5}]),'read')
  assert.equal(messageReceipt(5,'a',[{userId:'b',sequence:4,deliveredSequence:5}]),'delivered')
  assert.equal(messageReceipt(5,'a',[],['b']),'sent')
})
test('sent and delivered checks are grey while double read checks are blue',()=>{
  const sent=renderToStaticMarkup(createElement(MessageReceipt,{status:'sent',ar:true}))
  const delivered=renderToStaticMarkup(createElement(MessageReceipt,{status:'delivered',ar:true}))
  const read=renderToStaticMarkup(createElement(MessageReceipt,{status:'read',ar:true}))
  assert.match(sent,/lucide-check /);assert.doesNotMatch(sent,/lucide-check-check/)
  assert.match(delivered,/lucide-check-check/);assert.match(delivered,/text-slate-300/)
  assert.match(read,/lucide-check-check/);assert.match(read,/text-blue-300/)
  assert.match(sent,/تم الإرسال ولم يُستلم بعد/);assert.match(delivered,/تم الاستلام/);assert.match(read,/تمت القراءة/)
})
