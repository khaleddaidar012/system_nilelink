const storageKey = 'nilelink-accounting-prototype-v1'
const stageInfo = [
  { name: 'الشحن', description: 'سجل تكاليف الخط الملاحي وخدمات الشحن البحري.', kicker: '01 / OCEAN FREIGHT' },
  { name: 'النقل', description: 'أضف تكاليف نقل الحاويات والخدمات البرية.', kicker: '02 / INLAND TRANSPORT' },
  { name: 'التخليص الجمركي', description: 'راجع رسوم التخليص والمستندات والخدمات المرتبطة.', kicker: '03 / CUSTOMS CLEARANCE' },
]
function initialState() {
  return { selected: 0, internalSale: 0, published: false, publishedAt: null,
    stages: stageInfo.map(() => ({ supplier: '', reference: '', completed: false, lines: [] })),
    history: [{ text: 'إنشاء مسودة داخلية للشحنة NL-260184', at: new Date().toISOString() }] }
}
function validState(value) {
  return value && Number.isInteger(value.selected) && value.selected >= 0 && value.selected < 3 && typeof value.published === 'boolean' && Array.isArray(value.stages) && value.stages.length === 3 && value.stages.every(stage => typeof stage.supplier === 'string' && typeof stage.reference === 'string' && typeof stage.completed === 'boolean' && Array.isArray(stage.lines) && stage.lines.every(line => typeof line.name === 'string' && Number.isFinite(line.cost) && line.cost >= 0 && Number.isFinite(line.sale) && line.sale >= 0)) && Array.isArray(value.history)
}
let state = initialState()
try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (validState(saved)) state = saved } catch {}
if (!Number.isFinite(state.internalSale)) state.internalSale = totalSavedSale(state)
function totalSavedSale(value) { return value.stages.reduce((sum, stage) => sum + stage.lines.reduce((n, line) => n + line.sale, 0), 0) }
let role = 'admin'
const $ = id => document.getElementById(id)
const money = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value)
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
const sum = (stage, key) => stage.lines.reduce((total, line) => total + Math.round(line[key] * 100), 0) / 100
const total = key => state.stages.reduce((result, stage) => result + Math.round(sum(stage, key) * 100), 0) / 100
const allComplete = () => state.stages.every(stage => stage.completed && stage.lines.length)
let toastTimer
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500) }
function save() { try { localStorage.setItem(storageKey, JSON.stringify(state)) } catch { toast('تعذر الحفظ في المتصفح. التغييرات متاحة خلال الجلسة الحالية.') } }
function log(text) { state.history.unshift({ text, at: new Date().toISOString() }); state.history = state.history.slice(0, 30) }
function commit(text) { if (text) log(text); save(); render() }
function render() {
  const stage = state.stages[state.selected]
  const editable = !state.published && !stage.completed
  const completed = state.stages.filter(item => item.completed).length
  $('cost-total').innerHTML = money(total('cost')) + '<em>EGP</em>'
  $('sales-total').innerHTML = money(total('sale')) + '<em>EGP</em>'
  $('profit-total').innerHTML = money(state.internalSale - total('cost')) + '<em>EGP</em>'
  $('margin').textContent = `${state.internalSale ? ((state.internalSale - total('cost')) / state.internalSale * 100).toFixed(1) : '0'}% من سعر البيع الداخلي`
  $('completed-total').textContent = `${completed} / 3`
  $('progress-text').textContent = `${completed} من 3 مكتملة`
  $('steps').innerHTML = stageInfo.map((info, index) => `<button class="step ${index === state.selected ? 'selected' : ''} ${state.stages[index].completed ? 'finished' : ''}" data-stage="${index}" aria-pressed="${index === state.selected}"><span class="step-number">${state.stages[index].completed ? '✓' : String(index + 1).padStart(2, '0')}</span><span><strong>${info.name}</strong><small>${state.stages[index].completed ? 'مكتملة' : index === 0 || state.stages[index - 1].completed ? 'قيد التجهيز' : 'بانتظار المرحلة السابقة'}</small></span></button>`).join('')
  $('stage-kicker').textContent = stageInfo[state.selected].kicker
  $('stage-title').textContent = `تفاصيل مرحلة ${stageInfo[state.selected].name}`
  $('stage-description').textContent = stageInfo[state.selected].description
  $('stage-badge').textContent = state.published ? 'منشورة' : stage.completed ? 'مكتملة' : 'مسودة'
  $('stage-badge').className = `pill ${stage.completed ? 'done' : 'draft'}`
  $('internal-sale').value = state.internalSale || ''
  $('internal-sale').disabled = state.published
  $('supplier').value = stage.supplier
  $('reference').value = stage.reference
  $('supplier').disabled = !editable
  $('reference').disabled = !editable
  $('line-items').innerHTML = stage.lines.map((line, index) => `<tr><td>${escapeHtml(line.name)}</td><td data-admin-only>${money(line.cost)}</td><td>${money(line.sale)}</td><td class="profit" data-admin-only>${money(line.sale - line.cost)}</td><td><button class="delete-line" data-delete="${index}" aria-label="حذف ${escapeHtml(line.name)}" ${editable ? '' : 'disabled'}>×</button></td></tr>`).join('') || '<tr><td colspan="5">أضف أول بند لهذه المرحلة.</td></tr>'
  $('add-line').hidden = !editable
  $('stage-total').textContent = `${money(sum(stage, 'sale'))} EGP`
  $('complete-stage').textContent = stage.completed ? 'إعادة فتح المرحلة للتعديل' : '✓ إكمال المرحلة'
  $('complete-stage').disabled = state.published || (!stage.completed && (!stage.lines.length || (state.selected > 0 && !state.stages[state.selected - 1].completed)))
  $('invoice-lines').innerHTML = stageInfo.map((info, index) => `<div class="invoice-line"><span>${info.name}</span><b>${money(sum(state.stages[index], 'sale'))}</b></div>`).join('')
  $('invoice-total').textContent = money(total('sale'))
  $('invoice-badge').textContent = state.published ? 'منشورة' : 'DRAFT · داخلية'
  $('invoice-badge').className = `pill ${state.published ? 'done' : 'draft'}`
  $('shipment-status').textContent = state.published ? 'الفاتورة منشورة' : 'DRAFT · فاتورة مسودة'
  $('shipment-status').className = `pill ${state.published ? 'done' : 'draft'}`
  $('invoice-number').textContent = state.published ? 'INV-DEMO-2026-001' : 'DRAFT-NL-260184'
  $('review-invoice').disabled = state.published || !allComplete()
  $('review-invoice').innerHTML = state.published ? '✓ تم نشر الفاتورة' : 'مراجعة ونشر الفاتورة <span>↗</span>'
  $('publish-note').textContent = state.published ? 'تم تثبيت البنود والأسعار بعد النشر' : allComplete() ? 'اكتملت المراحل. الفاتورة جاهزة للمراجعة.' : 'أكمل المراحل الثلاث لتفعيل النشر'
  $('visibility-title').textContent = state.published ? 'الفاتورة متاحة للعميل' : 'العميل لا يرى المسودة'
  $('visibility-detail').textContent = state.published ? 'افتح معاينة العميل لمشاهدة الفاتورة المنشورة. النشر هنا محاكاة محلية.' : 'DRAFT · متاحة للموظفين داخليًا حتى ينشر الأدمن الفاتورة للعميل.'
  $('history').innerHTML = state.history.slice(0, 5).map(event => `<div class="history-entry"><span>${escapeHtml(event.text)}</span><time>${escapeHtml(new Date(event.at).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true }))}</time></div>`).join('')
  document.querySelectorAll('[data-admin-only]').forEach(element => { element.hidden = role !== 'admin' })
  $('item-cost').required = role === 'admin'
  $('review-invoice').hidden = role !== 'admin'
  document.querySelector('.history-panel').hidden = role !== 'admin'
  document.querySelector('.content-grid').hidden = role === 'customer'
  document.querySelector('.metrics').hidden = role === 'customer'
  $('reset').hidden = role !== 'admin'
  $('customer-view').hidden = role !== 'customer'
  if (role === 'customer') {
    $('customer-preview').click()
    $('customer-view').innerHTML = $('customer-content').innerHTML
    $('customer-dialog').close()
    $('shipment-status').textContent = state.published ? 'الفاتورة منشورة' : 'لا توجد فاتورة منشورة'
  }
}
$('role').addEventListener('change', () => { role = $('role').value; render() })
$('internal-sale').addEventListener('change', () => {
  if (role !== 'admin' || state.published) return
  const value = Number($('internal-sale').value)
  if (!Number.isFinite(value) || value < 0 || value > 1000000000) { render(); toast('أدخل سعر بيع صحيحًا'); return }
  state.internalSale = Math.round(value * 100) / 100
  commit('تحديث بيانات التسعير الداخلية')
})
$('steps').addEventListener('click', event => { const button = event.target.closest('[data-stage]'); if (button) { state.selected = Number(button.dataset.stage); $('add-line').reset(); save(); render() } })
$('line-items').addEventListener('click', event => { const button = event.target.closest('[data-delete]'); const stage = state.stages[state.selected]; if (!button || state.published || stage.completed) return; const [line] = stage.lines.splice(Number(button.dataset.delete), 1); commit(`حذف بند ${line.name} من مرحلة ${stageInfo[state.selected].name}`) })
$('add-line').addEventListener('submit', event => {
  event.preventDefault()
  const stage = state.stages[state.selected]
  if (state.published || stage.completed) return
  const name = $('item-name').value.trim()
  const cost = role === 'admin' ? Number($('item-cost').value) : 0
  const sale = Number($('item-sale').value)
  if (!name || !Number.isFinite(cost) || !Number.isFinite(sale) || cost < 0 || sale < 0) { toast('أدخل وصف البند ومبالغ صحيحة.'); return }
  stage.lines.push({ name, cost: Math.round(cost * 100) / 100, sale: Math.round(sale * 100) / 100 })
  $('add-line').reset()
  commit(`إضافة ${name} إلى مرحلة ${stageInfo[state.selected].name}`)
  toast('تمت إضافة البند إلى مسودة الفاتورة')
})
for (const key of ['supplier', 'reference']) $(key).addEventListener('change', () => { const stage = state.stages[state.selected]; if (state.published || stage.completed) return; stage[key] = $(key).value.trim(); commit(`تحديث ${key === 'supplier' ? 'المورد' : 'مرجع المستند'} لمرحلة ${stageInfo[state.selected].name}`) })
$('complete-stage').addEventListener('click', () => {
  if (state.published) return
  const stage = state.stages[state.selected]
  if (stage.completed) {
    state.stages.slice(state.selected).forEach(item => { item.completed = false })
    commit(`إعادة فتح مرحلة ${stageInfo[state.selected].name} ومراجعة المراحل التالية`)
    toast('تم فتح المرحلة. يلزم تأكيد المراحل التالية مجددًا.')
  } else {
    if (!stage.lines.length || (state.selected > 0 && !state.stages[state.selected - 1].completed)) return
    stage.completed = true
    log(`إكمال مرحلة ${stageInfo[state.selected].name}`)
    if (state.selected < 2) state.selected++
    commit()
    toast(allComplete() ? 'اكتملت المراحل. يمكنك مراجعة الفاتورة ونشرها.' : 'تم إكمال المرحلة والانتقال إلى التالية')
  }
})
$('review-invoice').addEventListener('click', () => {
  if (role !== 'admin' || state.published || !allComplete()) return
  $('confirm-review').checked = false
  $('publish-confirm').disabled = true
  $('review-summary').innerHTML = stageInfo.map((info, index) => `<div class="review-row"><span>✓ ${info.name}</span><b>${money(sum(state.stages[index], 'sale'))} EGP</b></div>`).join('') + `<div class="review-row"><strong>الإجمالي</strong><b>${money(total('sale'))} EGP</b></div>`
  $('review-dialog').showModal()
})
$('confirm-review').addEventListener('change', () => { $('publish-confirm').disabled = !$('confirm-review').checked })
$('publish-confirm').addEventListener('click', () => {
  if (role !== 'admin' || state.published || !allComplete() || !$('confirm-review').checked) return
  state.published = true
  state.publishedAt = new Date().toISOString()
  commit('نشر الفاتورة INV-DEMO-2026-001 وإتاحتها للعميل')
  $('review-dialog').close()
  toast('تم نشر الفاتورة التجريبية. يمكنك معاينة نسخة العميل.')
})
$('customer-preview').addEventListener('click', () => {
  $('customer-content').innerHTML = state.published ? `<div class="invoice-brand">NILELINK<span>LOGISTICS</span></div><div class="invoice-client"><small>فاتورة INV-DEMO-2026-001</small><strong>شركة النخيل للتصدير</strong><span>NL-260184 · دمياط ← الدار البيضاء</span><span>تاريخ النشر ${escapeHtml(new Date(state.publishedAt).toLocaleDateString('ar-EG'))}</span></div>${state.stages.map((stage, index) => `<h3>${stageInfo[index].name}</h3>${stage.lines.map(line => `<div class="invoice-line"><span>${escapeHtml(line.name)}</span><b>${money(line.sale)} EGP</b></div>`).join('')}`).join('')}<div class="invoice-total"><span>الإجمالي المستحق</span><strong>${money(total('sale'))} EGP</strong></div><p class="tax-note">نسخة تجريبية لعرض الفكرة · بدون ضرائب</p>` : '<div class="customer-empty"><strong>لا توجد فاتورة منشورة بعد</strong>الفاتورة ما زالت مسودة داخلية حتى تعتمدها الإدارة وتنشرها.</div>'
  $('customer-dialog').showModal()
})
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()))
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close() } }))
$('reset').addEventListener('click', () => { if (!confirm('إعادة البيانات التجريبية وحذف تعديلاتك على هذا التصور؟')) return; state = initialState(); $('add-line').reset(); save(); render(); toast('تمت إعادة التجربة') })
render()
