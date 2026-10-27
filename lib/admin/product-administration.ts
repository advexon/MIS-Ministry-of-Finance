export { canAdministerBankDirectory as canAdministerProducts } from '@/lib/admin/bank-directory'

export interface ProductRecord {
  id: string
  code: string
  name_en: string
  name_ru: string | null
  name_tj: string | null
  guarantee_coverage: number | null
  is_active: boolean | null
  administration_revision: number
  upfront_fee_rate: number | null
  quarterly_fee_rate: number | null
}

export const PRODUCT_COLUMNS = 'id,code,name_en,name_ru,name_tj,guarantee_coverage,is_active,administration_revision,upfront_fee_rate,quarterly_fee_rate'
export const EMPTY_PRODUCT = { code: '', name_en: '', name_ru: '', name_tj: '', guarantee_coverage: '', is_active: true }
export type ProductDraft = typeof EMPTY_PRODUCT

export function productValues(draft: ProductDraft) {
  if (!draft.code.trim() || draft.code.trim().length > 50 || !draft.name_en.trim() || [draft.name_en, draft.name_ru, draft.name_tj].some(value => value.trim().length > 255)) return null
  const rawCoverage = draft.guarantee_coverage.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(rawCoverage)) return null
  const coverage = Number(rawCoverage)
  if (!Number.isFinite(coverage) || coverage < 0.01 || coverage > 100) return null
  return { code: draft.code.trim().toUpperCase(), name_en: draft.name_en.trim(), name_ru: draft.name_ru.trim() || null, name_tj: draft.name_tj.trim() || null, guarantee_coverage: coverage, is_active: draft.is_active }
}

export function confirmsProductSave(data: unknown, id: string, revision: number | null, values: ReturnType<typeof productValues>, deleting: boolean): data is { id: string; deleted: boolean; record: ProductRecord | null } {
  if (!data || typeof data !== 'object') return false
  const receipt = data as Record<string, unknown>
  if (receipt.id !== id || receipt.deleted !== deleting) return false
  if (deleting) return receipt.record === null
  if (!receipt.record || typeof receipt.record !== 'object' || !values) return false
  const record = receipt.record as Record<string, unknown>
  return record.id === id && record.administration_revision === (revision === null ? 0 : revision + 1) &&
    Object.entries(values).every(([key, value]) => record[key] === value)
}

