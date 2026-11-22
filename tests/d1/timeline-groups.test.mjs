import test from 'node:test'
import assert from 'node:assert/strict'
import {groupTimelineEvents} from '../../lib/requests/timeline-groups.ts'

test('legacy service stages leave general history and retain their records exactly',()=>{
 const titles=['Request Submitted by Client','Document Required','Document Submitted','Direct processing','Documents Approved','Responsible employee assigned','Quotation required','Quote Provided','Quote Accepted','Order Confirmed & Processing Started','تم إنجاز: سحب الحاوية من الميناء','تم إنجاز: الوصول إلى المصنع','تحديث مرحلة: مغادرة المصنع','تم إنجاز: مغادرة المصنع','تم إنجاز: الرجوع إلى الميناء','تم تعيين UCR / UCR provided','تم إنجاز: الحصول على رقم UCR','تم إنجاز: فتح شهادة الاستيراد (نموذج 46)','تم إنجاز: كشف المعاينة الجمركية','تم إنجاز: تسليم إذن الإفراج','تم إنجاز: إرفاق المستندات الختامية','تم إنجاز: استلام البضاعة في الميناء','تم إنجاز: تحميل على السفينة','تم إنجاز: مغادرة ميناء الشحن','تم إنجاز: في عرض البحر','تم إنجاز: الوصول إلى ميناء الوجهة','تم إنجاز: تسليم الشحنة']
 const events=titles.map((title,i)=>({title,eventId:String(i),createdAt:new Date(2026,0,1,0,i).toISOString(),comment:i===13?'Customer-visible note':undefined}))
 const before=structuredClone(events)
 const groups=groupTimelineEvents(events,[{serviceKey:'inland_transportation'},{serviceKey:'customs_clearance'},{serviceKey:'sea_freight'}])
 assert.equal(groups.get('general').length,10)
 assert.equal(groups.get('inland_transportation').length,5)
 assert.equal(groups.get('customs_clearance').length,6)
 assert.equal(groups.get('sea_freight').length,6)
 assert.equal([...groups.values()].flat().length,27)
 assert.equal(groups.get('inland_transportation')[3],events[13])
 assert.deepEqual(events,before)
})
test('ambiguous legacy labels require contiguous evidence and do not guess after general events',()=>{
 const services=[{serviceKey:'sea_freight'},{serviceKey:'air_freight'}]
 const events=[{title:'تم إنجاز: تسليم الشحنة'},{title:'تم إنجاز: الوصول إلى ميناء الوجهة'},{title:'تم إنجاز: تسليم الشحنة'},{title:'Unrelated event'},{title:'تم إنجاز: تسليم الشحنة'}]
 const groups=groupTimelineEvents(events,services)
 assert.deepEqual(groups.get('sea_freight'),events.slice(1,3))
 assert.deepEqual(groups.get('general'),[events[0],events[3],events[4]])
})
test('explicit service metadata wins and aliases share one section; unknown history stays general',()=>{
 const events=[{title:'Different label',serviceKey:'ocean_freight'},{title:'Other event',serviceKey:'sea_freight'},{title:'Document Required'},{title:'تم إنجاز: استلام البضاعة في الميناء'}]
 const groups=groupTimelineEvents(events)
 assert.deepEqual(groups.get('sea_freight'),events.slice(0,2))
 assert.deepEqual(groups.get('general'),events.slice(2))
})
