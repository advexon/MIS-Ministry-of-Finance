import type { Profile, Role } from '@/lib/types/database'

export interface BankDirectoryRecord {
  id: string
  code: string
  name_en: string
  name_ru: string | null
  name_tj: string | null
  is_active: boolean | null
  administration_revision: number
  bank_id?: string
  city?: string | null
  district?: string | null
}

export function canAdministerBankDirectory(profile: Pick<Profile, 'is_active' | 'bank_id'> | null, role: Pick<Role, 'code' | 'tier' | 'is_active'> | null) {
  return profile?.is_active === true && !profile.bank_id && role?.is_active === true &&
    ((role.code === 'super_admin' && role.tier === 1) || (role.code === 'prsf_admin' && role.tier === 2))
}

export const BANK_DIRECTORY_COPY = {
  en: {
    bank: 'Bank', branch: 'Branch', addBank: 'Add bank', editBank: 'Edit bank', addBranch: 'Add branch', editBranch: 'Edit branch',
    branches: 'Branches', code: 'Code', name_en: 'Name (English)', name_ru: 'Name (Russian)', name_tj: 'Name (Tajik)', city: 'City', district: 'District',
    active: 'Active', inactive: 'Inactive', reason: 'Change reason', confirm: 'I confirm this exact change and its audit reason.',
    save: 'Save changes', saving: 'Saving…', cancel: 'Cancel', edit: 'Edit', remove: 'Delete unused record', back: 'Back to editing',
    description: 'Changes require a reason and are saved with an immutable before/after audit. Deactivation preserves linked history.',
    deleteDescription: 'Only unused records can be deleted. Assigned users, financial records and bank branches prevent removal. Deactivate linked records instead.',
    saved: 'Directory change saved', failed: 'Directory change not confirmed', invalid: 'Code, English name and a reason of 3–2000 characters are required.',
    stale: 'This record changed. Close this dialog, refresh the directory, and reopen it before saving.',
    unconfirmed: 'The response did not confirm this change. Refresh the directory before retrying.', refreshFailed: 'Saved, but the directory could not refresh. Reload to see the saved record.',
    empty: 'No branches registered.', loadFailed: 'The directory could not load.', refresh: 'Refresh', status: 'Status', actions: 'Actions',
  },
  ru: {
    bank: 'Банк', branch: 'Филиал', addBank: 'Добавить банк', editBank: 'Изменить банк', addBranch: 'Добавить филиал', editBranch: 'Изменить филиал',
    branches: 'Филиалы', code: 'Код', name_en: 'Название (английский)', name_ru: 'Название (русский)', name_tj: 'Название (таджикский)', city: 'Город', district: 'Район',
    active: 'Активен', inactive: 'Неактивен', reason: 'Причина изменения', confirm: 'Подтверждаю это изменение и указанную причину.',
    save: 'Сохранить', saving: 'Сохранение…', cancel: 'Отмена', edit: 'Изменить', remove: 'Удалить неиспользуемую запись', back: 'Вернуться к редактированию',
    description: 'Требуется причина. Изменения сохраняются с неизменяемым аудитом до/после. Деактивация сохраняет связанную историю.',
    deleteDescription: 'Удаляются только неиспользуемые записи. Назначенные сотрудники, финансовые записи и филиалы препятствуют удалению. Используйте деактивацию.',
    saved: 'Изменение справочника сохранено', failed: 'Изменение не подтверждено', invalid: 'Укажите код, английское название и причину длиной 3–2000 символов.',
    stale: 'Запись изменена. Закройте окно, обновите справочник и откройте запись заново.',
    unconfirmed: 'Ответ не подтвердил изменение. Обновите справочник перед повторной попыткой.', refreshFailed: 'Сохранено, но обновить справочник не удалось. Перезагрузите страницу.',
    empty: 'Филиалы не зарегистрированы.', loadFailed: 'Не удалось загрузить справочник.', refresh: 'Обновить', status: 'Статус', actions: 'Действия',
  },
  tj: {
    bank: 'Бонк', branch: 'Филиал', addBank: 'Иловаи бонк', editBank: 'Таҳрири бонк', addBranch: 'Иловаи филиал', editBranch: 'Таҳрири филиал',
    branches: 'Филиалҳо', code: 'Рамз', name_en: 'Ном (англисӣ)', name_ru: 'Ном (русӣ)', name_tj: 'Ном (тоҷикӣ)', city: 'Шаҳр', district: 'Ноҳия',
    active: 'Фаъол', inactive: 'Ғайрифаъол', reason: 'Сабаби тағйирот', confirm: 'Ин тағйирот ва сабаби онро тасдиқ мекунам.',
    save: 'Сабт кардан', saving: 'Сабт шуда истодааст…', cancel: 'Бекор кардан', edit: 'Таҳрир', remove: 'Ҳазфи сабти истифоданашуда', back: 'Бозгашт ба таҳрир',
    description: 'Сабаб ҳатмист. Тағйирот бо аудити тағйирнопазири пеш ва пас сабт мешаванд. Ғайрифаъолсозӣ таърихи алоқамандро нигоҳ медорад.',
    deleteDescription: 'Танҳо сабтҳои истифоданашуда ҳазф мешаванд. Кормандон, сабтҳои молиявӣ ва филиалҳо ҳазфро манъ мекунанд. Онҳоро ғайрифаъол кунед.',
    saved: 'Тағйироти маълумотнома сабт шуд', failed: 'Тағйирот тасдиқ нашуд', invalid: 'Рамз, номи англисӣ ва сабаби аз 3 то 2000 аломат заруранд.',
    stale: 'Сабт тағйир ёфт. Равзанаро пӯшед, маълумотномаро нав кунед ва сабтро боз кушоед.',
    unconfirmed: 'Ҷавоб тағйиротро тасдиқ накард. Пеш аз такрор маълумотномаро нав кунед.', refreshFailed: 'Сабт шуд, вале навсозӣ ноком шуд. Саҳифаро аз нав бор кунед.',
    empty: 'Филиалҳо сабт нашудаанд.', loadFailed: 'Боркунии маълумотнома ноком шуд.', refresh: 'Навсозӣ', status: 'Ҳолат', actions: 'Амалҳо',
  },
} as const
