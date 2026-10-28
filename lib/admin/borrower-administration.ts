import type { Borrower } from '@/lib/types/database'
export { canAdministerBankDirectory as canAdministerBorrowers } from '@/lib/admin/bank-directory'

export function borrowerSearchFilter(search: string): string {
  const literal = search.trim().replace(/[\\"%_]/g, character => `\\${character}`)
  return `tin_number.ilike."%${literal}%",name.ilike."%${literal}%"`
}

export type BorrowerDirectoryRecord = Borrower & { administration_revision: number; applications?: { count: number }[] }
export const BORROWER_FIELDS = {
  name: 255, legal_type: 50, tin_number: 50, registration_number: 100, customer_code: 50,
  sector_id: 36, address_street: 255, address_city: 100, address_district: 100, phone: 50, email: 255,
  legal_rep_surname: 100, legal_rep_name: 100, legal_rep_patronymic: 100, legal_rep_gender: 10,
  legal_rep_birthdate: 10, legal_rep_country_of_birth: 100, legal_rep_tin: 50, workforce_count: 10,
} as const
export type BorrowerField = keyof typeof BORROWER_FIELDS
export type BorrowerDraft = Record<BorrowerField, string>
export const BORROWER_IDENTITY_FIELDS: readonly BorrowerField[] = ['name', 'legal_type', 'tin_number', 'registration_number']
export const BORROWER_LEGAL_TYPES = ['individual', 'sole_proprietor', 'llc', 'jsc', 'cooperative', 'other'] as const
export function borrowerDraft(record: BorrowerDirectoryRecord): BorrowerDraft {
  return Object.fromEntries(Object.keys(BORROWER_FIELDS).map(field => [field, String(record[field as BorrowerField] ?? '')])) as BorrowerDraft
}
export function borrowerValues(draft: BorrowerDraft, record: BorrowerDirectoryRecord) {
  const values: Record<string, string | number | null> = {}
  for (const field of Object.keys(BORROWER_FIELDS) as BorrowerField[]) {
    const value = draft[field].trim()
    if (value.length > BORROWER_FIELDS[field]) return null
    if (field === 'workforce_count') {
      if (value && (!/^\d+$/.test(value) || Number(value) > 2147483647)) return null
      values[field] = value ? Number(value) : null
    } else values[field] = value || null
  }
  if (!values.name || !BORROWER_LEGAL_TYPES.some(type => type === values.legal_type)) return null
  for (const field of ['tin_number', 'legal_rep_tin'] as const) {
    if (values[field] && !/^\d{9}$/.test(String(values[field])) && values[field] !== record[field]) return null
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email)) && values.email !== record.email) return null
  if (values.legal_rep_gender && !['male', 'female'].includes(String(values.legal_rep_gender)) && values.legal_rep_gender !== record.legal_rep_gender) return null
  const birthdate = values.legal_rep_birthdate
  if (birthdate && birthdate !== record.legal_rep_birthdate) {
    const parsed = new Date(`${birthdate}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthdate)) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthdate || String(birthdate) < '1900-01-01' || parsed.getTime() > Date.now()) return null
  }
  if (values.sector_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(values.sector_id))) return null
  if ((record.applications?.[0]?.count ?? 0) > 0 && BORROWER_IDENTITY_FIELDS.some(field => values[field] !== record[field])) return null
  return values
}
export function confirmsBorrowerSave(data: unknown, id: string, revision: number, values: ReturnType<typeof borrowerValues>, deleting: boolean): boolean {
  if (!data || typeof data !== 'object') return false
  const receipt = data as Record<string, unknown>
  if (receipt.id !== id || receipt.deleted !== deleting) return false
  if (deleting) return receipt.record === null
  if (!receipt.record || typeof receipt.record !== 'object' || !values) return false
  const saved = receipt.record as Record<string, unknown>
  return saved.id === id && saved.administration_revision === revision + 1 && Object.entries(values).every(([key, value]) => saved[key] === value)
}

export const BORROWER_COPY = {
  en: {
    edit: 'Edit borrower directory', description: 'Update current directory information with an audited reason. Linked names, legal types, TINs and registration numbers are locked. Application snapshots and signed documents are not rewritten.',
    removeDescription: 'Delete only an unused borrower. Borrowers linked to applications cannot be deleted; audit history is retained.',
    invalid: 'Check required name and legal type, nine-digit TINs, email, birth date, whole nonnegative workforce and a reason of 3–2000 characters.',
    linked: 'This borrower is linked to applications. Identity changes and deletion are not allowed.', duplicate: 'This TIN or customer code is already assigned.',
    failed: 'The change was not saved. Check values and your administrator access.', saved: 'Borrower directory change saved',
    review: 'The result could not be confirmed. Refresh and review the directory before closing and reopening this editor. Your draft is retained.',
    stale: 'The borrower changed or was deleted. Close this editor and reopen the latest record before saving. Your draft is retained.',
    unavailable: 'Borrower information could not refresh. Editing is locked until a successful read.', refreshFailed: 'Saved, but the directory could not refresh. Reload before another change.',
    registered: 'Registered', matching: 'Matching borrowers', none: 'Not specified', linkedIdentity: 'Identity is locked because this borrower has applications.',
    individual: 'Individual', sole_proprietor: 'Sole proprietor', llc: 'Limited liability company', jsc: 'Joint-stock company', cooperative: 'Cooperative', other: 'Other', male: 'Male', female: 'Female',
    name: 'Name', legal_type: 'Legal type', tin_number: 'Borrower TIN', registration_number: 'Registration number', customer_code: 'Customer code', sector_id: 'Sector', address_street: 'Street address', address_city: 'City', address_district: 'District', phone: 'Phone', email: 'Email', legal_rep_surname: 'Representative surname', legal_rep_name: 'Representative first name', legal_rep_patronymic: 'Representative patronymic', legal_rep_gender: 'Representative gender', legal_rep_birthdate: 'Representative birth date', legal_rep_country_of_birth: 'Representative country of birth', legal_rep_tin: 'Representative TIN', workforce_count: 'Workforce count',
  },
  ru: {
    edit: 'Изменить сведения заёмщика', description: 'Измените текущие сведения с указанием причины для аудита. При наличии заявок имя, правовая форма, ИНН и регистрационный номер заблокированы. Снимки заявок и подписанные документы не меняются.',
    removeDescription: 'Удалить можно только заёмщика без заявок. История аудита сохраняется.',
    invalid: 'Проверьте имя и правовую форму, девятизначные ИНН, email, дату рождения, целую неотрицательную численность и причину длиной 3–2000 символов.',
    linked: 'У заёмщика есть заявки. Изменение идентификационных данных и удаление запрещены.', duplicate: 'Этот ИНН или код клиента уже используется.',
    failed: 'Изменение не сохранено. Проверьте значения и права администратора.', saved: 'Сведения заёмщика сохранены',
    review: 'Результат не подтверждён. Обновите и проверьте справочник, затем закройте и заново откройте редактор. Черновик сохранён.',
    stale: 'Заёмщик изменён или удалён. Закройте редактор и откройте актуальную запись перед сохранением. Черновик сохранён.',
    unavailable: 'Не удалось обновить сведения. Редактирование заблокировано до успешного чтения.', refreshFailed: 'Сохранено, но обновить справочник не удалось. Обновите данные перед следующим изменением.',
    registered: 'Зарегистрирован', matching: 'Найдено заёмщиков', none: 'Не указано', linkedIdentity: 'Идентификационные данные заблокированы: у заёмщика есть заявки.',
    individual: 'Физическое лицо', sole_proprietor: 'Индивидуальный предприниматель', llc: 'Общество с ограниченной ответственностью', jsc: 'Акционерное общество', cooperative: 'Кооператив', other: 'Другое', male: 'Мужской', female: 'Женский',
    name: 'Имя / наименование', legal_type: 'Правовая форма', tin_number: 'ИНН заёмщика', registration_number: 'Регистрационный номер', customer_code: 'Код клиента', sector_id: 'Отрасль', address_street: 'Улица, дом', address_city: 'Город', address_district: 'Район', phone: 'Телефон', email: 'Электронная почта', legal_rep_surname: 'Фамилия представителя', legal_rep_name: 'Имя представителя', legal_rep_patronymic: 'Отчество представителя', legal_rep_gender: 'Пол представителя', legal_rep_birthdate: 'Дата рождения представителя', legal_rep_country_of_birth: 'Страна рождения представителя', legal_rep_tin: 'ИНН представителя', workforce_count: 'Численность сотрудников',
  },
  tj: {
    edit: 'Таҳрири маълумоти қарзгир', description: 'Маълумоти ҷории маълумотномаро бо сабаби аудит тағйир диҳед. Ҳангоми мавҷуд будани ариза ном, шакли ҳуқуқӣ, РМА ва рақами бақайдгирӣ бастаанд. Нусхаҳои ариза ва ҳуҷҷатҳои имзошуда тағйир намеёбанд.',
    removeDescription: 'Танҳо қарзгири бе ариза ҳазф мешавад. Таърихи аудит нигоҳ дошта мешавад.',
    invalid: 'Ном ва шакли ҳуқуқӣ, РМА-и нӯҳрақама, почта, санаи таваллуд, шумораи бутуни ғайриманфии кормандон ва сабаби аз 3 то 2000 аломатро санҷед.',
    linked: 'Қарзгир аризаҳо дорад. Тағйири маълумоти мушаххаскунанда ва ҳазф манъ аст.', duplicate: 'Ин РМА ё рамзи муштарӣ аллакай истифода мешавад.',
    failed: 'Тағйирот сабт нашуд. Қиматҳо ва ҳуқуқи маъмурро санҷед.', saved: 'Маълумоти қарзгир сабт шуд',
    review: 'Натиҷа тасдиқ нашуд. Маълумотномаро нав ва санҷед, сипас муҳаррирро пӯшида боз кушоед. Сиёҳнавис нигоҳ дошта шуд.',
    stale: 'Қарзгир тағйир ё ҳазф шудааст. Пеш аз сабт муҳаррирро пӯшида сабти навро кушоед. Сиёҳнавис нигоҳ дошта шуд.',
    unavailable: 'Маълумот нав нашуд. Таҳрир то хондани муваффақ баста аст.', refreshFailed: 'Сабт шуд, вале маълумотнома нав нашуд. Пеш аз тағйироти дигар маълумотро нав кунед.',
    registered: 'Ба қайд гирифта шудааст', matching: 'Қарзгирони ёфтшуда', none: 'Муайян нашудааст', linkedIdentity: 'Маълумоти мушаххаскунанда баста аст: қарзгир аризаҳо дорад.',
    individual: 'Шахси воқеӣ', sole_proprietor: 'Соҳибкори инфиродӣ', llc: 'Ҷамъияти дорои масъулияти маҳдуд', jsc: 'Ҷамъияти саҳомӣ', cooperative: 'Кооператив', other: 'Дигар', male: 'Мард', female: 'Зан',
    name: 'Ном', legal_type: 'Шакли ҳуқуқӣ', tin_number: 'РМА-и қарзгир', registration_number: 'Рақами бақайдгирӣ', customer_code: 'Рамзи муштарӣ', sector_id: 'Соҳа', address_street: 'Кӯча ва хона', address_city: 'Шаҳр', address_district: 'Ноҳия', phone: 'Телефон', email: 'Почтаи электронӣ', legal_rep_surname: 'Насаби намоянда', legal_rep_name: 'Номи намоянда', legal_rep_patronymic: 'Номи падари намоянда', legal_rep_gender: 'Ҷинси намоянда', legal_rep_birthdate: 'Санаи таваллуди намоянда', legal_rep_country_of_birth: 'Кишвари таваллуди намоянда', legal_rep_tin: 'РМА-и намоянда', workforce_count: 'Шумораи кормандон',
  },
} as const