export const PRODUCT_COPY = {
  en: {
    title: 'Loan products', add: 'Add product', edit: 'Edit product', coverage: 'Default coverage (%)',
    description: 'Configure names, coverage defaults and availability. Every change requires a reason and an immutable before/after audit.',
    effect: 'Coverage is a default for new application selections, not a mandatory ceiling. Existing application terms, explicit coverage entries and signed guarantees are unchanged. Deactivated products are unavailable for new selections.',
    fees: 'Fees are calculated from Financial Policy, not legacy per-product rates. Legacy rates are retained read-only; new products have no legacy fee rates.',
    legacyUpfront: 'Legacy upfront rate (unused fraction)', legacyQuarterly: 'Legacy quarterly rate (unused fraction)',
    empty: 'No products registered.', invalid: 'Enter a code, English name, coverage from 0.01 to 100 with up to two decimals, and a reason of 3–2000 characters.',
    linked: 'This product has applications and cannot be deleted. Deactivate it instead.', duplicate: 'This product code already exists. Choose a different code.',
    review: 'The result could not be confirmed. Refresh, review the saved directory and close this dialog before starting another change.',
    stale: 'This product changed. Your draft is retained. Close the dialog and reopen the latest product before saving.',
    failed: 'Product change was not saved. Review the values and try again.', saved: 'Product change saved',
    refreshFailed: 'Saved, but products could not refresh. Reload before another change.', loadFailed: 'Products could not load. Refresh is required before editing.',
    refreshFailedDraft: 'Refresh failed. Your draft is retained; saving is locked until a successful refresh.',
    removeDescription: 'Only products without applications can be deleted. Deactivation preserves application links and financial history.',
  },
  ru: {
    title: 'Кредитные продукты', add: 'Добавить продукт', edit: 'Изменить продукт', coverage: 'Покрытие по умолчанию (%)',
    description: 'Настройте названия, покрытие по умолчанию и доступность. Требуется причина; аудит до и после изменения неизменяем.',
    effect: 'Покрытие — значение по умолчанию при выборе продукта в новой заявке, а не обязательный предел. Условия существующих заявок, явно заданное покрытие и подписанные гарантии не меняются. Неактивные продукты недоступны для нового выбора.',
    fees: 'Комиссии рассчитываются по финансовой политике, а не по старым ставкам продукта. Старые ставки доступны только для чтения; у новых продуктов они отсутствуют.',
    legacyUpfront: 'Старая разовая ставка (неиспользуемая доля)', legacyQuarterly: 'Старая квартальная ставка (неиспользуемая доля)',
    empty: 'Продукты не зарегистрированы.', invalid: 'Укажите код, английское название, покрытие от 0,01 до 100 с точностью до двух знаков и причину длиной 3–2000 символов.',
    linked: 'У продукта есть заявки: удаление невозможно. Используйте деактивацию.', duplicate: 'Такой код продукта уже существует. Укажите другой код.',
    review: 'Результат не подтверждён. Обновите и проверьте справочник, затем закройте окно перед следующим изменением.',
    stale: 'Продукт изменён. Черновик сохранён. Закройте окно и откройте актуальную запись перед сохранением.',
    failed: 'Изменение продукта не сохранено. Проверьте значения и повторите попытку.', saved: 'Изменение продукта сохранено',
    refreshFailed: 'Сохранено, но обновить продукты не удалось. Обновите данные перед следующим изменением.', loadFailed: 'Не удалось загрузить продукты. Перед редактированием обновите данные.',
    refreshFailedDraft: 'Обновление не удалось. Черновик сохранён; сохранение заблокировано до успешного обновления.',
    removeDescription: 'Удаляются только продукты без заявок. Деактивация сохраняет связи с заявками и финансовую историю.',
  },
  tj: {
    title: 'Маҳсулоти қарзӣ', add: 'Иловаи маҳсулот', edit: 'Таҳрири маҳсулот', coverage: 'Пӯшиши пешфарз (%)',
    description: 'Номҳо, пӯшиши пешфарз ва дастрасиро танзим кунед. Сабаб ҳатмист; аудити пеш ва пас аз тағйирот тағйирнопазир аст.',
    effect: 'Пӯшиш ҳангоми интихоби маҳсулот дар аризаи нав пешфарз аст, на ҳадди ҳатмӣ. Шартҳои аризаҳои мавҷуда, пӯшиши возеҳ воридшуда ва кафолатҳои имзошуда тағйир намеёбанд. Маҳсулоти ғайрифаъол барои интихоби нав дастрас нестанд.',
    fees: 'Ҳаққи хизмат аз сиёсати молиявӣ ҳисоб мешавад, на аз меъёрҳои кӯҳнаи маҳсулот. Меъёрҳои кӯҳна танҳо хонда мешаванд; маҳсулоти нав чунин меъёр надоранд.',
    legacyUpfront: 'Меъёри кӯҳнаи якдафъаина (ҳиссаи истифоданашаванда)', legacyQuarterly: 'Меъёри кӯҳнаи семоҳа (ҳиссаи истифоданашаванда)',
    empty: 'Маҳсулот сабт нашудааст.', invalid: 'Рамз, номи англисӣ, пӯшиш аз 0,01 то 100 бо то ду рақами касрӣ ва сабаби аз 3 то 2000 аломатро ворид кунед.',
    linked: 'Маҳсулот аризаҳо дорад ва ҳазф намешавад. Онро ғайрифаъол кунед.', duplicate: 'Ин рамзи маҳсулот аллакай мавҷуд аст. Рамзи дигарро интихоб кунед.',
    review: 'Натиҷа тасдиқ нашуд. Маълумотномаро нав ва санҷед, сипас пеш аз тағйироти дигар равзанаро пӯшед.',
    stale: 'Маҳсулот тағйир ёфтааст. Сиёҳнавис нигоҳ дошта шуд. Равзанаро пӯшед ва пеш аз сабт маълумоти навро кушоед.',
    failed: 'Тағйироти маҳсулот сабт нашуд. Қиматҳоро санҷида, такрор кунед.', saved: 'Тағйироти маҳсулот сабт шуд',
    refreshFailed: 'Сабт шуд, вале маҳсулот нав нашуд. Пеш аз тағйироти дигар маълумотро нав кунед.', loadFailed: 'Маҳсулот бор нашуд. Пеш аз таҳрир навсозӣ зарур аст.',
    refreshFailedDraft: 'Навсозӣ ноком шуд. Сиёҳнавис нигоҳ дошта шуд; сабт то навсозии муваффақ баста аст.',
    removeDescription: 'Танҳо маҳсулоти бе ариза ҳазф мешаванд. Ғайрифаъолсозӣ робитаҳои аризаҳо ва таърихи молиявиро нигоҳ медорад.',
  },
} as const
